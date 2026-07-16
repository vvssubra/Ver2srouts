/**
 * Dispute & Locked Funds Service.
 * Manages payment disputes, reversal requests, and fund locking.
 *
 * Architecture:
 * - payment_disputes table tracks dispute lifecycle
 * - Disputes create ledger entries: dispute_locked (debit) on creation,
 *   dispute_released (credit) on resolution
 * - Approved reversals delegate to payment-service.reversePayment()
 *   (centralized service — never bypass)
 * - All mutations write to ledger + audit via ledger-core
 * - Collections summaries are derived from billing_ledger (SSOT),
 *   never from invoices.amount_paid
 *
 * Reason codes:
 * - bounced_cheque, duplicate_payment, disputed_transaction,
 *   mistaken_allocation, fraud_review, gateway_dispute, other
 *
 * Statuses: open → under_review → won | lost | resolved
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";
import { reversePayment } from "./payment-service";

// ─── Types ───────────────────────────────────────────────────────────────────

export const DISPUTE_REASON_CODES = [
  { value: "bounced_cheque", label: "Bounced Cheque" },
  { value: "duplicate_payment", label: "Duplicate Payment" },
  { value: "disputed_transaction", label: "Disputed Transaction" },
  { value: "mistaken_allocation", label: "Mistaken Allocation" },
  { value: "fraud_review", label: "Fraud Review" },
  { value: "gateway_dispute", label: "Gateway Dispute (BillPlz)" },
  { value: "other", label: "Other" },
] as const;

export const DISPUTE_STATUSES = [
  { value: "open", label: "Open", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "under_review", label: "Under Review", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "won", label: "Won (Funds Secured)", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "lost", label: "Lost (Funds Reversed)", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "resolved", label: "Resolved", color: "bg-muted text-muted-foreground border-border" },
] as const;

export interface PaymentDispute {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  branch_id: string;
  payer_account_id: string | null;
  dispute_type: string;
  reason: string;
  reason_code: string;
  disputed_amount: number;
  description: string | null;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  gateway_dispute_id: string | null;
  gateway_status: string | null;
  requested_by: string;
  requested_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve payer_account_id from the invoice linked to a payment */
async function resolvePayerAccountId(invoiceId: string | null): Promise<string | null> {
  if (!invoiceId) return null;
  const { data } = await supabase
    .from("invoices")
    .select("payer_account_id")
    .eq("id", invoiceId)
    .single();
  return data?.payer_account_id || null;
}

/** Resolve invoice_number for audit trails */
async function resolveInvoiceNumber(invoiceId: string | null): Promise<string> {
  if (!invoiceId) return "N/A";
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .single();
  return data?.invoice_number || invoiceId.slice(0, 8);
}

// ─── Create Dispute / Reversal Request ───────────────────────────────────────

