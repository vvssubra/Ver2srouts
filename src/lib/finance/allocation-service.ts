/**
 * Payment Allocation Engine.
 * Manages N:N relationships between payments and invoices.
 *
 * Architecture:
 * - Payments with invoice_id = NULL are "source" / unallocated payments
 * - payment_allocations table tracks distribution to invoices
 * - DB trigger sync_invoice_from_allocations recalculates invoice status
 * - All mutations create ledger + audit entries via ledger-core
 * - Every ledger entry carries allocation_id in metadata for traceability
 *
 * FUTURE:
 * - Allocation suggestions (auto-match by payer, amount, date)
 * - Bulk allocation tools
 * - Allocation reversal via compensating allocation entries
 * - Dispute holds that freeze allocated amounts
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AllocationItem {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  /** Optional: payer account for the invoice (for ledger traceability) */
  payerAccountId?: string | null;
}

export interface PaymentAllocation {
  id: string;
  batch_id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  branch_id: string;
  allocated_by: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve payer_account_id for each allocation item from invoices table */
async function enrichAllocationsWithPayer(
  allocations: AllocationItem[]
): Promise<AllocationItem[]> {
  const ids = allocations.map((a) => a.invoiceId);
  if (ids.length === 0) return allocations;

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, payer_account_id")
    .in("id", ids);

  const payerMap = new Map<string, string | null>();
  (invoices || []).forEach((inv) => payerMap.set(inv.id, inv.payer_account_id));

  return allocations.map((a) => ({
    ...a,
    payerAccountId: a.payerAccountId ?? payerMap.get(a.invoiceId) ?? null,
  }));
}

// ─── Record Multi-Invoice Payment ────────────────────────────────────────────
// Creates one source payment (invoice_id = NULL) + allocation records.
// The DB trigger on payment_allocations recalculates invoice balances.

export async function recordAllocatedPayment(params: {
  branchId: string;
  payerAccountId?: string | null;
  totalAmount: number;
  paymentDate: string;
  paymentMethod: string;
  paymentReference?: string | null;
  notes?: string | null;
  allocations: AllocationItem[];
  actorId: string;
  actorName: string;
}): Promise<{ paymentId: string; batchId: string }> {
  // Validate
  if (params.allocations.length === 0) throw new Error("At least one allocation is required");
  const totalAllocated = params.allocations.reduce((s, a) => s + a.amount, 0);
  if (totalAllocated > params.totalAmount + 0.01) {
    throw new Error(`Total allocations (RM ${totalAllocated.toFixed(2)}) exceed payment amount (RM ${params.totalAmount.toFixed(2)})`);
  }
  params.allocations.forEach((a) => {
    if (a.amount <= 0) throw new Error(`Allocation amount must be positive for ${a.invoiceNumber}`);
  });

  // Enrich with payer account IDs from invoices
  const enriched = await enrichAllocationsWithPayer(params.allocations);

  // 1. Insert source payment (unallocated — invoice_id = NULL)
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: null,
      amount: params.totalAmount,
      payment_date: params.paymentDate,
      payment_method: params.paymentMethod,
      payment_reference: params.paymentReference || null,
      notes: params.notes || null,
      received_by: params.actorId,
    })
    .select("id")
    .single();
  if (payErr) throw new Error(`Payment record failed: ${payErr.message}`);

  // 2. Create allocation records (DB trigger updates invoice statuses)
  const batchId = crypto.randomUUID();
  const allocationRows = enriched.map((a) => ({
    batch_id: batchId,
    payment_id: payment.id,
    invoice_id: a.invoiceId,
    amount: a.amount,
    branch_id: params.branchId,
    allocated_by: params.actorId,
    notes: params.notes || null,
  }));
  const { data: insertedAllocs, error: allocErr } = await supabase
    .from("payment_allocations")
    .insert(allocationRows)
    .select("id, invoice_id");
  if (allocErr) throw new Error(`Allocation failed: ${allocErr.message}`);

  // Build allocation ID map for ledger metadata
  const allocIdMap = new Map<string, string>();
  (insertedAllocs || []).forEach((a) => allocIdMap.set(a.invoice_id, a.id));

  // 3. Ledger entries — one per allocation with allocation_id traceability
  for (const alloc of enriched) {
    await writeLedgerEntry({
      branch_id: params.branchId,
      payer_account_id: alloc.payerAccountId ?? params.payerAccountId,
      invoice_id: alloc.invoiceId,
      payment_id: payment.id,
      entry_type: "allocation_applied",
      credit: alloc.amount,
      description: `Payment allocated to ${alloc.invoiceNumber} via ${params.paymentMethod}`,
      reference_number: params.paymentReference,
      created_by: params.actorId,
      metadata: {
        batch_id: batchId,
        allocation_id: allocIdMap.get(alloc.invoiceId),
        source: "multi_invoice_allocation",
      },
    });
  }

  // 4. If unallocated remainder, write ledger note
  const unallocated = params.totalAmount - totalAllocated;
  if (unallocated > 0.01) {
    await writeLedgerEntry({
      branch_id: params.branchId,
      payer_account_id: params.payerAccountId,
      payment_id: payment.id,
      entry_type: "payment_received",
      credit: unallocated,
      description: `Unallocated payment balance (pending allocation)`,
      reference_number: params.paymentReference,
      created_by: params.actorId,
      metadata: { batch_id: batchId, source: "unallocated_remainder" },
    });
  }

  // 5. Audit
  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "payment",
    entity_id: payment.id,
    action: "payment_allocated",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      total_amount: params.totalAmount,
      allocated_amount: totalAllocated,
      unallocated: unallocated,
      allocation_count: enriched.length,
      batch_id: batchId,
      invoices: enriched.map((a) => ({
        invoice: a.invoiceNumber,
        amount: a.amount,
        allocation_id: allocIdMap.get(a.invoiceId),
      })),
    },
  });

  return { paymentId: payment.id, batchId };
}

