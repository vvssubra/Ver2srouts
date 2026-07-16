import { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { ReversePaymentDialog } from "@/components/finance/ReversePaymentDialog";
import { ApplyWalletCreditDialog } from "@/components/finance/ApplyWalletCreditDialog";
import { PaymentTimeline } from "@/components/finance/PaymentTimeline";
import { AuditActivityPanel } from "@/components/finance/AuditActivityPanel";
import { LedgerDrilldownPanel } from "@/components/finance/LedgerDrilldownPanel";
import { WalletPanel } from "@/components/finance/WalletPanel";
import { InvoiceRiskIndicator } from "@/components/finance/InvoiceRiskIndicator";
import { CancelInvoiceDialog } from "@/components/finance/CancelInvoiceDialog";
import { EditBillingPeriodDialog } from "@/components/finance/EditBillingPeriodDialog";
import InvoicePrintView from "@/components/InvoicePrintView";
import type { InvoiceData } from "@/components/InvoicePrintView";
import { issueInvoice, cancelInvoice } from "@/lib/billing-service";
import { voidInvoice } from "@/lib/finance/invoice-service";
import { getWalletBalance } from "@/lib/finance/wallet-service";
import { formatCurrency } from "@/lib/finance/constants";
import { useApprovalGate } from "@/hooks/use-approval-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CreditCard, Download, Send, XCircle, FileText, RotateCcw, Wallet, Receipt, ShieldAlert, CalendarCog } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useBackToStudent } from "@/hooks/use-back-to-student";
import BackToContextBar from "@/components/navigation/BackToContextBar";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const back = useBackToStudent();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [reversalPayment, setReversalPayment] = useState<any>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelDialogVoid, setCancelDialogVoid] = useState(false);
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const gate = useApprovalGate();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-invoice", id] });
    queryClient.invalidateQueries({ queryKey: ["finance-audit", id] });
    queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
  };

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["finance-invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, students(id, first_name, last_name, class_name, branch_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: lineItems } = useQuery({
    queryKey: ["finance-invoice-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("invoice_items").select("*").eq("invoice_id", id!).order("created_at");
      return data || [];
    },
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["finance-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("invoice_id", id!).order("payment_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["finance-audit", id],
    queryFn: async () => {
      const { data } = await supabase.from("billing_audit_logs").select("*").eq("entity_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: walletData } = useQuery({
    queryKey: ["wallet-balance-invoice", invoice?.payer_account_id],
    queryFn: () => getWalletBalance(invoice!.payer_account_id!),
    enabled: !!invoice?.payer_account_id,
  });

  // Fetch branch settings for PDF
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings-invoice", invoice?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("*").eq("branch_id", invoice!.branch_id).single();
      return data;
    },
    enabled: !!invoice?.branch_id,
  });

  const { data: branchInfo } = useQuery({
    queryKey: ["branch-info-invoice", invoice?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*, organizations(name)").eq("id", invoice!.branch_id).single();
      return data;
    },
    enabled: !!invoice?.branch_id,
  });

  const handleIssue = async () => {
    if (!invoice || actionLoading) return;
    setActionLoading(true);
    try {
      await issueInvoice({
        invoiceId: invoice.id, branchId: invoice.branch_id, invoiceNumber: invoice.invoice_number,
        totalAmount: invoice.total_amount, payerAccountId: invoice.payer_account_id,
        actorId: user?.id || "", actorName: user?.email || "",
      });
      toast.success("Invoice issued successfully");
      invalidateAll();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(false); }
  };

  const handleCancelOrVoid = async (reason: string) => {
    if (!invoice || actionLoading) return;
    const hasPayments = (invoice.amount_paid || 0) > 0;
    setActionLoading(true);
    try {
      // Gate through approval
      const result = await gate.check({
        branchId: invoice.branch_id,
        actionType: "invoice_cancellation",
        amount: invoice.total_amount,
        entityType: "invoice",
        entityId: invoice.id,
        requestSummary: `${hasPayments ? "Void" : "Cancel"} invoice ${invoice.invoice_number} (${formatCurrency(invoice.total_amount)})${hasPayments ? ` — ${formatCurrency(invoice.amount_paid || 0)} in payments will be reversed` : ""}`,
        requestDetails: {
          invoice_number: invoice.invoice_number,
          total_amount: invoice.total_amount,
          amount_paid: invoice.amount_paid || 0,
          reason,
          is_void: hasPayments,
        },
        supportingNotes: reason,
        priority: hasPayments ? "high" : "normal",
        requesterId: user?.id || "",
      });

      if (result === "submitted" || result === "already_pending") {
        setCancelDialogOpen(false);
        invalidateAll();
        return;
      }

      // No approval needed — execute directly
      if (hasPayments) {
        await voidInvoice({
          invoiceId: invoice.id,
          branchId: invoice.branch_id,
          invoiceNumber: invoice.invoice_number,
          totalAmount: invoice.total_amount,
          payerAccountId: invoice.payer_account_id,
          reason,
          actorId: user?.id || "",
          actorName: user?.email || "",
        });
        toast.success("Invoice voided — all payments reversed and invoice cancelled");
      } else {
        await cancelInvoice({
          invoiceId: invoice.id, branchId: invoice.branch_id, invoiceNumber: invoice.invoice_number,
          totalAmount: invoice.total_amount, amountPaid: 0,
          payerAccountId: invoice.payer_account_id, reason,
          actorId: user?.id || "", actorName: user?.email || "",
        });
        toast.success("Invoice cancelled");
      }
      setCancelDialogOpen(false);
      invalidateAll();
    } catch (err: any) { toast.error(err.message); }
    finally { setActionLoading(false); }
  };

  const buildPrintData = (): InvoiceData | null => {
    if (!invoice) return null;
    const student = invoice.students as any;
    return {
      invoiceNumber: invoice.invoice_number,
      studentName: student ? `${student.first_name} ${student.last_name}` : "Student",
      branchName: (branchInfo as any)?.name || "",
      organizationName: (branchInfo as any)?.organizations?.name || "",
      billingMonth: invoice.billing_month,
      billingYear: invoice.billing_year,
      dueDate: invoice.due_date || "",
      issuedAt: invoice.issued_date || invoice.created_at,
      status: invoice.status,
      subtotal: invoice.subtotal || invoice.total_amount || 0,
      discountTotal: invoice.discount_amount || 0,
      taxAmount: invoice.tax_amount || 0,
      totalAmount: invoice.total_amount || 0,
      amountPaid: invoice.amount_paid || 0,
      notes: invoice.notes,
      items: (lineItems || []).map((item: any) => {
        const qty = Number(item.quantity) || 1;
        const unit = Number(item.unit_price) || 0;
        const disc = Number(item.discount_amount ?? item.discount ?? 0);
        const stored = Number(item.amount ?? item.total ?? 0);
        const computed = qty * unit - disc;
        const amount = stored > 0 ? stored : computed;
        return { description: item.description, quantity: qty, unitPrice: unit, discount: disc, amount };
      }),
      payments: (payments || []).filter((p: any) => p.amount > 0).map((p: any) => ({
        date: p.payment_date, method: p.payment_method || "cash",
        amount: p.amount, reference: p.payment_reference ?? p.reference_number,
      })),
      logoUrl: branchSettings?.logo_url || undefined,
      schoolName: branchSettings?.school_display_name || undefined,
      registrationNo: branchSettings?.business_registration_no || undefined,
      schoolAddress: branchSettings?.address_line || undefined,
      schoolPhone: branchSettings?.phone || undefined,
      schoolEmail: branchSettings?.email || undefined,
      invoiceTerms: branchSettings?.invoice_terms || undefined,
      receiptFooter: branchSettings?.receipt_footer || undefined,
    };
  };

  const handleDownload = async (type: "invoice" | "receipt") => {
    // Cache-bust: force-refetch invoice + branding so the print reflects the latest state
    const cacheBust = Date.now();
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["finance-invoice", id] }),
      queryClient.refetchQueries({ queryKey: ["branch-settings-invoice", invoice?.branch_id] }),
      queryClient.refetchQueries({ queryKey: ["branch-info-invoice", invoice?.branch_id] }),
    ]);
    const printData = buildPrintData();
    if (!printData) return;
    // Receipt mode: keep the real status (so partial payments still show
    // "PARTIAL" with the outstanding balance), but tell the print view to
    // render the document as an OFFICIAL RECEIPT.
    if (type === "receipt") printData.documentMode = "receipt";
    if (printData.logoUrl) {
      const sep = printData.logoUrl.includes("?") ? "&" : "?";
      printData.logoUrl = `${printData.logoUrl}${sep}v=${cacheBust}`;
    }
    const docLabel = type === "receipt"
      ? "Receipt"
      : printData.status === "cancelled" ? "Cancelled Invoice" : "Invoice";

    // Render React in the CURRENT window (off-screen) and snapshot HTML so the
    // popup never races with React's commit cycle.
    const stagingHost = document.createElement("div");
    stagingHost.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
    document.body.appendChild(stagingHost);
    const stagingRoot = createRoot(stagingHost);
    flushSync(() => {
      // @ts-ignore
      stagingRoot.render(<InvoicePrintView data={printData} />);
    });

    // Wait for staged images to settle
    await new Promise<void>((resolve) => {
      const imgs = Array.from(stagingHost.querySelectorAll("img"));
      if (imgs.length === 0) return resolve();
      let pending = imgs.length;
      const done = () => { if (--pending <= 0) resolve(); };
      const cap = setTimeout(resolve, 2000);
      imgs.forEach((img) => {
        if ((img as HTMLImageElement).complete) { done(); return; }
        img.addEventListener("load", () => done(), { once: true });
        img.addEventListener("error", () => done(), { once: true });
      });
      Promise.resolve().then(() => clearTimeout(cap));
    });

    const renderedHtml = stagingHost.innerHTML;

    const w = window.open(`about:blank#print-${cacheBust}`, "_blank");
    if (!w) {
      stagingRoot.unmount();
      stagingHost.remove();
      toast.error("Please allow pop-ups to download");
      return;
    }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html><head>
      <title>${docLabel} — ${printData.invoiceNumber}</title>
      <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
      <meta http-equiv="Pragma" content="no-cache" />
      <meta http-equiv="Expires" content="0" />
      <meta name="x-build" content="${cacheBust}" />
      <style>@media print { body { margin: 0; } } body { margin: 0; background: white; font-family:'Segoe UI',system-ui,-apple-system,sans-serif; }</style>
    </head><body>${renderedHtml}<!-- build:${cacheBust} --></body></html>`);
    w.document.close();

    stagingRoot.unmount();
    stagingHost.remove();

    const triggerPrint = () => { try { w.focus(); w.print(); } catch {} };
    const popupImgs = Array.from(w.document.images);
    if (popupImgs.length === 0) {
      setTimeout(triggerPrint, 250);
      return;
    }
    let pending = popupImgs.length;
    const done = () => { if (--pending <= 0) setTimeout(triggerPrint, 100); };
    popupImgs.forEach((img) => {
      if (img.complete) { done(); return; }
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
    setTimeout(triggerPrint, 2500);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!invoice) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <h2 className="text-lg font-semibold">Invoice not found</h2>
          <Button variant="outline" onClick={() => navigate("/finance/invoices")} className="mt-4">Back to Invoices</Button>
        </div>
      </DashboardLayout>
    );
  }

  const balance = (invoice.total_amount || 0) - (invoice.amount_paid || 0);
  const student = invoice.students as any;
  const canRecordPayment = ["issued", "partial", "overdue"].includes(invoice.status);
  const canIssue = invoice.status === "draft";
  const canCancel = ["draft", "issued", "overdue"].includes(invoice.status) && (invoice.amount_paid || 0) === 0;
  const canVoid = ["partial", "paid", "overdue"].includes(invoice.status) && (invoice.amount_paid || 0) > 0;
  const isManager = ["super_admin", "franchisee", "admin"].includes(role || "");
  const canEditPeriod = isManager && !["cancelled", "void"].includes(invoice.status);
  const isPaid = invoice.status === "paid";
  const hasPayments = (invoice.amount_paid || 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {back.active ? (
              <BackToContextBar />
            ) : (
              <Button variant="ghost" size="icon" onClick={() => navigate("/finance/invoices")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight font-mono">{invoice.invoice_number}</h1>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {student ? `${student.first_name} ${student.last_name}` : "Unknown Student"}
                {student?.class_name && ` · ${student.class_name}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canIssue && isManager && (
              <Button onClick={handleIssue} className="gap-2" disabled={actionLoading}>
                <Send className="h-4 w-4" /> Issue Invoice
              </Button>
            )}
            {canRecordPayment && isManager && (
              <Button onClick={() => setPaymentOpen(true)} variant="outline" className="gap-2">
                <CreditCard className="h-4 w-4" /> Record Payment
              </Button>
            )}
            {canRecordPayment && isManager && invoice.payer_account_id && (walletData?.available || 0) > 0 && (
              <Button onClick={() => setWalletOpen(true)} variant="outline" className="gap-2">
                <Wallet className="h-4 w-4" /> Use Wallet ({formatCurrency(walletData?.available || 0)})
              </Button>
            )}
            {canCancel && isManager && (
              <Button onClick={() => { setCancelDialogVoid(false); setCancelDialogOpen(true); }} variant="outline" className="gap-2 text-destructive hover:text-destructive" disabled={actionLoading}>
                <XCircle className="h-4 w-4" /> Cancel Invoice
              </Button>
            )}
            {canVoid && isManager && (
              <Button onClick={() => { setCancelDialogVoid(true); setCancelDialogOpen(true); }} variant="outline" className="gap-2 text-destructive hover:text-destructive" disabled={actionLoading}>
                <ShieldAlert className="h-4 w-4" /> Void Invoice
              </Button>
            )}
            {canEditPeriod && (
              <Button onClick={() => setEditPeriodOpen(true)} variant="outline" className="gap-2" disabled={actionLoading}>
                <CalendarCog className="h-4 w-4" /> Edit Billing Period
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => handleDownload("invoice")}>
              <Download className="h-4 w-4" /> Invoice
            </Button>
            {hasPayments && (
              <Button variant="outline" className="gap-2" onClick={() => handleDownload("receipt")}>
                <Receipt className="h-4 w-4" /> Receipt
              </Button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <InvoiceRiskIndicator invoiceId={invoice.id} amountPaid={invoice.amount_paid || 0} />

            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Issue Date</p>
                    <p className="font-medium">{invoice.issued_date ? format(new Date(invoice.issued_date), "dd MMM yyyy") : invoice.created_at ? format(new Date(invoice.created_at), "dd MMM yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p className="font-medium">{invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Billing Period</p>
                    <p className="font-medium">{invoice.billing_month}/{invoice.billing_year}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Student</p>
                    <p className="font-medium">{student ? `${student.first_name} ${student.last_name}` : "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[80px]">Qty</TableHead>
                      <TableHead className="text-right w-[100px]">Unit Price</TableHead>
                      <TableHead className="text-right w-[100px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems && lineItems.length > 0 ? lineItems.map((item: any) => {
                      const qty = Number(item.quantity) || 1;
                      const unit = Number(item.unit_price) || 0;
                      const disc = Number(item.discount_amount ?? item.discount ?? 0);
                      const stored = Number(item.amount ?? item.total ?? 0);
                      const lineTotal = stored > 0 ? stored : qty * unit - disc;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-right">{qty}</TableCell>
                          <TableCell className="text-right">RM {unit.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">RM {lineTotal.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    }) : (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No line items</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Tabs defaultValue="payments" className="space-y-4">
              <TabsList>
                <TabsTrigger value="payments">Payments ({payments?.length || 0})</TabsTrigger>
                <TabsTrigger value="ledger">Subledger</TabsTrigger>
                <TabsTrigger value="audit">Audit Trail</TabsTrigger>
              </TabsList>
              <TabsContent value="payments">
                <Card><CardContent className="pt-6">
                  <PaymentTimeline payments={(payments || []) as any} onReverse={isManager ? (payment: any) => setReversalPayment(payment) : undefined} />
                </CardContent></Card>
              </TabsContent>
              <TabsContent value="ledger">
                <Card><CardHeader className="pb-3"><CardTitle className="text-base">Invoice Subledger</CardTitle></CardHeader>
                  <CardContent><LedgerDrilldownPanel invoiceId={invoice.id} /></CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="audit">
                <Card><CardContent className="pt-6"><AuditActivityPanel entries={auditLogs || []} /></CardContent></Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader className="pb-3"><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>RM {(invoice.subtotal || invoice.total_amount || 0).toFixed(2)}</span>
                  </div>
                  {(invoice.discount_amount ?? 0) > 0 && (
                    <div className="flex justify-between text-success">
                      <span>Discount</span><span>- RM {(invoice.discount_amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {(invoice.tax_amount ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax ({invoice.tax_rate || 0}%)</span>
                      <span>RM {(invoice.tax_amount || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span><span>RM {(invoice.total_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="text-success font-medium">RM {(invoice.amount_paid || 0).toFixed(2)}</span>
                </div>
                <Separator />
                <div className={`flex justify-between text-lg font-bold ${balance > 0 ? "text-destructive" : "text-success"}`}>
                  <span>Balance Due</span><span>RM {balance.toFixed(2)}</span>
                </div>
                {invoice.total_amount > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Payment Progress</span>
                      <span>{Math.round(((invoice.amount_paid || 0) / invoice.total_amount) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-success/30 rounded-full transition-all" style={{ width: `${Math.min(((invoice.amount_paid || 0) / invoice.total_amount) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}
                {canRecordPayment && isManager && (
                  <div className="space-y-2 mt-4">
                    <Button onClick={() => setPaymentOpen(true)} className="w-full gap-2"><CreditCard className="h-4 w-4" /> Record Payment</Button>
                    {invoice.payer_account_id && (walletData?.available || 0) > 0 && (
                      <Button onClick={() => setWalletOpen(true)} variant="outline" className="w-full gap-2">
                        <Wallet className="h-4 w-4" /> Use Wallet Credit ({formatCurrency(walletData?.available || 0)})
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {invoice.payer_account_id && <WalletPanel payerAccountId={invoice.payer_account_id} branchId={invoice.branch_id} compact />}
          </div>
        </div>
      </div>

      {invoice && <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={{ id: invoice.id, invoice_number: invoice.invoice_number, total_amount: invoice.total_amount, amount_paid: invoice.amount_paid || 0, branch_id: invoice.branch_id, student_id: invoice.student_id, payer_account_id: invoice.payer_account_id }} />}
      {invoice && reversalPayment && <ReversePaymentDialog open={!!reversalPayment} onOpenChange={(open) => { if (!open) setReversalPayment(null); }} payment={reversalPayment} invoice={{ id: invoice.id, invoice_number: invoice.invoice_number, branch_id: invoice.branch_id, payer_account_id: invoice.payer_account_id }} />}
      {invoice && invoice.payer_account_id && <ApplyWalletCreditDialog open={walletOpen} onOpenChange={setWalletOpen} invoice={{ id: invoice.id, invoice_number: invoice.invoice_number, total_amount: invoice.total_amount, amount_paid: invoice.amount_paid || 0, branch_id: invoice.branch_id, payer_account_id: invoice.payer_account_id }} />}
      {invoice && (
        <CancelInvoiceDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          invoice={{ id: invoice.id, invoice_number: invoice.invoice_number, total_amount: invoice.total_amount, amount_paid: invoice.amount_paid || 0, status: invoice.status }}
          isVoid={cancelDialogVoid}
          loading={actionLoading || gate.checking}
          onConfirm={handleCancelOrVoid}
        />
      )}
      {invoice && (
        <EditBillingPeriodDialog
          open={editPeriodOpen}
          onOpenChange={setEditPeriodOpen}
          invoice={{
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            branch_id: invoice.branch_id,
            billing_month: invoice.billing_month,
            billing_year: invoice.billing_year,
          }}
          actorId={user?.id || ""}
          actorName={(user as any)?.user_metadata?.full_name || user?.email || "Unknown"}
          onSuccess={invalidateAll}
        />
      )}
    </DashboardLayout>
  );
}