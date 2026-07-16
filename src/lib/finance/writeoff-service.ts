/**
 * Write-Off & Recovery Service.
 * 
 * Immutable ledger operations for bad-debt write-offs and post-write-off recoveries.
 * 
 * Key principles:
 * - Write-offs create a credit entry in billing_ledger (reduces receivable)
 * - Recoveries create a debit entry (reverses part/all of write-off)
 * - Recovery is capped at the net write-off amount (idempotency guard)
 * - Neither operation deletes or mutates existing ledger entries
 * - Both require approval via the governance engine when rules match
 * - Collection metadata on invoice_collections is a cache; ledger is SSOT
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";

// ─── Write-Off ───────────────────────────────────────────────────────────────

export async function executeWriteOff(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  payerAccountId: string | null;
  amount: number;
  reason: string;
  reasonCode: string;
  approvalRequestId?: string;
  actorId: string;
  actorName: string;
}) {
  if (params.amount <= 0) throw new Error("Write-off amount must be positive");

  // Idempotency: check total existing write-offs vs invoice outstanding
  const { data: existingEntries } = await supabase
    .from("billing_ledger")
    .select("credit")
    .eq("invoice_id", params.invoiceId)
    .eq("entry_type", "write_off");

  const existingWriteOffTotal = (existingEntries ?? []).reduce(
    (sum: number, e: any) => sum + (e.credit || 0), 0
  );

  // Get invoice outstanding to validate
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total_amount, amount_paid")
    .eq("id", params.invoiceId)
    .single();

  if (invoice) {
    const outstanding = invoice.total_amount - (invoice.amount_paid || 0);
    const remaining = outstanding - existingWriteOffTotal;
    if (params.amount > remaining + 0.01) {
      throw new Error(
        `Write-off of ${params.amount} exceeds remaining writable balance of ${remaining.toFixed(2)}`
      );
    }
  }

  // Ledger entry: write-off reduces receivable (credit)
  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payer_account_id: params.payerAccountId,
    entry_type: "write_off",
    credit: params.amount,
    description: `Write-off: ${params.invoiceNumber} — ${params.reason}`,
    created_by: params.actorId,
    metadata: {
      reason_code: params.reasonCode,
      approval_request_id: params.approvalRequestId ?? null,
    },
  });

  // Update collection metadata cache (not SSOT — ledger is)
  await upsertCollectionCache(params.invoiceId, params.branchId, {
    collection_status: "written_off",
    written_off_at: new Date().toISOString(),
    written_off_amount: existingWriteOffTotal + params.amount,
    write_off_reason: params.reason,
    write_off_approval_id: params.approvalRequestId ?? null,
  });

  // Collection note
  await supabase.from("collection_notes").insert({
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    note_type: "write_off",
    content: `Write-off of RM ${params.amount.toFixed(2)}: ${params.reason} (${params.reasonCode})`,
    created_by: params.actorId,
  } as any);

  // Audit trail
  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "write_off",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason,
    new_values: {
      amount: params.amount,
      reason_code: params.reasonCode,
      approval_request_id: params.approvalRequestId,
      cumulative_write_off: existingWriteOffTotal + params.amount,
    },
  });
}

// ─── Recovery After Write-Off ────────────────────────────────────────────────

export async function recordRecovery(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  payerAccountId: string | null;
  amount: number;
  notes: string;
  actorId: string;
  actorName: string;
}) {
  if (params.amount <= 0) throw new Error("Recovery amount must be positive");

  // Get total write-offs and existing recoveries from ledger (SSOT)
  const { data: ledgerEntries } = await supabase
    .from("billing_ledger")
    .select("entry_type, debit, credit")
    .eq("invoice_id", params.invoiceId)
    .in("entry_type", ["write_off", "recovery"]);

  let totalWriteOff = 0;
  let totalRecovery = 0;
  for (const entry of ledgerEntries ?? []) {
    if ((entry as any).entry_type === "write_off") totalWriteOff += (entry as any).credit || 0;
    if ((entry as any).entry_type === "recovery") totalRecovery += (entry as any).debit || 0;
  }

  if (totalWriteOff === 0) {
    throw new Error("No write-off found for this invoice");
  }

  // Cap recovery at net write-off (prevent over-recovery)
  const maxRecoverable = totalWriteOff - totalRecovery;
  if (params.amount > maxRecoverable + 0.01) {
    throw new Error(
      `Recovery of ${params.amount} exceeds recoverable balance of ${maxRecoverable.toFixed(2)}`
    );
  }

  // Ledger entry: recovery (debit — reverses part/all of write-off)
  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payer_account_id: params.payerAccountId,
    entry_type: "recovery",
    debit: params.amount,
    description: `Recovery on written-off ${params.invoiceNumber}: ${params.notes}`,
    created_by: params.actorId,
    metadata: {
      cumulative_write_off: totalWriteOff,
      cumulative_recovery_before: totalRecovery,
      cumulative_recovery_after: totalRecovery + params.amount,
    },
  });

  // Update collection metadata cache
  const newTotalRecovery = totalRecovery + params.amount;
  const isFullyRecovered = newTotalRecovery >= totalWriteOff - 0.01;
  await upsertCollectionCache(params.invoiceId, params.branchId, {
    recovery_amount: newTotalRecovery,
    collection_status: isFullyRecovered ? "recovered" : "written_off",
  });

  // Collection note
  await supabase.from("collection_notes").insert({
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    note_type: "recovery",
    content: `Recovery of RM ${params.amount.toFixed(2)}: ${params.notes}`,
    created_by: params.actorId,
  } as any);

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "write_off_recovery",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      amount: params.amount,
      notes: params.notes,
      cumulative_recovery: newTotalRecovery,
      fully_recovered: isFullyRecovered,
    },
  });
}

// ─── Internal: collection metadata cache helper ──────────────────────────────

async function upsertCollectionCache(
  invoiceId: string,
  branchId: string,
  fields: Record<string, unknown>
) {
  const { data: existing } = await supabase
    .from("invoice_collections")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("invoice_collections")
      .update(fields as any)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("invoice_collections")
      .insert({ invoice_id: invoiceId, branch_id: branchId, ...fields } as any);
  }
}
