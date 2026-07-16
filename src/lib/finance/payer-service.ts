/**
 * Payer / Family Financial Profile Service.
 * 
 * Aggregates all financial data at the payer-account level:
 * - Linked students and their invoices
 * - Consolidated balance (billed, paid, outstanding)
 * - Wallet/credit balance (from ledger SSOT)
 * - Overdue and aging profile
 * - Dispute summary
 * - Write-off and recovery totals
 * - Recent payment history
 * 
 * All balances are derived from billing_ledger (SSOT).
 */

import { supabase } from "@/integrations/supabase/client";
import { WALLET_ENTRY_TYPES } from "./wallet-service";
import { calculateDaysOverdue, getAgingBucket, getAgingBucketLabel, type AgingSummary } from "./collections-types";

// ─── Ensure / auto-provision payer account for a student ─────────────────────

/**
 * Returns the payer_account_id linked to a student, creating one on demand
 * (named after the primary parent, or the student as a fallback) and linking
 * any newer invoices for that student to it.
 */
export async function ensurePayerAccountForStudent(
  studentId: string,
  branchId: string,
): Promise<string> {
  // 1. Existing link?
  const { data: existingLink } = await supabase
    .from("payer_account_students")
    .select("payer_account_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (existingLink?.payer_account_id) return existingLink.payer_account_id as string;

  // 2. Gather student + primary parent info for sensible defaults.
  const { data: student } = await supabase
    .from("students")
    .select("first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();

  const { data: parentLinks } = await supabase
    .from("parent_students")
    .select("parent_id, is_primary, profiles:parent_id(first_name, last_name, email, phone)")
    .eq("student_id", studentId)
    .order("is_primary", { ascending: false });

  const primary: any = parentLinks?.[0] ?? null;
  const parentProfile: any = primary?.profiles ?? null;
  const parentName = parentProfile
    ? [parentProfile.first_name, parentProfile.last_name].filter(Boolean).join(" ").trim()
    : "";
  const studentName = [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim();
  const accountName = parentName || (studentName ? `${studentName} (Payer)` : "Payer Account");

  // 3. Create payer account.
  const { data: created, error: createErr } = await supabase
    .from("payer_accounts")
    .insert({
      branch_id: branchId,
      name: accountName,
      email: parentProfile?.email ?? null,
      phone: parentProfile?.phone ?? null,
      primary_parent_id: primary?.parent_id ?? null,
      is_active: true,
    })
    .select("id")
    .single();
  if (createErr || !created) throw createErr ?? new Error("Failed to create payer account");

  // 4. Link student → payer account.
  const { error: linkErr } = await supabase
    .from("payer_account_students")
    .insert({ payer_account_id: created.id, student_id: studentId });
  if (linkErr) throw linkErr;

  // 5. Back-fill payer_account_id on any of this student's invoices that
  // are still missing one (keeps wallet / statements coherent going forward).
  await supabase
    .from("invoices")
    .update({ payer_account_id: created.id })
    .eq("student_id", studentId)
    .is("payer_account_id", null);

  return created.id as string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayerStudent {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  is_active: boolean;
}

export interface PayerInvoiceSummary {
  id: string;
  invoice_number: string;
  student_id: string;
  student_name: string;
  billing_month: number;
  billing_year: number;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  status: string;
  days_overdue: number;
  aging_bucket: string;
}

export interface PayerFinancialProfile {
  payer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    branch_id: string;
    branch_name: string;
    primary_parent_id: string | null;
  };
  students: PayerStudent[];
  // Consolidated financials
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  // Wallet (from ledger)
  walletBalance: number;
  walletTotalCredited: number;
  walletTotalUsed: number;
  // Risk indicators
  disputedAmount: number;
  activeDisputeCount: number;
  writtenOffAmount: number;
  recoveryAmount: number;
  brokenPromiseCount: number;
  // Aging
  agingSummary: AgingSummary;
  // Invoices grouped by student
  invoicesByStudent: Record<string, PayerInvoiceSummary[]>;
  // Recent payments
  recentPayments: Array<{
    id: string;
    invoice_id: string;
    invoice_number: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    student_name: string;
  }>;
  // Collection status
  collectionStatus: string;
  promiseToPayDate: string | null;
  lastContactedAt: string | null;
}

// ─── Fetch Full Profile ──────────────────────────────────────────────────────

export async function getPayerFinancialProfile(
  payerAccountId: string
): Promise<PayerFinancialProfile | null> {
  // 1. Get payer account
  const { data: payer } = await supabase
    .from("payer_accounts")
    .select("*, branches(name)")
    .eq("id", payerAccountId)
    .single();

  if (!payer) return null;

  // 2. Get all invoices for this payer
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, students(id, first_name, last_name, class_name, is_active)")
    .eq("payer_account_id", payerAccountId)
    .order("billing_year", { ascending: false })
    .order("billing_month", { ascending: false });

  const invList = invoices ?? [];

  // 3. Get ledger entries for wallet, write-offs, disputes
  const [walletRes, writeOffRes, disputeRes, collectionsRes] = await Promise.all([
    supabase
      .from("billing_ledger")
      .select("entry_type, debit, credit")
      .eq("payer_account_id", payerAccountId)
      .in("entry_type", [...WALLET_ENTRY_TYPES]),
    supabase
      .from("billing_ledger")
      .select("entry_type, debit, credit")
      .eq("payer_account_id", payerAccountId)
      .in("entry_type", ["write_off", "recovery"]),
    supabase
      .from("payment_disputes")
      .select("id, amount, status")
      .in("invoice_id", invList.map((i: any) => i.id))
      .in("status", ["open", "under_review", "escalated"]),
    supabase
      .from("invoice_collections")
      .select("*")
      .in("invoice_id", invList.map((i: any) => i.id)),
  ]);

  // Wallet balance
  let walletCredited = 0, walletUsed = 0;
  for (const e of walletRes.data ?? []) {
    walletCredited += (e as any).credit || 0;
    walletUsed += (e as any).debit || 0;
  }

  // Write-offs / recoveries
  let writtenOff = 0, recovered = 0;
  for (const e of writeOffRes.data ?? []) {
    if ((e as any).entry_type === "write_off") writtenOff += (e as any).credit || 0;
    if ((e as any).entry_type === "recovery") recovered += (e as any).debit || 0;
  }

  // Disputes
  const activeDisputes = disputeRes.data ?? [];
  const disputedAmount = activeDisputes.reduce((s: number, d: any) => s + (d.amount || 0), 0);

  // Collections aggregation
  let brokenPromises = 0;
  let collectionStatus = "none";
  let promiseToPayDate: string | null = null;
  let lastContactedAt: string | null = null;
  for (const c of collectionsRes.data ?? []) {
    brokenPromises += (c as any).broken_promise_count || 0;
    if ((c as any).collection_status && (c as any).collection_status !== "none") {
      collectionStatus = (c as any).collection_status;
    }
    if ((c as any).promise_to_pay_date) promiseToPayDate = (c as any).promise_to_pay_date;
    if ((c as any).last_contacted_at) lastContactedAt = (c as any).last_contacted_at;
  }

  // Build student set and invoice groups
  const studentMap = new Map<string, PayerStudent>();
  const invoicesByStudent: Record<string, PayerInvoiceSummary[]> = {};
  let totalBilled = 0, totalPaid = 0, totalOutstanding = 0, totalOverdue = 0;
  const agingSummary: AgingSummary = {
    current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0,
    total: 0, invoiceCount: 0,
  };

  for (const inv of invList) {
    const student = (inv as any).students;
    if (student && !studentMap.has(student.id)) {
      studentMap.set(student.id, {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        class_name: student.class_name,
        is_active: student.is_active,
      });
    }

    const outstanding = inv.total_amount - (inv.amount_paid || 0);
    const daysOverdue = inv.due_date ? calculateDaysOverdue(inv.due_date) : 0;
    const bucket = getAgingBucket(daysOverdue);
    const studentName = student ? `${student.first_name} ${student.last_name}` : "Unknown";
    const sid = student?.id ?? "unknown";

    totalBilled += inv.total_amount;
    totalPaid += inv.amount_paid || 0;

    if (["issued", "partial", "overdue"].includes(inv.status)) {
      totalOutstanding += outstanding;
      if (daysOverdue > 0) totalOverdue += outstanding;
      // Aging
      if (bucket in agingSummary) {
        (agingSummary as any)[bucket] += outstanding;
      }
      agingSummary.total += outstanding;
      agingSummary.invoiceCount += 1;
    }

    if (!invoicesByStudent[sid]) invoicesByStudent[sid] = [];
    invoicesByStudent[sid].push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      student_id: sid,
      student_name: studentName,
      billing_month: inv.billing_month,
      billing_year: inv.billing_year,
      due_date: inv.due_date,
      total_amount: inv.total_amount,
      amount_paid: inv.amount_paid || 0,
      outstanding,
      status: inv.status,
      days_overdue: daysOverdue,
      aging_bucket: bucket,
    });
  }

  // 4. Recent payments
  const invoiceIds = invList.map((i: any) => i.id);
  let recentPayments: PayerFinancialProfile["recentPayments"] = [];
  if (invoiceIds.length > 0) {
    const { data: pmts } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, payment_date, payment_method, invoices(invoice_number, students(first_name, last_name))")
      .in("invoice_id", invoiceIds)
      .order("payment_date", { ascending: false })
      .limit(20);

    recentPayments = (pmts ?? []).map((p: any) => ({
      id: p.id,
      invoice_id: p.invoice_id,
      invoice_number: p.invoices?.invoice_number ?? "",
      amount: p.amount,
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      student_name: p.invoices?.students
        ? `${p.invoices.students.first_name} ${p.invoices.students.last_name}`
        : "",
    }));
  }

  return {
    payer: {
      id: payer.id,
      name: payer.name,
      email: payer.email,
      phone: payer.phone,
      branch_id: payer.branch_id,
      branch_name: (payer as any).branches?.name ?? "",
      primary_parent_id: payer.primary_parent_id,
    },
    students: Array.from(studentMap.values()),
    totalBilled,
    totalPaid,
    totalOutstanding,
    totalOverdue,
    walletBalance: walletCredited - walletUsed,
    walletTotalCredited: walletCredited,
    walletTotalUsed: walletUsed,
    disputedAmount,
    activeDisputeCount: activeDisputes.length,
    writtenOffAmount: writtenOff,
    recoveryAmount: recovered,
    brokenPromiseCount: brokenPromises,
    agingSummary,
    invoicesByStudent,
    recentPayments,
    collectionStatus,
    promiseToPayDate,
    lastContactedAt,
  };
}

// ─── List all payer accounts for admin view ──────────────────────────────────

export interface PayerAccountRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  branch_id: string;
  branch_name: string;
  student_count: number;
  total_outstanding: number;
  total_overdue: number;
  wallet_balance: number;
  collection_risk: "low" | "medium" | "high" | "critical";
}

