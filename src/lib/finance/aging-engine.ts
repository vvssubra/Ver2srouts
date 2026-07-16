/**
 * AR Aging Engine.
 * 
 * Fetches overdue invoices and enriches them with:
 * - Real-time aging bucket calculation
 * - Ledger-derived write-off/recovery amounts (SSOT)
 * - Collection metadata (PTP, status, owner)
 * - Active dispute flags from dispute-service
 * 
 * Outstanding is computed as: total_amount - amount_paid - net_write_offs
 * where net_write_offs = write_off_credits - recovery_debits from billing_ledger.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  calculateDaysOverdue,
  getAgingBucket,
  type InvoiceWithAging,
} from "./collections-types";

export async function getOverdueInvoicesWithAging(
  branchIds: string[]
): Promise<InvoiceWithAging[]> {
  if (!branchIds.length) return [];

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, student_id, branch_id, payer_account_id,
      total_amount, amount_paid, due_date, status,
      students!inner(first_name, last_name),
      branches!inner(name)
    `)
    .in("branch_id", branchIds)
    .in("status", ["issued", "partial", "overdue"])
    .order("due_date", { ascending: true });

  if (!invoices?.length) return [];

  const invoiceIds = invoices.map((i: any) => i.id);

  // Parallel fetches: collections metadata, payer names, ledger write-offs, active disputes
  const [collectionsRes, ledgerRes, disputesRes] = await Promise.all([
    supabase.from("invoice_collections").select("*").in("invoice_id", invoiceIds),
    supabase
      .from("billing_ledger")
      .select("invoice_id, entry_type, debit, credit")
      .in("invoice_id", invoiceIds)
      .in("entry_type", ["write_off", "recovery"]),
    supabase
      .from("payment_disputes")
      .select("invoice_id")
      .in("invoice_id", invoiceIds)
      .in("status", ["open", "under_review", "escalated"]),
  ]);

  const collMap = Object.fromEntries(
    (collectionsRes.data ?? []).map((c: any) => [c.invoice_id, c])
  );

  // Derive write-off/recovery from ledger (SSOT)
  const ledgerMap: Record<string, { writeOff: number; recovery: number }> = {};
  for (const entry of ledgerRes.data ?? []) {
    const inv = (entry as any).invoice_id;
    if (!ledgerMap[inv]) ledgerMap[inv] = { writeOff: 0, recovery: 0 };
    if ((entry as any).entry_type === "write_off") {
      ledgerMap[inv].writeOff += (entry as any).credit || 0;
    } else if ((entry as any).entry_type === "recovery") {
      ledgerMap[inv].recovery += (entry as any).debit || 0;
    }
  }

  // Active dispute set
  const disputeSet = new Set(
    (disputesRes.data ?? []).map((d: any) => d.invoice_id)
  );

  // Fetch payer names
  const payerIds = [...new Set(invoices.filter((i: any) => i.payer_account_id).map((i: any) => i.payer_account_id))];
  let payerMap: Record<string, string> = {};
  if (payerIds.length > 0) {
    const { data: payers } = await supabase
      .from("payer_accounts")
      .select("id, account_name")
      .in("id", payerIds);
    payerMap = Object.fromEntries((payers ?? []).map((p: any) => [p.id, p.account_name]));
  }

  return invoices.map((inv: any) => {
    const outstanding = inv.total_amount - (inv.amount_paid || 0);
    const daysOverdue = calculateDaysOverdue(inv.due_date);
    const coll = collMap[inv.id];
    const ledger = ledgerMap[inv.id] ?? { writeOff: 0, recovery: 0 };
    const netWriteOff = ledger.writeOff - ledger.recovery;
    // Net outstanding reflects ledger adjustments
    const netOutstanding = Math.max(0, outstanding - netWriteOff);

    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      student_id: inv.student_id,
      student_name: `${inv.students.first_name} ${inv.students.last_name}`,
      branch_id: inv.branch_id,
      branch_name: inv.branches.name,
      payer_account_id: inv.payer_account_id,
      payer_name: inv.payer_account_id ? payerMap[inv.payer_account_id] ?? null : null,
      total_amount: inv.total_amount,
      amount_paid: inv.amount_paid || 0,
      outstanding,
      due_date: inv.due_date,
      status: inv.status,
      days_overdue: daysOverdue,
      aging_bucket: getAgingBucket(daysOverdue),
      collection_status: coll?.collection_status ?? "none",
      collection_owner_id: coll?.collection_owner_id ?? null,
      promise_to_pay_date: coll?.promise_to_pay_date ?? null,
      next_followup_at: coll?.next_followup_at ?? null,
      last_contacted_at: coll?.last_contacted_at ?? null,
      broken_promise_count: coll?.broken_promise_count ?? 0,
      // Ledger-derived (SSOT) instead of collection record cache
      written_off_amount: ledger.writeOff,
      recovery_amount: ledger.recovery,
      net_outstanding: netOutstanding,
      has_active_dispute: disputeSet.has(inv.id),
    };
  });
}