export async function createDispute(params: {
  paymentId: string;
  invoiceId: string | null;
  branchId: string;
  payerAccountId?: string | null;
  disputeType: "reversal_request" | "gateway_dispute";
  reason: string;
  reasonCode: string;
  disputedAmount: number;
  description?: string;
  actorId: string;
  actorName: string;
}): Promise<string> {
  if (params.disputedAmount <= 0) throw new Error("Disputed amount must be positive");
  if (!params.reason.trim()) throw new Error("Reason is required");

  // Resolve payer_account_id if not provided
  const payerAccountId = params.payerAccountId ?? await resolvePayerAccountId(params.invoiceId);

  // Check for existing open dispute on same payment
  const { data: existing } = await supabase
    .from("payment_disputes")
    .select("id")
    .eq("payment_id", params.paymentId)
    .in("status", ["open", "under_review"])
    .limit(1);
  if (existing && existing.length > 0) {
    throw new Error("An active dispute already exists for this payment");
  }

  // Create dispute record (cast to any for payer_account_id column added via migration)
  const disputeRow: Record<string, unknown> = {
    payment_id: params.paymentId,
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    payer_account_id: payerAccountId,
    dispute_type: params.disputeType,
    reason: params.reason,
    reason_code: params.reasonCode,
    disputed_amount: params.disputedAmount,
    description: params.description || null,
    status: "open",
    requested_by: params.actorId,
    requested_by_name: params.actorName,
  };
  const { data: dispute, error } = await supabase
    .from("payment_disputes")
    .insert(disputeRow as any)
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create dispute: ${error.message}`);

  // Lock funds in ledger (debit = reduces secured cash)
  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: payerAccountId,
    invoice_id: params.invoiceId,
    payment_id: params.paymentId,
    entry_type: "dispute_locked",
    debit: params.disputedAmount,
    description: `Funds locked: ${params.reason}`,
    created_by: params.actorId,
    metadata: {
      dispute_id: dispute.id,
      reason_code: params.reasonCode,
      dispute_type: params.disputeType,
    },
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "dispute",
    entity_id: dispute.id,
    action: "dispute_opened",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      payment_id: params.paymentId,
      invoice_id: params.invoiceId,
      payer_account_id: payerAccountId,
      disputed_amount: params.disputedAmount,
      reason: params.reason,
      reason_code: params.reasonCode,
    },
  });

  return dispute.id;
}

// ─── Resolve Dispute ─────────────────────────────────────────────────────────

export async function resolveDispute(params: {
  disputeId: string;
  resolution: "won" | "lost" | "resolved";
  resolutionNotes: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  if (!params.resolutionNotes.trim()) throw new Error("Resolution notes are required");

  // Fetch dispute
  const { data: dispute, error: fetchErr } = await supabase
    .from("payment_disputes")
    .select("*")
    .eq("id", params.disputeId)
    .single();
  if (fetchErr || !dispute) throw new Error("Dispute not found");
  if (!["open", "under_review"].includes(dispute.status)) {
    throw new Error("This dispute has already been resolved");
  }

  // Resolve payer_account_id from stored value or invoice lookup
  const payerAccountId = (dispute as any).payer_account_id ?? await resolvePayerAccountId(dispute.invoice_id);

  // Update dispute record
  const { error: updateErr } = await supabase
    .from("payment_disputes")
    .update({
      status: params.resolution,
      resolution: params.resolutionNotes,
      resolved_at: new Date().toISOString(),
      resolved_by: params.actorId,
    })
    .eq("id", params.disputeId);
  if (updateErr) throw new Error(`Failed to resolve dispute: ${updateErr.message}`);

  if (params.resolution === "won") {
    // Funds secured — release the lock (credit = restores secured cash)
    await writeLedgerEntry({
      branch_id: dispute.branch_id,
      payer_account_id: payerAccountId,
      invoice_id: dispute.invoice_id,
      payment_id: dispute.payment_id,
      entry_type: "dispute_released",
      credit: dispute.disputed_amount,
      description: `Dispute won — funds secured: ${params.resolutionNotes}`,
      created_by: params.actorId,
      metadata: { dispute_id: dispute.id, resolution: "won" },
    });
  } else if (params.resolution === "lost") {
    // Step 1: Release the lock (compensating entry for dispute_locked)
    await writeLedgerEntry({
      branch_id: dispute.branch_id,
      payer_account_id: payerAccountId,
      invoice_id: dispute.invoice_id,
      payment_id: dispute.payment_id,
      entry_type: "dispute_released",
      credit: dispute.disputed_amount,
      description: `Dispute lost — lock released: ${params.resolutionNotes}`,
      created_by: params.actorId,
      metadata: { dispute_id: dispute.id, resolution: "lost" },
    });

    // Step 2: Delegate to centralized reversePayment() — never bypass
    if (dispute.invoice_id) {
      const invoiceNumber = await resolveInvoiceNumber(dispute.invoice_id);

      // Fetch original payment method for audit trail
      const { data: origPayment } = await supabase
        .from("payments")
        .select("payment_method, payment_reference")
        .eq("id", dispute.payment_id)
        .single();

      await reversePayment({
        paymentId: dispute.payment_id,
        invoiceId: dispute.invoice_id,
        branchId: dispute.branch_id,
        invoiceNumber,
        payerAccountId,
        originalAmount: dispute.disputed_amount,
        originalMethod: origPayment?.payment_method || "dispute_reversal",
        originalReference: origPayment?.payment_reference || `DSP-${dispute.id.slice(0, 8)}`,
        reason: `Dispute lost: ${params.resolutionNotes}`,
        actorId: params.actorId,
        actorName: params.actorName,
      });
    }
  } else {
    // Resolved (neutral) — just release the lock
    await writeLedgerEntry({
      branch_id: dispute.branch_id,
      payer_account_id: payerAccountId,
      invoice_id: dispute.invoice_id,
      payment_id: dispute.payment_id,
      entry_type: "dispute_released",
      credit: dispute.disputed_amount,
      description: `Dispute resolved: ${params.resolutionNotes}`,
      created_by: params.actorId,
      metadata: { dispute_id: dispute.id, resolution: "resolved" },
    });
  }

  await writeAuditEntry({
    branch_id: dispute.branch_id,
    entity_type: "dispute",
    entity_id: dispute.id,
    action: `dispute_${params.resolution}`,
    actor_id: params.actorId,
    actor_name: params.actorName,
    old_values: { status: dispute.status },
    new_values: {
      status: params.resolution,
      resolution: params.resolutionNotes,
      disputed_amount: dispute.disputed_amount,
    },
  });
}

// ─── Update Status (e.g. move to under_review) ──────────────────────────────

export async function updateDisputeStatus(params: {
  disputeId: string;
  newStatus: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  const { data: dispute } = await supabase
    .from("payment_disputes")
    .select("status, branch_id")
    .eq("id", params.disputeId)
    .single();
  if (!dispute) throw new Error("Dispute not found");

  const { error } = await supabase
    .from("payment_disputes")
    .update({ status: params.newStatus })
    .eq("id", params.disputeId);
  if (error) throw new Error(`Status update failed: ${error.message}`);

  await writeAuditEntry({
    branch_id: dispute.branch_id,
    entity_type: "dispute",
    entity_id: params.disputeId,
    action: "dispute_status_changed",
    actor_id: params.actorId,
    actor_name: params.actorName,
    old_values: { status: dispute.status },
    new_values: { status: params.newStatus },
  });
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

export async function getDisputesForPayment(paymentId: string): Promise<PaymentDispute[]> {
  const { data } = await supabase
    .from("payment_disputes")
    .select("*")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false });
  return (data || []) as PaymentDispute[];
}

export async function getDisputesForInvoice(invoiceId: string): Promise<PaymentDispute[]> {
  const { data } = await supabase
    .from("payment_disputes")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  return (data || []) as PaymentDispute[];
}

export async function getActiveDisputesByBranch(branchIds: string[]): Promise<PaymentDispute[]> {
  if (branchIds.length === 0) return [];
  const { data } = await supabase
    .from("payment_disputes")
    .select("*")
    .in("branch_id", branchIds)
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: false });
  return (data || []) as PaymentDispute[];
}

export async function getAllDisputes(branchIds: string[]): Promise<PaymentDispute[]> {
  if (branchIds.length === 0) return [];
  const { data } = await supabase
    .from("payment_disputes")
    .select("*")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false });
  return (data || []) as PaymentDispute[];
}

// ─── Ledger-Derived Risk Summaries (SSOT) ────────────────────────────────────

/**
 * Calculate locked/disputed amounts for an invoice from the LEDGER,
 * not from invoices.amount_paid. This ensures consistency with the
 * immutable ledger as the single source of truth.
 */
export async function getInvoiceRiskSummary(invoiceId: string): Promise<{
  disputedAmount: number;
  securedAmount: number;
  hasLockedFunds: boolean;
  activeDisputes: number;
}> {
  // Active disputes from the disputes table (status tracking)
  const { data: disputes } = await supabase
    .from("payment_disputes")
    .select("disputed_amount, status")
    .eq("invoice_id", invoiceId)
    .in("status", ["open", "under_review"]);

  const activeDisputes = disputes || [];
  const disputedAmount = activeDisputes.reduce((s, d) => s + Number(d.disputed_amount), 0);

  // Derive total paid from LEDGER (credit entries minus debit entries for this invoice)
  const { data: ledgerEntries } = await supabase
    .from("billing_ledger")
    .select("credit, debit, entry_type")
    .eq("invoice_id", invoiceId)
    .in("entry_type", ["payment_received", "payment_reversed", "allocation_applied", "allocation_reversed"]);

  const totalPaid = (ledgerEntries || []).reduce((sum, e) => {
    return sum + (Number(e.credit) || 0) - (Number(e.debit) || 0);
  }, 0);

  const securedAmount = Math.max(0, totalPaid - disputedAmount);

  return {
    disputedAmount,
    securedAmount,
    hasLockedFunds: disputedAmount > 0,
    activeDisputes: activeDisputes.length,
  };
}

/**
 * Branch-level collections risk summary derived from billing_ledger (SSOT).
 * Supports multi-branch queries for dashboard use.
 */
export async function getBranchCollectionsSummary(branchIds: string[]): Promise<{
  grossCollections: number;
  lockedFunds: number;
  securedCollections: number;
  netCollectible: number;
  activeDisputeCount: number;
}> {
  if (branchIds.length === 0) {
    return { grossCollections: 0, lockedFunds: 0, securedCollections: 0, netCollectible: 0, activeDisputeCount: 0 };
  }

  // Gross collections from ledger: sum of payment_received credits
  const { data: paymentEntries } = await supabase
    .from("billing_ledger")
    .select("credit, debit, entry_type")
    .in("branch_id", branchIds)
    .in("entry_type", ["payment_received", "payment_reversed", "allocation_applied", "allocation_reversed"]);

  const grossCollections = (paymentEntries || []).reduce((sum, e) => {
    return sum + (Number(e.credit) || 0) - (Number(e.debit) || 0);
  }, 0);

  // Locked funds from active disputes
  const { data: disputes } = await supabase
    .from("payment_disputes")
    .select("disputed_amount")
    .in("branch_id", branchIds)
    .in("status", ["open", "under_review"]);

  const lockedFunds = (disputes || []).reduce((s, d) => s + Number(d.disputed_amount), 0);

  return {
    grossCollections: Math.max(0, grossCollections),
    lockedFunds,
    securedCollections: Math.max(0, grossCollections - lockedFunds),
    netCollectible: Math.max(0, grossCollections - lockedFunds),
    activeDisputeCount: (disputes || []).length,
  };
}
