/**
 * Invoice operations: create, issue, cancel.
 * All mutations write to ledger + audit via ledger-core.
 */

import { supabase } from "@/integrations/supabase/client";
import { writeLedgerEntry, writeAuditEntry } from "./ledger-core";

// ─── Issue Invoice ────────────────────────────────────────────────────────────

export async function issueInvoice(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  totalAmount: number;
  payerAccountId?: string | null;
  actorId: string;
  actorName: string;
}) {
  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", params.invoiceId)
    .single();
  if (fetchErr || !invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") throw new Error(`Cannot issue invoice in '${invoice.status}' state`);

  const { error: updateErr } = await supabase
    .from("invoices")
    .update({ status: "issued", issued_date: new Date().toISOString().split("T")[0] })
    .eq("id", params.invoiceId);
  if (updateErr) throw new Error(`Failed to issue invoice: ${updateErr.message}`);

  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payer_account_id: params.payerAccountId,
    entry_type: "invoice_issued",
    debit: params.totalAmount,
    description: `Invoice ${params.invoiceNumber} issued`,
    created_by: params.actorId,
  });

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "invoice_issued",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: { total_amount: params.totalAmount },
  });
}

// ─── Cancel Invoice ───────────────────────────────────────────────────────────

// ─── Update Billing Period (metadata-only correction) ────────────────────────

export async function updateInvoiceBillingPeriod(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  month: number;
  year: number;
  reason: string;
  actorId: string;
  actorName: string;
}) {
  if (!Number.isInteger(params.month) || params.month < 1 || params.month > 12) {
    throw new Error("Month must be between 1 and 12");
  }
  if (!Number.isInteger(params.year) || params.year < 2000 || params.year > 2100) {
    throw new Error("Year is invalid");
  }
  if (!params.reason || params.reason.trim().length < 5) {
    throw new Error("Please provide a reason (min 5 characters)");
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("status, billing_month, billing_year")
    .eq("id", params.invoiceId)
    .single();
  if (fetchErr || !invoice) throw new Error("Invoice not found");
  if (invoice.status === "cancelled" || invoice.status === "void") {
    throw new Error("Cannot edit billing period on a cancelled or void invoice");
  }
  if (invoice.billing_month === params.month && invoice.billing_year === params.year) {
    throw new Error("Billing period is unchanged");
  }

  const { error: updateErr } = await supabase
    .from("invoices")
    .update({ billing_month: params.month, billing_year: params.year })
    .eq("id", params.invoiceId);
  if (updateErr) throw new Error(`Failed to update billing period: ${updateErr.message}`);

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "billing_period_corrected",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason.trim(),
    old_values: { billing_month: invoice.billing_month, billing_year: invoice.billing_year },
    new_values: { billing_month: params.month, billing_year: params.year, invoice_number: params.invoiceNumber },
  });
}

export async function cancelInvoice(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  totalAmount: number;
  amountPaid: number;
  payerAccountId?: string | null;
  reason: string;
  actorId: string;
  actorName: string;
}) {
  if (params.amountPaid > 0) {
    throw new Error("Cannot cancel an invoice with recorded payments. Reverse payments first, then cancel.");
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", params.invoiceId)
    .single();
  if (fetchErr || !invoice) throw new Error("Invoice not found");
  if (invoice.status === "cancelled") throw new Error("Invoice is already cancelled");
  if (invoice.status === "paid") throw new Error("Cannot cancel a fully paid invoice");

  const wasIssued = invoice.status !== "draft";

  const { error: updateErr } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", params.invoiceId);
  if (updateErr) throw new Error(`Failed to cancel: ${updateErr.message}`);

  if (wasIssued) {
    await writeLedgerEntry({
      branch_id: params.branchId,
      invoice_id: params.invoiceId,
      payer_account_id: params.payerAccountId,
      entry_type: "invoice_cancelled",
      credit: params.totalAmount,
      description: `Invoice ${params.invoiceNumber} cancelled — ${params.reason}`,
      created_by: params.actorId,
    });
  }

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "invoice_cancelled",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason,
    old_values: { status: invoice.status },
    new_values: { status: "cancelled" },
  });
}

// ─── Create Invoice ───────────────────────────────────────────────────────────

export interface CreateInvoiceParams {
  branchId: string;
  studentId: string;
  payerAccountId?: string | null;
  dueDate: string;
  billingMonth: number;
  billingYear: number;
  notes?: string | null;
  subtotal: number;
  discountAmount: number;
  discountDescription?: string | null;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
    fee_package_id?: string | null;
  }>;
  issueImmediately: boolean;
  actorId: string;
  actorName: string;
}

// ─── Void Invoice (reverse payments + cancel) ────────────────────────────────

