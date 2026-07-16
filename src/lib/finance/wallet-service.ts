/**
 * Wallet / Credit Balance operations.
 * All mutations write to billing_ledger + billing_audit_logs via ledger-core.
 *
 * Entry types used:
 * - wallet_credit_overpayment: excess from payment → wallet
 * - wallet_credit_cn: credit note converted → wallet
 * - wallet_admin_adjustment: manual admin top-up / deduction
 * - auto_offset: wallet used to settle an invoice (paired ledger entries)
 *
 * FUTURE:
 * - wallet_refund: wallet balance → bank refund
 * - wallet_expiry: time-limited credits
 * - dispute_hold / dispute_release
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";

// ─── Wallet Balance (derived from ledger — SSOT) ─────────────────────────────

/** All entry types that affect wallet balance */
export const WALLET_ENTRY_TYPES = [
  "wallet_credit_overpayment",
  "wallet_credit_cn",
  "wallet_admin_adjustment",
  "auto_offset",
  // Legacy compat
  "wallet_credit_from_overpayment",
  "wallet_credit_from_cn",
  "wallet_adjustment",
] as const;

export async function getWalletBalance(payerAccountId: string): Promise<{
  available: number;
  totalCredited: number;
  totalUsed: number;
  entries: Array<{
    id: string;
    entry_type: string;
    description: string | null;
    debit: number;
    credit: number;
    created_at: string | null;
    invoice_id: string | null;
    metadata: any;
  }>;
}> {
  const { data: entries } = await supabase
    .from("billing_ledger")
    .select("id, entry_type, description, debit, credit, created_at, invoice_id, metadata")
    .eq("payer_account_id", payerAccountId)
    .in("entry_type", [...WALLET_ENTRY_TYPES])
    .order("created_at", { ascending: true });

  const ledger = entries || [];
  let totalCredited = 0;
  let totalUsed = 0;

  ledger.forEach((e) => {
    totalCredited += e.credit || 0;
    totalUsed += e.debit || 0;
  });

  return {
    available: totalCredited - totalUsed,
    totalCredited,
    totalUsed,
    entries: ledger,
  };
}

// ─── Credit Wallet from Overpayment ──────────────────────────────────────────

export async function creditWalletFromOverpayment(params: {
  branchId: string;
  payerAccountId: string;
  invoiceId: string;
  invoiceNumber: string;
  excessAmount: number;
  actorId: string;
  actorName: string;
}) {
  if (params.excessAmount <= 0) throw new Error("Excess amount must be positive");

  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: params.payerAccountId,
    invoice_id: params.invoiceId,
    entry_type: "wallet_credit_overpayment",
    credit: params.excessAmount,
    description: `Overpayment credit from ${params.invoiceNumber}`,
    created_by: params.actorId,
    metadata: { source: "overpayment", invoice_number: params.invoiceNumber },
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "wallet",
    entity_id: params.payerAccountId,
    action: "wallet_credited_overpayment",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      amount: params.excessAmount,
      source: "overpayment",
      invoice_id: params.invoiceId,
    },
  });
}

// ─── Credit Wallet from Credit Note ──────────────────────────────────────────

export async function creditWalletFromCreditNote(params: {
  branchId: string;
  payerAccountId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  amount: number;
  actorId: string;
  actorName: string;
}) {
  if (params.amount <= 0) throw new Error("Credit amount must be positive");

  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: params.payerAccountId,
    entry_type: "wallet_credit_cn",
    credit: params.amount,
    description: `Credit note ${params.creditNoteNumber} converted to wallet credit`,
    created_by: params.actorId,
    metadata: { source: "credit_note", credit_note_id: params.creditNoteId },
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "wallet",
    entity_id: params.payerAccountId,
    action: "wallet_credited_cn",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      amount: params.amount,
      source: "credit_note",
      credit_note_id: params.creditNoteId,
      credit_note_number: params.creditNoteNumber,
    },
  });
}

// ─── Admin Wallet Adjustment ─────────────────────────────────────────────────

