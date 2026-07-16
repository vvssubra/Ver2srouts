/**
 * Gateway & Reconciliation Service
 * 
 * Provides query helpers for BillPlz gateway events, transactions,
 * and reconciliation workflows. Read-heavy service for admin dashboards.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GatewayEvent {
  id: string;
  branch_id: string;
  gateway: string;
  event_type: string;
  event_id: string;
  bill_id: string | null;
  collection_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  raw_payload: Record<string, unknown>;
  processing_status: string;
  processing_error: string | null;
  processed_at: string | null;
  retry_count: number;
  idempotency_key: string;
  created_at: string;
}

export interface GatewayTransaction {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  branch_id: string;
  gateway: string;
  bill_id: string;
  collection_id: string | null;
  transaction_reference: string | null;
  gateway_status: string;
  gateway_amount: number;
  gateway_paid_at: string | null;
  settlement_status: string | null;
  settlement_date: string | null;
  settlement_reference: string | null;
  reconciliation_status: string;
  reconciliation_notes: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const PROCESSING_STATUSES = [
  { value: "processed", label: "Processed", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "skipped", label: "Skipped (Duplicate)", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "failed", label: "Failed", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "processing", label: "Processing", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "pending", label: "Pending", color: "bg-muted text-muted-foreground border-border" },
] as const;

export const RECONCILIATION_STATUSES = [
  { value: "matched", label: "Matched", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "unmatched", label: "Unmatched", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "duplicate", label: "Duplicate Risk", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "manual_match", label: "Manually Matched", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "disputed", label: "Disputed", color: "bg-red-50 text-red-700 border-red-200" },
] as const;

export const SETTLEMENT_STATUSES = [
  { value: "pending", label: "Pending Settlement", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "settled", label: "Settled", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "failed", label: "Settlement Failed", color: "bg-red-50 text-red-700 border-red-200" },
] as const;

// ─── Gateway Events ──────────────────────────────────────────────────────────

export async function getGatewayEvents(branchIds: string[], filters?: {
  status?: string;
  eventType?: string;
  limit?: number;
}): Promise<GatewayEvent[]> {
  if (branchIds.length === 0) return [];
  let query = supabase
    .from("gateway_events")
    .select("*")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false })
    .limit(filters?.limit || 200);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("processing_status", filters.status);
  }
  if (filters?.eventType && filters.eventType !== "all") {
    query = query.eq("event_type", filters.eventType);
  }

  const { data } = await query;
  return (data || []) as GatewayEvent[];
}

// ─── Gateway Transactions ────────────────────────────────────────────────────

export async function getGatewayTransactions(branchIds: string[], filters?: {
  reconciliationStatus?: string;
  settlementStatus?: string;
}): Promise<GatewayTransaction[]> {
  if (branchIds.length === 0) return [];
  let query = supabase
    .from("gateway_transactions")
    .select("*")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.reconciliationStatus && filters.reconciliationStatus !== "all") {
    query = query.eq("reconciliation_status", filters.reconciliationStatus);
  }
  if (filters?.settlementStatus && filters.settlementStatus !== "all") {
    query = query.eq("settlement_status", filters.settlementStatus);
  }

  const { data } = await query;
  return (data || []) as GatewayTransaction[];
}

export async function getGatewayTransactionForPayment(paymentId: string): Promise<GatewayTransaction | null> {
  const { data } = await supabase
    .from("gateway_transactions")
    .select("*")
    .eq("payment_id", paymentId)
    .limit(1);
  return (data && data.length > 0 ? data[0] : null) as GatewayTransaction | null;
}

export async function getGatewayEventsForPayment(paymentId: string): Promise<GatewayEvent[]> {
  const { data } = await supabase
    .from("gateway_events")
    .select("*")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false });
  return (data || []) as GatewayEvent[];
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export interface ReconciliationSummary {
  totalGatewayTransactions: number;
  matchedCount: number;
  matchedAmount: number;
  unmatchedCount: number;
  unmatchedAmount: number;
  duplicateRiskCount: number;
  failedWebhookCount: number;
  pendingSettlementCount: number;
  settledAmount: number;
}

export async function getReconciliationSummary(branchIds: string[]): Promise<ReconciliationSummary> {
  if (branchIds.length === 0) {
    return {
      totalGatewayTransactions: 0, matchedCount: 0, matchedAmount: 0,
      unmatchedCount: 0, unmatchedAmount: 0, duplicateRiskCount: 0,
      failedWebhookCount: 0, pendingSettlementCount: 0, settledAmount: 0,
    };
  }

  const { data: txns } = await supabase
    .from("gateway_transactions")
    .select("reconciliation_status, settlement_status, gateway_amount")
    .in("branch_id", branchIds);

  const { data: failedEvents } = await supabase
    .from("gateway_events")
    .select("id")
    .in("branch_id", branchIds)
    .eq("processing_status", "failed");

  const all = txns || [];
  const matched = all.filter(t => t.reconciliation_status === "matched" || t.reconciliation_status === "manual_match");
  const unmatched = all.filter(t => t.reconciliation_status === "unmatched");
  const dupes = all.filter(t => t.reconciliation_status === "duplicate");
  const pendingSettlement = all.filter(t => t.settlement_status === "pending");
  const settled = all.filter(t => t.settlement_status === "settled");

  return {
    totalGatewayTransactions: all.length,
    matchedCount: matched.length,
    matchedAmount: matched.reduce((s, t) => s + Number(t.gateway_amount), 0),
    unmatchedCount: unmatched.length,
    unmatchedAmount: unmatched.reduce((s, t) => s + Number(t.gateway_amount), 0),
    duplicateRiskCount: dupes.length,
    failedWebhookCount: (failedEvents || []).length,
    pendingSettlementCount: pendingSettlement.length,
    settledAmount: settled.reduce((s, t) => s + Number(t.gateway_amount), 0),
  };
}

export async function manualMatchTransaction(params: {
  transactionId: string;
  paymentId: string;
  notes: string;
  actorId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("gateway_transactions")
    .update({
      payment_id: params.paymentId,
      reconciliation_status: "manual_match",
      reconciliation_notes: params.notes,
      reconciled_at: new Date().toISOString(),
      reconciled_by: params.actorId,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", params.transactionId);
  if (error) throw new Error(`Manual match failed: ${error.message}`);
}

export async function markTransactionDuplicate(transactionId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from("gateway_transactions")
    .update({
      reconciliation_status: "duplicate",
      reconciliation_notes: notes,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", transactionId);
  if (error) throw new Error(`Failed to mark duplicate: ${error.message}`);
}