export async function voidInvoice(params: {
  invoiceId: string;
  branchId: string;
  invoiceNumber: string;
  totalAmount: number;
  payerAccountId?: string | null;
  reason: string;
  actorId: string;
  actorName: string;
  approvalRequestId?: string;
}) {
  // 1. Get all positive payments for this invoice
  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, amount, payment_method, payment_reference")
    .eq("invoice_id", params.invoiceId)
    .gt("amount", 0);
  if (payErr) throw new Error(`Failed to fetch payments: ${payErr.message}`);

  // 2. Reverse each payment with compensating entries
  for (const p of payments || []) {
    // Check if already reversed
    const { data: existing } = await supabase
      .from("billing_ledger")
      .select("id")
      .eq("payment_id", p.id)
      .eq("entry_type", "payment_reversed")
      .limit(1);
    if (existing && existing.length > 0) continue; // skip already reversed

    // Insert compensating negative payment
    const { data: rev, error: revErr } = await supabase
      .from("payments")
      .insert({
        invoice_id: params.invoiceId,
        amount: -p.amount,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: p.payment_method,
        payment_reference: `VOID-${p.payment_reference || p.id.slice(0, 8)}`,
        notes: `Voided: ${params.reason}`,
        received_by: params.actorId,
      })
      .select("id")
      .single();
    if (revErr) throw new Error(`Reversal failed for payment ${p.id}: ${revErr.message}`);

    await writeLedgerEntry({
      branch_id: params.branchId,
      invoice_id: params.invoiceId,
      payment_id: p.id,
      payer_account_id: params.payerAccountId,
      entry_type: "payment_reversed",
      debit: p.amount,
      description: `Void reversal for ${params.invoiceNumber} — ${params.reason}`,
      reference_number: `VOID-${p.payment_reference || p.id.slice(0, 8)}`,
      created_by: params.actorId,
      metadata: {
        original_payment_id: p.id,
        reversal_payment_id: rev.id,
        void_reason: params.reason,
        ...(params.approvalRequestId ? { approval_request_id: params.approvalRequestId } : {}),
      },
    });
  }

  // 3. Cancel the invoice (amount_paid should now be 0 after trigger recalcs)
  // Small delay to let the trigger recalculate
  const { error: cancelErr } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", params.invoiceId);
  if (cancelErr) throw new Error(`Failed to cancel invoice: ${cancelErr.message}`);

  // 4. Write cancellation ledger entry (credit to reverse the original debit)
  await writeLedgerEntry({
    branch_id: params.branchId,
    invoice_id: params.invoiceId,
    payer_account_id: params.payerAccountId,
    entry_type: "invoice_cancelled",
    credit: params.totalAmount,
    description: `Invoice ${params.invoiceNumber} voided — ${params.reason}`,
    created_by: params.actorId,
    metadata: {
      void: true,
      payments_reversed: (payments || []).length,
      ...(params.approvalRequestId ? { approval_request_id: params.approvalRequestId } : {}),
    },
  });

  // 5. Audit trail
  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: params.invoiceId,
    action: "invoice_voided",
    actor_id: params.actorId,
    actor_name: params.actorName,
    reason: params.reason,
    new_values: {
      status: "cancelled",
      payments_reversed: (payments || []).length,
      total_reversed: (payments || []).reduce((s: number, p: any) => s + p.amount, 0),
      approval_request_id: params.approvalRequestId ?? null,
    },
  });
}

// ─── Create Invoice ───────────────────────────────────────────────────────────

export async function createInvoice(params: CreateInvoiceParams) {
  if (params.lineItems.length === 0) throw new Error("Invoice must have at least one line item");
  if (params.totalAmount <= 0) throw new Error("Invoice total must be positive");

  // Auto-resolve payer_account_id if not provided
  let payerAccountId = params.payerAccountId ?? null;
  if (!payerAccountId && params.studentId) {
    const { data: parentLink } = await supabase
      .from("parent_students")
      .select("parent_id")
      .eq("student_id", params.studentId)
      .limit(1)
      .single();
    if (parentLink) {
      const { data: payer } = await supabase
        .from("payer_accounts")
        .select("id")
        .eq("primary_parent_id", parentLink.parent_id)
        .eq("branch_id", params.branchId)
        .limit(1)
        .single();
      if (payer) payerAccountId = payer.id;
    }
  }

  const { data: invNum, error: numErr } = await supabase.rpc("generate_invoice_number");
  if (numErr) throw new Error(`Number generation failed: ${numErr.message}`);

  const status = params.issueImmediately ? "issued" : "draft";
  const { data: newInvoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      branch_id: params.branchId,
      student_id: params.studentId,
      payer_account_id: payerAccountId,
      invoice_number: invNum,
      status,
      total_amount: params.totalAmount,
      amount_paid: 0,
      due_date: params.dueDate,
      billing_month: params.billingMonth,
      billing_year: params.billingYear,
      notes: params.notes || null,
      created_by: params.actorId,
      subtotal: params.subtotal,
      discount_amount: params.discountAmount,
      discount_description: params.discountDescription || null,
      tax_amount: params.taxAmount,
      tax_rate: params.taxRate,
      issued_date: params.issueImmediately ? new Date().toISOString().split("T")[0] : null,
    })
    .select("id")
    .single();
  if (invErr) throw new Error(`Invoice creation failed: ${invErr.message}`);

  const items = params.lineItems.map((li) => ({
    invoice_id: newInvoice.id,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_price,
    amount: li.total,
    fee_package_id: li.fee_package_id || null,
  }));
  const { error: itemErr } = await supabase.from("invoice_items").insert(items);
  if (itemErr) throw new Error(`Line items failed: ${itemErr.message}`);

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "invoice",
    entity_id: newInvoice.id,
    action: params.issueImmediately ? "invoice_issued" : "invoice_created",
    actor_id: params.actorId,
    actor_name: params.actorName,
    new_values: {
      invoice_number: invNum,
      total: params.totalAmount,
      items_count: params.lineItems.length,
      status,
    },
  });

  if (params.issueImmediately) {
    await writeLedgerEntry({
      branch_id: params.branchId,
      invoice_id: newInvoice.id,
      payer_account_id: params.payerAccountId,
      entry_type: "invoice_issued",
      debit: params.totalAmount,
      description: `Invoice ${invNum} issued`,
      created_by: params.actorId,
    });
  }

  return { id: newInvoice.id, invoiceNumber: invNum };
}