export async function getPayerAccountsList(
  branchIds: string[]
): Promise<PayerAccountRow[]> {
  if (!branchIds.length) return [];

  const { data: payers } = await supabase
    .from("payer_accounts")
    .select("id, name, email, phone, branch_id, branches(name)")
    .in("branch_id", branchIds)
    .eq("is_active", true)
    .order("name");

  if (!payers?.length) return [];

  const payerIds = payers.map((p: any) => p.id);

  // Get invoice summaries per payer
  const { data: invoices } = await supabase
    .from("invoices")
    .select("payer_account_id, student_id, total_amount, amount_paid, status, due_date")
    .in("payer_account_id", payerIds)
    .in("status", ["issued", "partial", "overdue"]);

  // Get wallet balances
  const { data: walletEntries } = await supabase
    .from("billing_ledger")
    .select("payer_account_id, debit, credit")
    .in("payer_account_id", payerIds)
    .in("entry_type", [...WALLET_ENTRY_TYPES]);

  // Aggregate
  const invMap: Record<string, {
    students: Set<string>;
    outstanding: number;
    overdue: number;
    maxDaysOverdue: number;
  }> = {};
  for (const inv of invoices ?? []) {
    const pid = (inv as any).payer_account_id;
    if (!invMap[pid]) invMap[pid] = { students: new Set(), outstanding: 0, overdue: 0, maxDaysOverdue: 0 };
    invMap[pid].students.add((inv as any).student_id);
    const outs = inv.total_amount - (inv.amount_paid || 0);
    invMap[pid].outstanding += outs;
    const daysOd = calculateDaysOverdue(inv.due_date);
    if (daysOd > 0) invMap[pid].overdue += outs;
    invMap[pid].maxDaysOverdue = Math.max(invMap[pid].maxDaysOverdue, daysOd);
  }

  const walletMap: Record<string, number> = {};
  for (const e of walletEntries ?? []) {
    const pid = (e as any).payer_account_id;
    if (!walletMap[pid]) walletMap[pid] = 0;
    walletMap[pid] += ((e as any).credit || 0) - ((e as any).debit || 0);
  }

  return payers.map((p: any) => {
    const agg = invMap[p.id] ?? { students: new Set(), outstanding: 0, overdue: 0, maxDaysOverdue: 0 };
    const risk: PayerAccountRow["collection_risk"] =
      agg.maxDaysOverdue > 90 ? "critical" :
      agg.maxDaysOverdue > 30 ? "high" :
      agg.overdue > 0 ? "medium" : "low";

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      branch_id: p.branch_id,
      branch_name: p.branches?.name ?? "",
      student_count: agg.students.size,
      total_outstanding: agg.outstanding,
      total_overdue: agg.overdue,
      wallet_balance: walletMap[p.id] ?? 0,
      collection_risk: risk,
    };
  });
}

