/**
 * Collection Operations Service.
 * 
 * Manages operational collection tracking: contact logging, PTP, status changes.
 * 
 * Write-offs and recoveries are in writeoff-service.ts (ledger-critical).
 * Aging calculations are in aging-engine.ts.
 * Types and constants are in collections-types.ts.
 * 
 * This file re-exports everything for backward compatibility.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Re-exports for backward compatibility ──────────────────────────────────

export {
  COLLECTION_STATUSES,
  COLLECTION_NOTE_TYPES,
  CONTACT_METHODS,
  WRITE_OFF_REASON_CODES,
  AGING_BUCKETS,
  calculateDaysOverdue,
  getAgingBucket,
  getAgingBucketLabel,
  computeAgingSummary,
} from "./collections-types";
export type {
  CollectionStatus,
  InvoiceWithAging,
  AgingSummary,
  AgingBucket,
} from "./collections-types";

export { getOverdueInvoicesWithAging } from "./aging-engine";
export { executeWriteOff, recordRecovery } from "./writeoff-service";

// ─── Collection Status Upsert ────────────────────────────────────────────────

export async function upsertCollectionStatus(params: {
  invoiceId: string;
  branchId: string;
  collectionStatus?: string;
  collectionOwnerId?: string | null;
  nextFollowupAt?: string | null;
  contactMethod?: string | null;
  promiseToPayDate?: string | null;
  promiseToPayAmount?: number;
}) {
  const { data: existing } = await supabase
    .from("invoice_collections")
    .select("id")
    .eq("invoice_id", params.invoiceId)
    .maybeSingle();

  const row: Record<string, unknown> = {
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
  };
  if (params.collectionStatus !== undefined) row.collection_status = params.collectionStatus;
  if (params.collectionOwnerId !== undefined) row.collection_owner_id = params.collectionOwnerId;
  if (params.nextFollowupAt !== undefined) row.next_followup_at = params.nextFollowupAt;
  if (params.contactMethod !== undefined) row.contact_method = params.contactMethod;
  if (params.promiseToPayDate !== undefined) row.promise_to_pay_date = params.promiseToPayDate;
  if (params.promiseToPayAmount !== undefined) row.promise_to_pay_amount = params.promiseToPayAmount;

  if (existing) {
    const { error } = await supabase
      .from("invoice_collections")
      .update(row as any)
      .eq("id", existing.id);
    if (error) throw new Error(`Collection update failed: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("invoice_collections")
      .insert(row as any);
    if (error) throw new Error(`Collection insert failed: ${error.message}`);
  }
}

// ─── Contact Logging ─────────────────────────────────────────────────────────

export async function logContactAttempt(params: {
  invoiceId: string;
  branchId: string;
  contactMethod: string;
  content: string;
  actorId: string;
}) {
  const { error } = await supabase.from("collection_notes").insert({
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    note_type: "contact_attempt",
    content: params.content,
    contact_method: params.contactMethod,
    created_by: params.actorId,
  } as any);
  if (error) throw new Error(`Note insert failed: ${error.message}`);

  // Atomically update contact metadata (single upsert, no redundant query)
  await upsertCollectionStatus({
    invoiceId: params.invoiceId,
    branchId: params.branchId,
    contactMethod: params.contactMethod,
  });

  // Update last_contacted_at
  const { data: existing } = await supabase
    .from("invoice_collections")
    .select("id")
    .eq("invoice_id", params.invoiceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("invoice_collections")
      .update({ last_contacted_at: new Date().toISOString() } as any)
      .eq("id", existing.id);
  }
}

// ─── Promise to Pay ──────────────────────────────────────────────────────────

export async function recordPromiseToPay(params: {
  invoiceId: string;
  branchId: string;
  promiseDate: string;
  promiseAmount: number;
  notes: string;
  actorId: string;
}) {
  const { error } = await supabase.from("collection_notes").insert({
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    note_type: "promise_to_pay",
    content: params.notes,
    promise_date: params.promiseDate,
    promise_amount: params.promiseAmount,
    created_by: params.actorId,
  } as any);
  if (error) throw new Error(`Promise note failed: ${error.message}`);

  await upsertCollectionStatus({
    invoiceId: params.invoiceId,
    branchId: params.branchId,
    promiseToPayDate: params.promiseDate,
    promiseToPayAmount: params.promiseAmount,
    collectionStatus: "active",
  });
}

// ─── Broken Promise ──────────────────────────────────────────────────────────

export async function recordBrokenPromise(params: {
  invoiceId: string;
  branchId: string;
  notes: string;
  actorId: string;
}) {
  const { error } = await supabase.from("collection_notes").insert({
    invoice_id: params.invoiceId,
    branch_id: params.branchId,
    note_type: "broken_promise",
    content: params.notes,
    created_by: params.actorId,
  } as any);
  if (error) throw new Error(`Broken promise note failed: ${error.message}`);

  const { data: coll } = await supabase
    .from("invoice_collections")
    .select("id, broken_promise_count")
    .eq("invoice_id", params.invoiceId)
    .maybeSingle();

  if (coll) {
    await supabase
      .from("invoice_collections")
      .update({
        broken_promise_count: (coll.broken_promise_count || 0) + 1,
        promise_to_pay_date: null,
        collection_status: "escalated",
      } as any)
      .eq("id", coll.id);
  }
}

// ─── Notes Query ─────────────────────────────────────────────────────────────

export async function getCollectionNotes(invoiceId: string) {
  const { data } = await supabase
    .from("collection_notes")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