export async function adminWalletAdjustment(params: {
  branchId: string;
  payerAccountId: string;
  amount: number; // positive = credit, negative = debit
  reason: string;
  actorId: string;
  actorName: string;
}) {
  if (!params.reason.trim()) throw new Error("Reason is required for wallet adjustments");
  if (params.amount === 0) throw new Error("Adjustment amount cannot be zero");

  const isCredit = params.amount > 0;

  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: params.payerAccountId,
    entry_type: "wallet_admin_adjustment",
    credit: isCredit ? Math.abs(params.amount) : 0,
    debit: isCredit ? 0 : Math.abs(params.amount),
    description: `Admin adjustment: ${params.reason}`,
    created_by: params.actorId,
    metadata: { source: "admin_adjustment", reason: params.reason },
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "wallet",
    entity_id: params.payerAccountId,
    action: "wallet_adjusted",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason,
    new_values: {
      amount: params.amount,
      direction: isCredit ? "credit" : "debit",
    },
  });
}

// ─── Auto-Offset (Apply Wallet Credit to Invoice) ───────────────────────────
// This creates PAIRED ledger entries (double-entry):
//   1. auto_offset DEBIT on wallet (reduces wallet balance)
//   2. payment_received CREDIT on invoice (reduces receivable)
// Plus a payments table row to trigger invoice status recalculation.

export async function applyWalletToInvoice(params: {
  branchId: string;
  payerAccountId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  actorId: string;
  actorName: string;
}) {
  if (params.amount <= 0) throw new Error("Offset amount must be positive");

  // Verify wallet has sufficient balance
  const wallet = await getWalletBalance(params.payerAccountId);
  if (wallet.available < params.amount - 0.01) {
    throw new Error(`Insufficient wallet balance. Available: RM ${wallet.available.toFixed(2)}`);
  }

  // Idempotency: check for existing auto_offset for this invoice+payer in last 5 seconds
  const { data: recentOffset } = await supabase
    .from("billing_ledger")
    .select("id")
    .eq("invoice_id", params.invoiceId)
    .eq("payer_account_id", params.payerAccountId)
    .eq("entry_type", "auto_offset")
    .gte("created_at", new Date(Date.now() - 5000).toISOString())
    .limit(1);
  if (recentOffset && recentOffset.length > 0) {
    throw new Error("A wallet offset was just applied to this invoice. Please refresh and try again.");
  }

  // 1. Debit wallet (reduces wallet balance)
  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: params.payerAccountId,
    invoice_id: params.invoiceId,
    entry_type: "auto_offset",
    debit: params.amount,
    description: `Wallet credit applied to ${params.invoiceNumber}`,
    created_by: params.actorId,
    metadata: { source: "auto_offset", invoice_number: params.invoiceNumber },
  });

  // 2. Credit receivable (reduces outstanding balance on invoice)
  await writeLedgerEntry({
    branch_id: params.branchId,
    payer_account_id: params.payerAccountId,
    invoice_id: params.invoiceId,
    entry_type: "payment_received",
    credit: params.amount,
    description: `Wallet offset payment for ${params.invoiceNumber}`,
    reference_number: `WLT-${params.payerAccountId.slice(0, 8)}`,
    created_by: params.actorId,
    metadata: { source: "wallet_offset", wallet_payer_account_id: params.payerAccountId },
  });

  // 3. Record as payment in payments table so invoice status updates via DB trigger
  const { error: payErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: params.invoiceId,
      amount: params.amount,
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: "wallet",
      payment_reference: `WLT-${params.payerAccountId.slice(0, 8)}`,
      notes: `Auto-offset from wallet credit`,
      received_by: params.actorId,
    });
  if (payErr) throw new Error(`Wallet offset payment failed: ${payErr.message}`);

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "wallet",
    entity_id: params.payerAccountId,
    action: "wallet_offset_applied",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      amount: params.amount,
      invoice_id: params.invoiceId,
      invoice_number: params.invoiceNumber,
    },
  });

  return params.amount;
}