// ─── Parent Portal: get profile for logged-in parent ─────────────────────────

export async function getParentHouseholdSummary(parentUserId: string): Promise<{
  payerAccount: { id: string; name: string } | null;
  children: Array<{
    id: string;
    first_name: string;
    last_name: string;
    invoices: PayerInvoiceSummary[];
    totalOutstanding: number;
    totalPaid: number;
  }>;
  householdOutstanding: number;
  householdPaid: number;
  walletBalance: number;
  recentPayments: Array<{
    id: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    invoice_number: string;
    student_name: string;
    invoice_id: string;
  }>;
} | null> {
  // Find payer account linked to this parent
  const { data: payer } = await supabase
    .from("payer_accounts")
    .select("id, name")
    .eq("primary_parent_id", parentUserId)
    .maybeSingle();

  // Get children
  const { data: childLinks } = await supabase
    .from("parent_students")
    .select("student_id, students(id, first_name, last_name)")
    .eq("parent_id", parentUserId);

  const children = (childLinks ?? []).map((l: any) => l.students).filter(Boolean);
  const childIds = children.map((c: any) => c.id);

  if (!childIds.length) {
    return {
      payerAccount: payer ? { id: payer.id, name: payer.name } : null,
      children: [],
      householdOutstanding: 0,
      householdPaid: 0,
      walletBalance: 0,
      recentPayments: [],
    };
  }

  // Get all invoices for these children
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .in("student_id", childIds)
    .order("billing_year", { ascending: false })
    .order("billing_month", { ascending: false });

  const invList = invoices ?? [];

  // Wallet balance if payer exists
  let walletBalance = 0;
  if (payer) {
    const { data: walletEntries } = await supabase
      .from("billing_ledger")
      .select("debit, credit")
      .eq("payer_account_id", payer.id)
      .in("entry_type", [...WALLET_ENTRY_TYPES]);
    for (const e of walletEntries ?? []) {
      walletBalance += ((e as any).credit || 0) - ((e as any).debit || 0);
    }
  }

  // Recent payments
  const invIds = invList.map((i: any) => i.id);
  let recentPayments: any[] = [];
  if (invIds.length > 0) {
    const { data: pmts } = await supabase
      .from("payments")
      .select("id, amount, payment_date, payment_method, invoice_id, invoices(invoice_number, students(first_name, last_name))")
      .in("invoice_id", invIds)
      .order("payment_date", { ascending: false })
      .limit(10);
    recentPayments = (pmts ?? []).map((p: any) => ({
      id: p.id,
      amount: p.amount,
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      invoice_number: p.invoices?.invoice_number ?? "",
      student_name: p.invoices?.students
        ? `${p.invoices.students.first_name} ${p.invoices.students.last_name}`
        : "",
      invoice_id: p.invoice_id,
    }));
  }

  // Group by child
  let householdOutstanding = 0, householdPaid = 0;
  const childData = children.map((c: any) => {
    const childInvoices = invList
      .filter((i: any) => i.student_id === c.id)
      .map((inv: any) => {
        const outstanding = inv.total_amount - (inv.amount_paid || 0);
        const daysOverdue = inv.due_date ? calculateDaysOverdue(inv.due_date) : 0;
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          student_id: c.id,
          student_name: `${c.first_name} ${c.last_name}`,
          billing_month: inv.billing_month,
          billing_year: inv.billing_year,
          due_date: inv.due_date,
          total_amount: inv.total_amount,
          amount_paid: inv.amount_paid || 0,
          outstanding,
          status: inv.status,
          days_overdue: daysOverdue,
          aging_bucket: getAgingBucket(daysOverdue),
          branch_id: inv.branch_id,
          subtotal: inv.subtotal ?? inv.total_amount,
          discount_amount: inv.discount_amount || 0,
          tax_amount: inv.tax_amount || 0,
          issued_date: inv.issued_date || inv.created_at,
          notes: inv.notes ?? null,
        };
      });

    const totalOutstanding = childInvoices
      .filter((i) => ["issued", "partial", "overdue"].includes(i.status))
      .reduce((s, i) => s + i.outstanding, 0);
    const totalPaid = childInvoices.reduce((s, i) => s + i.amount_paid, 0);

    householdOutstanding += totalOutstanding;
    householdPaid += totalPaid;

    return {
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      invoices: childInvoices,
      totalOutstanding,
      totalPaid,
    };
  });

  return {
    payerAccount: payer ? { id: payer.id, name: payer.name } : null,
    children: childData,
    householdOutstanding,
    householdPaid,
    walletBalance,
    recentPayments,
  };
}
