/**
 * Payment operations: record payment, reverse payment.
 * All mutations write to ledger + audit via ledger-core.
 *
 * FUTURE EXTENSION POINTS:
 * - Wallet/Credit: After payment, check for overpayment → credit to wallet
 * - Allocation Engine: Replace direct invoice_id with payment_allocations table
 * - BillPlz: Add gateway_event_id to ledger entries for reconciliation
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";

// ─── Record Payment ──────────────────────────────────────────────────────────

export async function recordPayment(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  payerAccountId?: string | null;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  paymentReference?: string | null;
  notes?: string | null;
  actorId: string;
  actorName: string;
}) {
  if (params.amount <= 0) throw new Error("Payment amount must be greater than zero");

  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("total_amount, amount_paid, status")
    .eq("id", params.invoiceId)
    .single();
  if (fetchErr || !invoice) throw new Error("Invoice not found");
  if (invoice.status === "cancelled") throw new Error("Cannot pay a cancelled invoice");
  if (invoice.status === "paid") throw new Error("Invoice is already fully paid");
  if (invoice.status === "draft") throw new Error("Cannot record payment against a draft invoice. Issue it first.");

  const balance = invoice.total_amount - (invoice.amount_paid || 0);
  if (params.amount > balance + 0.01) {
    throw new Error(`Payment of RM ${params.amount.toFixed(2)} exceeds balance of RM ${balance.toFixed(2)}`);
  }

  // FUTURE: Replace with payment_allocations for N:N support
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: params.invoiceId,
      amount: params.amount,
      payment_date: params.paymentDate,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference || null,
      notes: params.notes || null,
      received_by: params.actorId,
    })
    .select("id")
    .single();
  if (payErr) throw new Error(`Payment failed: ${payErr.message}`);

  // FUTURE: If amount > balance, excess goes to wallet via "wallet_credit" entry
  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payment_id: payment.id,
    payer_account_id: params.payerAccountId,
    entry_type: "payment_received",
    credit: params.amount,
    description: `Payment received for ${params.invoiceNumber} via ${params.paymentMethod}`,
    reference_number: params.paymentReference,
    created_by: params.actorId,
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "payment",
    entity_id: params.invoiceId,
    action: "payment_recorded",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      payment_id: payment.id,
      amount: params.amount,
      method: params.paymentMethod,
      reference: params.paymentReference,
      payment_date: params.paymentDate,
    },
  });

  return payment.id;
}

// ─── Reverse Payment (Immutable) ─────────────────────────────────────────────

export async function reversePayment(params: {
  paymentId: string;
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  payerAccountId?: string | null;
  originalAmount: number;
  originalMethod: string;
  originalReference?: string | null;
  reason: string;
  actorId: string;
  actorName: string;
  /** Links this reversal to its approval request for audit traceability */
  approvalRequestId?: string | null;
}) {
  if (!params.reason.trim()) throw new Error("A reason is required for payment reversals");

  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, amount, invoice_id")
    .eq("id", params.paymentId)
    .single();
  if (fetchErr || !payment) throw new Error("Payment not found");

  // Check if already reversed
  const { data: existingReversal } = await supabase
    .from("billing_ledger")
    .select("id")
    .eq("payment_id", params.paymentId)
    .eq("entry_type", "payment_reversed")
    .limit(1);
  if (existingReversal && existingReversal.length > 0) {
    throw new Error("This payment has already been reversed");
  }

  // Insert compensating payment (keeps original intact, DB trigger recalculates)
  const { data: reversalPayment, error: revErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: params.invoiceId,
      amount: -params.originalAmount,
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: params.originalMethod,
      payment_reference: `REV-${params.originalReference || params.paymentId.slice(0, 8)}`,
      notes: `Reversal: ${params.reason}`,
      received_by: params.actorId,
    })
    .select("id")
    .single();
  if (revErr) throw new Error(`Reversal record failed: ${revErr.message}`);

  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payment_id: params.paymentId,
    payer_account_id: params.payerAccountId,
    entry_type: "payment_reversed",
    debit: params.originalAmount,
    description: `Payment reversal for ${params.invoiceNumber} — ${params.reason}`,
    reference_number: `REV-${params.originalReference || params.paymentId.slice(0, 8)}`,
    created_by: params.actorId,
    metadata: {
      original_payment_id: params.paymentId,
      reversal_payment_id: reversalPayment.id,
      ...(params.approvalRequestId ? { approval_request_id: params.approvalRequestId } : {}),
    },
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "payment",
    entity_id: params.invoiceId,
    action: "payment_reversed",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason,
    old_values: {
      payment_id: params.paymentId,
      amount: params.originalAmount,
      method: params.originalMethod,
    },
    new_values: {
      reversal_payment_id: reversalPayment.id,
      original_amount: params.originalAmount,
    },
  });

  return reversalPayment.id;
}