// ─── Allocate Existing Unallocated Payment ───────────────────────────────────

export async function allocatePayment(params: {
  paymentId: string;
  branchId: string;
  payerAccountId?: string | null;
  allocations: AllocationItem[];
  actorId: string;
  actorName: string;
}): Promise<string> {
  if (params.allocations.length === 0) throw new Error("At least one allocation is required");

  // Fetch payment
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("id, amount, invoice_id, payment_method, payment_reference")
    .eq("id", params.paymentId)
    .single();
  if (fetchErr || !payment) throw new Error("Payment not found");

  // Get existing allocations
  const { data: existingAllocs } = await supabase
    .from("payment_allocations")
    .select("amount")
    .eq("payment_id", params.paymentId);
  const alreadyAllocated = (existingAllocs || []).reduce((s, a) => s + Number(a.amount), 0);
  const available = Number(payment.amount) - alreadyAllocated;

  const newTotal = params.allocations.reduce((s, a) => s + a.amount, 0);
  if (newTotal > available + 0.01) {
    throw new Error(`Allocations (RM ${newTotal.toFixed(2)}) exceed available balance (RM ${available.toFixed(2)})`);
  }

  params.allocations.forEach((a) => {
    if (a.amount <= 0) throw new Error(`Allocation amount must be positive for ${a.invoiceNumber}`);
  });

  // Enrich with payer account IDs
  const enriched = await enrichAllocationsWithPayer(params.allocations);

  const batchId = crypto.randomUUID();
  const rows = enriched.map((a) => ({
    batch_id: batchId,
    payment_id: params.paymentId,
    invoice_id: a.invoiceId,
    amount: a.amount,
    branch_id: params.branchId,
    allocated_by: params.actorId,
  }));
  const { data: insertedAllocs, error: allocErr } = await supabase
    .from("payment_allocations")
    .insert(rows)
    .select("id, invoice_id");
  if (allocErr) throw new Error(`Allocation failed: ${allocErr.message}`);

  const allocIdMap = new Map<string, string>();
  (insertedAllocs || []).forEach((a) => allocIdMap.set(a.invoice_id, a.id));

  // Ledger entries with allocation_id traceability
  for (const alloc of enriched) {
    await writeLedgerEntry({
      branch_id: params.branchId,
      payer_account_id: alloc.payerAccountId ?? params.payerAccountId,
      invoice_id: alloc.invoiceId,
      payment_id: params.paymentId,
      entry_type: "allocation_applied",
      credit: alloc.amount,
      description: `Payment allocated to ${alloc.invoiceNumber}`,
      reference_number: payment.payment_reference,
      created_by: params.actorId,
      metadata: {
        batch_id: batchId,
        allocation_id: allocIdMap.get(alloc.invoiceId),
        source: "manual_allocation",
      },
    });
  }

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "payment",
    entity_id: params.paymentId,
    action: "payment_allocated",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      allocated_amount: newTotal,
      remaining_unallocated: available - newTotal,
      batch_id: batchId,
      invoices: enriched.map((a) => ({
        invoice: a.invoiceNumber,
        amount: a.amount,
        allocation_id: allocIdMap.get(a.invoiceId),
      })),
    },
  });

  return batchId;
}

// ─── Query Helpers ───────────────────────────────────────────────────────────

export async function getPaymentAllocations(paymentId: string): Promise<PaymentAllocation[]> {
  const { data } = await supabase
    .from("payment_allocations")
    .select("*")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: true });
  return (data || []) as PaymentAllocation[];
}

export async function getInvoiceAllocations(invoiceId: string): Promise<PaymentAllocation[]> {
  const { data } = await supabase
    .from("payment_allocations")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  return (data || []) as PaymentAllocation[];
}

/** Get payments that are not fully allocated (unallocated queue), scoped to branch */
export async function getUnallocatedPayments(branchId: string): Promise<Array<{
  id: string;
  amount: number;
  allocated: number;
  unallocated: number;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  invoice_id: string | null;
}>> {
  // Fetch payments with NULL invoice_id (multi-invoice source payments)
  // Join via payment_allocations to scope to branch
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, payment_method, payment_reference, notes, received_by, created_at, invoice_id")
    .is("invoice_id", null)
    .order("created_at", { ascending: false });

  if (!payments || payments.length === 0) return [];

  // For each, get allocated total (scoped via payment_allocations.branch_id)
  const paymentIds = payments.map((p) => p.id);
  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("payment_id, amount, branch_id")
    .in("payment_id", paymentIds);

  // Build branch-aware allocation map
  const allocMap = new Map<string, number>();
  const paymentBranches = new Map<string, string>();
  (allocations || []).forEach((a) => {
    allocMap.set(a.payment_id, (allocMap.get(a.payment_id) || 0) + Number(a.amount));
    // Track branch association
    if (a.branch_id === branchId) {
      paymentBranches.set(a.payment_id, a.branch_id);
    }
  });

  return payments
    .map((p) => {
      const allocated = allocMap.get(p.id) || 0;
      return {
        ...p,
        allocated,
        unallocated: Number(p.amount) - allocated,
      };
    })
    .filter((p) => p.unallocated > 0.01);
}
