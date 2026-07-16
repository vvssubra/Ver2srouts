import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * BillPlz Webhook Handler
 *
 * Receives webhook callbacks from BillPlz when bill status changes.
 * Implements idempotent processing to prevent duplicate payments.
 *
 * Architecture alignment:
 * - Immutable ledger: all financial writes are append-only (no updates/deletes)
 * - Overpayment → wallet credit via `wallet_credit_overpayment` ledger entry
 * - Gateway metadata carried through to ledger for reconciliation
 * - Dispute-ready: payment metadata includes all gateway identifiers
 * - Allocation-ready: payments linked directly to invoice (1:1 from webhook)
 *
 * Flow:
 * 1. Validate & parse webhook payload
 * 2. Idempotency check (skip if already processed)
 * 3. Log gateway event
 * 4. If paid: calculate outstanding, create payment, write ledger + audit
 * 5. Handle overpayment excess → wallet credit
 * 6. Upsert gateway_transaction for reconciliation
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildIdempotencyKey(billId: string, eventType: string, transactionId: string): string {
  return `billplz:${billId}:${eventType}:${transactionId || "no-txn"}`;
}

/**
 * Verify BillPlz X-Signature per spec:
 * Concatenate all callback fields (except `x_signature`) as `key`+value pairs,
 * sorted alphabetically by key, joined with `|`, then HMAC-SHA256 with the
 * X-Signature key. Compare against payload.x_signature.
 * https://www.billplz.com/api#x-signature
 */
async function verifyBillplzSignature(
  payload: Record<string, string>,
  signatureKey: string,
): Promise<boolean> {
  const provided = payload.x_signature;
  if (!provided || !signatureKey) return false;

  const keys = Object.keys(payload)
    .filter((k) => k !== "x_signature")
    .sort();
  const source = keys.map((k) => `${k}${payload[k] ?? ""}`).join("|");

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(source));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === provided.toLowerCase();
}

