/**
 * Core ledger and audit write primitives.
 * Every financial mutation in the system MUST use these functions.
 *
 * These are the ONLY functions allowed to write to billing_ledger and billing_audit_logs.
 * This ensures immutability and consistency across all financial operations.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  branch_id: string;
  payer_account_id?: string | null;
  invoice_id?: string | null;
  payment_id?: string | null;
  entry_type: string;
  debit?: number;
  credit?: number;
  description: string;
  reference_number?: string | null;
  created_by?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEntry {
  branch_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id?: string | null;
  actor_name?: string | null;
  reason?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
}

// ─── Core Writes (append-only, never update/delete) ──────────────────────────

export async function writeLedgerEntry(entry: LedgerEntry) {
  const row: Record<string, unknown> = {
    branch_id: entry.branch_id,
    payer_account_id: entry.payer_account_id ?? null,
    invoice_id: entry.invoice_id ?? null,
    payment_id: entry.payment_id ?? null,
    entry_type: entry.entry_type,
    debit: entry.debit ?? 0,
    credit: entry.credit ?? 0,
    description: entry.description,
    reference_number: entry.reference_number ?? null,
    created_by: entry.created_by ?? null,
    metadata: entry.metadata ?? null,
  };
  const { error } = await supabase.from("billing_ledger").insert(row as any);
  if (error) throw new Error(`Ledger write failed: ${error.message}`);
}

export async function writeAuditEntry(entry: AuditEntry) {
  const row: Record<string, unknown> = {
    branch_id: entry.branch_id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    actor_id: entry.actor_id ?? null,
    actor_name: entry.actor_name ?? null,
    reason: entry.reason ?? null,
    old_values: entry.old_values ?? null,
    new_values: entry.new_values ?? null,
  };
  const { error } = await supabase.from("billing_audit_logs").insert(row as any);
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}