function buildGatewayMetadata(payload: Record<string, string>, billId: string, collectionId: string | null, transactionId: string) {
  return {
    gateway: "billplz",
    bill_id: billId,
    collection_id: collectionId,
    transaction_id: transactionId,
    raw_state: payload.state,
    url: payload.url,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // ── 1. Parse Payload ──────────────────────────────────────────────────
    let payload: Record<string, string>;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    } else {
      payload = await req.json();
    }

    // ── 1a. Signature Verification (BillPlz X-Signature) ─────────────────
    // Reject any callback that isn't signed with our BillPlz signature key.
    const signatureKey = Deno.env.get("BILLPLZ_SIGNATURE_KEY") ?? "";
    if (!signatureKey) {
      console.error("BILLPLZ_SIGNATURE_KEY not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const signatureValid = await verifyBillplzSignature(payload, signatureKey);
    if (!signatureValid) {
      console.warn("BillPlz webhook signature verification failed", {
        bill_id: payload.id || payload.bill_id,
      });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const billId = payload.id || payload.bill_id;
    const paid = payload.paid === "true" || payload.paid === true;
    const paidAmount = parseFloat(payload.paid_amount || payload.amount || "0") / 100; // BillPlz uses cents
    const transactionId = payload.transaction_id || payload.x_signature || "";
    const paidAt = payload.paid_at || null;
    const collectionId = payload.collection_id || null;
    const eventType = paid ? "bill.paid" : "bill.updated";

    if (!billId) {
      return new Response(JSON.stringify({ error: "Missing bill_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Idempotency Check ──────────────────────────────────────────────
    const idempotencyKey = buildIdempotencyKey(billId, eventType, transactionId);

    const { data: existing } = await adminClient
      .from("gateway_events")
      .select("id, processing_status, retry_count")
      .eq("idempotency_key", idempotencyKey)
      .limit(1);

    if (existing && existing.length > 0) {
      const evt = existing[0];
      if (evt.processing_status === "processed") {
        return new Response(JSON.stringify({ status: "skipped", reason: "already_processed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient
        .from("gateway_events")
        .update({ retry_count: ((evt as any).retry_count || 0) + 1 })
        .eq("id", evt.id);
    }

    // ── 3. Resolve Invoice & Branch ───────────────────────────────────────
    const invoiceId = payload.metadata_invoice_id || payload.reference_1 || null;
    let branchId: string | null = null;
    let payerAccountId: string | null = null;
    let invoiceNumber: string | null = null;
    let invoiceTotalAmount = 0;
    let invoiceAmountPaid = 0;
    let invoiceStatus: string | null = null;

    if (invoiceId) {
      const { data: inv } = await adminClient
        .from("invoices")
        .select("id, branch_id, payer_account_id, invoice_number, status, total_amount, amount_paid")
        .eq("id", invoiceId)
        .single();

      if (inv) {
        branchId = inv.branch_id;
        payerAccountId = inv.payer_account_id;
        invoiceNumber = inv.invoice_number;
        invoiceTotalAmount = Number(inv.total_amount) || 0;
        invoiceAmountPaid = Number(inv.amount_paid) || 0;
        invoiceStatus = inv.status;
      }
    }

    // Fallback: resolve branch from existing gateway_transaction
    if (!branchId) {
      const { data: existingTxn } = await adminClient
        .from("gateway_transactions")
        .select("branch_id, invoice_id")
        .eq("bill_id", billId)
        .limit(1);
      if (existingTxn && existingTxn.length > 0) {
        branchId = existingTxn[0].branch_id;
      }
    }

    if (!branchId) {
      await adminClient.from("gateway_events").insert({
        branch_id: "00000000-0000-0000-0000-000000000000",
        gateway: "billplz",
        event_type: eventType,
        event_id: transactionId || billId,
        bill_id: billId,
        collection_id: collectionId,
        raw_payload: payload,
        processing_status: "failed",
        processing_error: "Could not determine branch_id from invoice or existing transactions",
        idempotency_key: idempotencyKey,
      } as any);

      return new Response(JSON.stringify({ status: "failed", reason: "branch_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Log Gateway Event ──────────────────────────────────────────────
    const { data: eventRow } = await adminClient.from("gateway_events").insert({
      branch_id: branchId,
      gateway: "billplz",
      event_type: eventType,
      event_id: transactionId || billId,
      bill_id: billId,
      collection_id: collectionId,
      invoice_id: invoiceId,
      raw_payload: payload,
      processing_status: "processing",
      idempotency_key: idempotencyKey,
    } as any).select("id").single();

    let paymentId: string | null = null;
    let walletCreditAmount = 0;
    const gwMeta = buildGatewayMetadata(payload, billId, collectionId, transactionId);

    // ── 5. Process Payment ────────────────────────────────────────────────
    if (paid && paidAmount > 0 && invoiceId) {
      // 5a. Duplicate payment check (idempotent by BillPlz bill_id)
      const { data: existingPayment } = await adminClient
        .from("payments")
        .select("id")
        .eq("payment_reference", `BPZ-${billId}`)
        .limit(1);

      if (existingPayment && existingPayment.length > 0) {
        paymentId = existingPayment[0].id;
        await adminClient.from("gateway_events").update({
          payment_id: paymentId,
          processing_status: "skipped",
          processing_error: "Payment already exists for this bill",
          processed_at: new Date().toISOString(),
        } as any).eq("id", eventRow?.id);
      } else {
        // 5b. Calculate amounts — respect outstanding balance to avoid trigger rejection
        const outstandingBalance = Math.max(invoiceTotalAmount - invoiceAmountPaid, 0);

        // Guard: don't create payment if invoice is cancelled or already paid
        if (invoiceStatus === "cancelled") {
          await adminClient.from("gateway_events").update({
            processing_status: "failed",
            processing_error: "Invoice is cancelled; payment cannot be applied",
            processed_at: new Date().toISOString(),
          } as any).eq("id", eventRow?.id);

          return new Response(JSON.stringify({ status: "failed", reason: "invoice_cancelled" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Amount applied to invoice (capped at outstanding balance)
        const amountToApply = Math.min(paidAmount, outstandingBalance);
        // Excess goes to wallet
        const excessAmount = Math.round((paidAmount - amountToApply) * 100) / 100;

        // 5c. Create payment record (triggers sync_invoice_from_payments)
        if (amountToApply > 0) {
          const { data: newPayment, error: payErr } = await adminClient
            .from("payments")
            .insert({
              invoice_id: invoiceId,
              amount: amountToApply,
              payment_date: paidAt ? paidAt.split("T")[0] : new Date().toISOString().split("T")[0],
              payment_method: "billplz",
              payment_reference: `BPZ-${billId}`,
              notes: `BillPlz FPX payment — Transaction: ${transactionId}`,
              received_by: null, // System/gateway payment
            })
            .select("id")
            .single();

          if (payErr) {
            await adminClient.from("gateway_events").update({
              processing_status: "failed",
              processing_error: `Payment creation failed: ${payErr.message}`,
              processed_at: new Date().toISOString(),
            } as any).eq("id", eventRow?.id);

            return new Response(JSON.stringify({ status: "failed", reason: payErr.message }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          paymentId = newPayment.id;

          // 5d. Immutable ledger: payment_received entry
          await adminClient.from("billing_ledger").insert({
            branch_id: branchId,
            invoice_id: invoiceId,
            payment_id: paymentId,
            payer_account_id: payerAccountId,
            entry_type: "payment_received",
            credit: amountToApply,
            debit: 0,
            description: `BillPlz FPX payment for ${invoiceNumber || invoiceId}`,
            reference_number: `BPZ-${billId}`,
            metadata: {
              ...gwMeta,
              applied_amount: amountToApply,
              gateway_total: paidAmount,
              excess_to_wallet: excessAmount,
            },
          });
        } else {
          // Full amount is excess (invoice already paid between bill creation and callback)
          // Create payment with invoice_id = null (unallocated source)
          const { data: newPayment, error: payErr } = await adminClient
            .from("payments")
            .insert({
              invoice_id: null,
              amount: paidAmount,
              payment_date: paidAt ? paidAt.split("T")[0] : new Date().toISOString().split("T")[0],
              payment_method: "billplz",
              payment_reference: `BPZ-${billId}`,
              notes: `BillPlz FPX payment — Invoice ${invoiceNumber} already settled; full amount to wallet`,
              received_by: null,
            })
            .select("id")
            .single();

          if (payErr) {
            await adminClient.from("gateway_events").update({
              processing_status: "failed",
              processing_error: `Unallocated payment creation failed: ${payErr.message}`,
              processed_at: new Date().toISOString(),
            } as any).eq("id", eventRow?.id);

            return new Response(JSON.stringify({ status: "failed", reason: payErr.message }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          paymentId = newPayment.id;
        }

        // 5e. Wallet credit for overpayment excess (immutable ledger entry)
        if (excessAmount > 0 && payerAccountId) {
          walletCreditAmount = excessAmount;

          await adminClient.from("billing_ledger").insert({
            branch_id: branchId,
            payer_account_id: payerAccountId,
            invoice_id: invoiceId,
            payment_id: paymentId,
            entry_type: "wallet_credit_overpayment",
            credit: excessAmount,
            debit: 0,
            description: `Overpayment credit from BillPlz payment on ${invoiceNumber || invoiceId}`,
            reference_number: `BPZ-${billId}`,
            metadata: {
              ...gwMeta,
              source: "overpayment",
              invoice_amount: invoiceTotalAmount,
              gateway_amount: paidAmount,
              applied_to_invoice: paidAmount - excessAmount,
            },
          });
        }

        // 5f. Audit trail — single comprehensive entry
        await adminClient.from("billing_audit_logs").insert({
          branch_id: branchId,
          entity_type: "payment",
          entity_id: invoiceId,
          action: "webhook_payment",
          actor_name: "BillPlz Gateway",
          new_values: {
            payment_id: paymentId,
            gateway_amount: paidAmount,
            applied_to_invoice: paidAmount - (excessAmount || 0),
            wallet_credit: excessAmount || 0,
            method: "billplz",
            bill_id: billId,
            transaction_id: transactionId,
            collection_id: collectionId,
            payer_account_id: payerAccountId,
          },
        });

        // 5g. Mark event processed
        await adminClient.from("gateway_events").update({
          payment_id: paymentId,
          processing_status: "processed",
          processed_at: new Date().toISOString(),
        } as any).eq("id", eventRow?.id);
      }
    } else {
      // Non-payment event (status update, etc.) — mark processed
      await adminClient.from("gateway_events").update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      } as any).eq("id", eventRow?.id);
    }

    // ── 6. Upsert Gateway Transaction (Reconciliation) ───────────────────
    const { data: existingGwTxn } = await adminClient
      .from("gateway_transactions")
      .select("id")
      .eq("bill_id", billId)
      .limit(1);

    const gwTxnData = {
      gateway: "billplz",
      bill_id: billId,
      collection_id: collectionId,
      transaction_reference: transactionId,
      gateway_status: paid ? "paid" : (payload.state || "pending"),
      gateway_amount: paidAmount,
      gateway_paid_at: paidAt,
      branch_id: branchId,
      invoice_id: invoiceId,
      payment_id: paymentId,
      reconciliation_status: paymentId ? "matched" : "unmatched",
      metadata: {
        ...gwMeta,
        wallet_credit: walletCreditAmount > 0 ? walletCreditAmount : undefined,
        payer_account_id: payerAccountId,
      },
      updated_at: new Date().toISOString(),
    };

    if (existingGwTxn && existingGwTxn.length > 0) {
      await adminClient.from("gateway_transactions").update(gwTxnData as any).eq("id", existingGwTxn[0].id);
    } else {
      await adminClient.from("gateway_transactions").insert(gwTxnData as any);
    }

    return new Response(JSON.stringify({
      status: "ok",
      payment_id: paymentId,
      applied: paidAmount - walletCreditAmount,
      wallet_credit: walletCreditAmount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("BillPlz webhook error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 200, // Always 200 so BillPlz doesn't retry
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
