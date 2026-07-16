import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Receipt, CreditCard, Loader2, ChevronDown, Download, Wallet,
  Users, Clock, CheckCircle, AlertTriangle, CalendarDays, Ban, History, ListChecks,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import InvoicePrintView from "@/components/InvoicePrintView";
import type { InvoiceData } from "@/components/InvoicePrintView";
import PaymentReceiptPrintView from "@/components/PaymentReceiptPrintView";
import type { PaymentReceiptData } from "@/components/PaymentReceiptPrintView";
import { getParentHouseholdSummary } from "@/lib/finance/payer-service";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-primary/15 text-primary",
  paid: "bg-accent/15 text-accent",
  partial: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Render an invoice/receipt in a new window and trigger print.
 * Extracted from InvoiceCard so the Payments tab can reuse it.
 */
async function downloadInvoicePdf(inv: any) {
  const cacheBust = Date.now();
  const [{ data: freshInv }, { data: items }, { data: pmts }, { data: branchSettings }, { data: branchInfo }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", inv.id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", inv.id).order("created_at"),
    supabase.from("payments").select("*").eq("invoice_id", inv.id).order("payment_date"),
    inv.branch_id
      ? supabase.from("branch_settings").select("*").eq("branch_id", inv.branch_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    inv.branch_id
      ? supabase.from("branches").select("name, organizations(name)").eq("id", inv.branch_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  const live = { ...inv, ...(freshInv || {}) };
  const bs: any = branchSettings || {};
  const bi: any = branchInfo || {};
  const bustUrl = (u?: string | null) =>
    u ? `${u}${u.includes("?") ? "&" : "?"}v=${cacheBust}` : undefined;
  const printData: InvoiceData = {
    invoiceNumber: live.invoice_number,
    studentName: inv.student_name,
    branchName: bi.name || "",
    organizationName: bi.organizations?.name || "",
    billingMonth: live.billing_month,
    billingYear: live.billing_year,
    dueDate: live.due_date,
    issuedAt: live.issued_date || undefined,
    status: live.status,
    subtotal: live.subtotal ?? live.total_amount,
    discountTotal: live.discount_amount || 0,
    taxAmount: live.tax_amount || 0,
    totalAmount: live.total_amount,
    amountPaid: live.amount_paid ?? 0,
    notes: live.notes || undefined,
    items: (items ?? []).map((it: any) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unit_price, discount: it.discount, amount: it.amount })),
    payments: (pmts ?? []).map((p: any) => ({ date: p.payment_date, method: p.payment_method, amount: p.amount, reference: p.payment_reference })),
    logoUrl: bustUrl(bs.logo_url),
    schoolName: bs.school_display_name || undefined,
    registrationNo: bs.business_registration_no || undefined,
    schoolAddress: bs.address_line || undefined,
    schoolPhone: bs.phone || undefined,
    schoolEmail: bs.email || undefined,
    invoiceTerms: bs.invoice_terms || undefined,
    receiptFooter: bs.receipt_footer || undefined,
  };
  const stagingHost = document.createElement("div");
  stagingHost.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(stagingHost);
  const stagingRoot = ReactDOM.createRoot(stagingHost);
  flushSync(() => {
    stagingRoot.render(<InvoicePrintView data={printData} />);
  });
  await new Promise<void>((resolve) => {
    const imgs = Array.from(stagingHost.querySelectorAll("img"));
    if (imgs.length === 0) return resolve();
    let pending = imgs.length;
    const done = () => { if (--pending <= 0) resolve(); };
    const hardCap = setTimeout(resolve, 2000);
    imgs.forEach((img) => {
      if ((img as HTMLImageElement).complete) { done(); return; }
      img.addEventListener("load", () => { done(); }, { once: true });
      img.addEventListener("error", () => { done(); }, { once: true });
    });
    Promise.resolve().then(() => clearTimeout(hardCap));
  });
  const renderedHtml = stagingHost.innerHTML;
  const docLabel = live.status === "paid" ? "Receipt" : live.status === "cancelled" ? "Cancelled Invoice" : "Invoice";
  const w = window.open(`about:blank#print-${cacheBust}`, "_blank");
  if (!w) {
    stagingRoot.unmount();
    stagingHost.remove();
    toast({ title: "Pop-up blocked", description: "Please allow pop-ups to download invoices.", variant: "destructive" });
    return;
  }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${docLabel} — ${live.invoice_number}</title>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="x-build" content="${cacheBust}" />
    <style>@media print{body{margin:0}}body{margin:0;background:white;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}</style>
  </head><body>${renderedHtml}<!-- build:${cacheBust} --></body></html>`);
  w.document.close();
  stagingRoot.unmount();
  stagingHost.remove();
  const triggerPrint = () => { try { w.focus(); w.print(); } catch { /* ignore */ } };
  const popupImgs = Array.from(w.document.images);
  if (popupImgs.length === 0) { setTimeout(triggerPrint, 250); return; }
  let pending = popupImgs.length;
  const done = () => { if (--pending <= 0) setTimeout(triggerPrint, 100); };
  popupImgs.forEach((img) => {
    if (img.complete) { done(); return; }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
  setTimeout(triggerPrint, 2500);
}

/**
 * Render a per-payment receipt in a new window and trigger print.
 * Used by the Payments tab to produce a proper receipt document for a single payment.
 */
async function downloadPaymentReceiptPdf(payment: any, inv: any) {
  const cacheBust = Date.now();
  const [{ data: freshInv }, { data: allPayments }, { data: branchSettings }, { data: branchInfo }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", inv.id).maybeSingle(),
    supabase.from("payments").select("id, amount, payment_date, payment_method, payment_reference").eq("invoice_id", inv.id).order("payment_date", { ascending: true }),
    inv.branch_id
      ? supabase.from("branch_settings").select("*").eq("branch_id", inv.branch_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    inv.branch_id
      ? supabase.from("branches").select("name, organizations(name)").eq("id", inv.branch_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  const live = { ...inv, ...(freshInv || {}) };
  const bs: any = branchSettings || {};
  const bi: any = branchInfo || {};
  const bustUrl = (u?: string | null) => (u ? `${u}${u.includes("?") ? "&" : "?"}v=${cacheBust}` : undefined);

  // Paid-to-date including this payment (by chronological order, tiebreak by id)
  const sorted = (allPayments ?? []).slice().sort((a: any, b: any) => {
    const da = new Date(a.payment_date).getTime(); const db = new Date(b.payment_date).getTime();
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });
  let paidToDate = 0;
  for (const p of sorted) {
    paidToDate += Number(p.amount || 0);
    if (p.id === payment.id) break;
  }
  // Fallback if the payment was not found in fetched list (e.g. reversed)
  if (!sorted.some((p: any) => p.id === payment.id)) {
    paidToDate = Number(payment.amount || 0);
  }
  const invoiceTotal = Number(live.total_amount || 0);
  const balanceAfter = Math.max(0, invoiceTotal - paidToDate);

  const dateStr = new Date(payment.payment_date).toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = String(payment.id).slice(0, 6).toUpperCase();
  const receiptNumber = `RCPT-${live.invoice_number}-${dateStr}-${shortId}`;

  const printData: PaymentReceiptData = {
    receiptNumber,
    invoiceNumber: live.invoice_number,
    studentName: payment.student_name || inv.student_name,
    billingMonth: live.billing_month,
    billingYear: live.billing_year,
    invoiceTotal,
    invoicePaidToDate: paidToDate,
    invoiceBalanceAfter: balanceAfter,
    payment: {
      date: payment.payment_date,
      method: payment.payment_method || "—",
      amount: Number(payment.amount || 0),
      reference: payment.payment_reference || undefined,
    },
    branchName: bi.name || "",
    organizationName: bi.organizations?.name || "",
    logoUrl: bustUrl(bs.logo_url),
    schoolName: bs.school_display_name || undefined,
    registrationNo: bs.business_registration_no || undefined,
    schoolAddress: bs.address_line || undefined,
    schoolPhone: bs.phone || undefined,
    schoolEmail: bs.email || undefined,
    receiptFooter: bs.receipt_footer || undefined,
  };

  const stagingHost = document.createElement("div");
  stagingHost.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(stagingHost);
  const stagingRoot = ReactDOM.createRoot(stagingHost);
  flushSync(() => {
    stagingRoot.render(<PaymentReceiptPrintView data={printData} />);
  });
  await new Promise<void>((resolve) => {
    const imgs = Array.from(stagingHost.querySelectorAll("img"));
    if (imgs.length === 0) return resolve();
    let pending = imgs.length;
    const done = () => { if (--pending <= 0) resolve(); };
    const hardCap = setTimeout(resolve, 2000);
    imgs.forEach((img) => {
      if ((img as HTMLImageElement).complete) { done(); return; }
      img.addEventListener("load", () => { done(); }, { once: true });
      img.addEventListener("error", () => { done(); }, { once: true });
    });
    Promise.resolve().then(() => clearTimeout(hardCap));
  });
  const renderedHtml = stagingHost.innerHTML;
  const w = window.open(`about:blank#print-${cacheBust}`, "_blank");
  if (!w) {
    stagingRoot.unmount();
    stagingHost.remove();
    toast({ title: "Pop-up blocked", description: "Please allow pop-ups to download receipts.", variant: "destructive" });
    return;
  }
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head>
    <title>Receipt — ${receiptNumber}</title>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="x-build" content="${cacheBust}" />
    <style>@media print{body{margin:0}}body{margin:0;background:white;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}</style>
  </head><body>${renderedHtml}<!-- build:${cacheBust} --></body></html>`);
  w.document.close();
  stagingRoot.unmount();
  stagingHost.remove();
  const triggerPrint = () => { try { w.focus(); w.print(); } catch { /* ignore */ } };
  const popupImgs = Array.from(w.document.images);
  if (popupImgs.length === 0) { setTimeout(triggerPrint, 250); return; }
  let pending = popupImgs.length;
  const done = () => { if (--pending <= 0) setTimeout(triggerPrint, 100); };
  popupImgs.forEach((img) => {
    if (img.complete) { done(); return; }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
  setTimeout(triggerPrint, 2500);
}

function InvoiceBreakdown({ invoiceId }: { invoiceId: string }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ["invoice-items", invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading breakdown...</p>;
  if (!items?.length) return <p className="text-xs text-muted-foreground py-2">No line items.</p>;

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-1 border-b">
        <span>Item</span>
        <span className="text-right">Price</span>
        <span className="text-right">Disc</span>
        <span className="text-right">Amount</span>
      </div>
      {items.map((item: any) => (
        <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs py-1">
          <span className="truncate">
            {item.description}
            {item.quantity > 1 && <span className="text-muted-foreground ml-1">×{item.quantity}</span>}
          </span>
          <span className="text-right text-muted-foreground">RM {item.unit_price.toFixed(2)}</span>
          <span className="text-right text-muted-foreground">{item.discount > 0 ? `-RM ${item.discount.toFixed(2)}` : "—"}</span>
          <span className="text-right font-medium">RM {item.amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function InvoiceCard({ inv, onPay }: {
  inv: any;
  onPay: (invoiceId: string) => void;
}) {
  const [paying, setPaying] = useState(false);
  const amountDue = inv.outstanding;
  const isCancelled = inv.status === "cancelled";
  const isPayable = ["issued", "partial", "overdue"].includes(inv.status) && amountDue > 0;

  const handleDownload = () => downloadInvoicePdf(inv);

  const handlePay = async () => {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-billplz-bill", {
        body: { invoice_id: inv.id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
      else throw new Error("No payment URL returned");
    } catch (err: any) {
      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
      setPaying(false);
    }
  };

  if (isCancelled) {
    return (
      <div className="border border-dashed rounded-lg p-4 space-y-2 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium text-muted-foreground line-through">{inv.invoice_number}</p>
            <p className="text-xs text-muted-foreground">
              {MONTHS[inv.billing_month]} {inv.billing_year}
            </p>
          </div>
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1">
            <Ban className="h-3 w-3" /> Cancelled
          </Badge>
        </div>
        <div className="flex items-start gap-2 rounded-md bg-background border p-2.5">
          <CheckCircle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">No payment required.</span>{" "}
            This invoice was cancelled by the school
            {inv.total_amount ? <> (originally RM {inv.total_amount.toFixed(2)})</> : null}.
            If you have questions, please contact the school office.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-sm font-medium">{inv.invoice_number}</p>
          <p className="text-xs text-muted-foreground">
            {MONTHS[inv.billing_month]} {inv.billing_year} · Due: {inv.due_date}
          </p>
        </div>
        <Badge variant="outline" className={STATUS_COLORS[inv.status] ?? ""}>
          {inv.status === "partial" ? "Partially Paid"
            : inv.status === "paid" ? "Paid"
            : inv.status === "overdue" ? "Overdue"
            : inv.status === "issued" ? "Issued"
            : inv.status === "cancelled" ? "Cancelled"
            : inv.status}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-medium">RM {inv.total_amount.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="font-medium text-accent">RM {inv.amount_paid.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Due</p>
          <p className={`font-medium ${amountDue > 0 ? "text-destructive" : "text-accent"}`}>
            RM {amountDue.toFixed(2)}
          </p>
        </div>
      </div>

      {inv.status === "partial" && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800 flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide">Partially Paid</span>
          <span>· RM {inv.amount_paid.toFixed(2)} of RM {inv.total_amount.toFixed(2)} received</span>
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8 px-2">
            <span>View Breakdown</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 border-t mt-1">
          <InvoiceBreakdown invoiceId={inv.id} />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-2">
        {isPayable && (
          <Button size="sm" className="flex-1 gap-2" onClick={handlePay} disabled={paying}>
            {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3 w-3" />}
            {paying ? "Redirecting..." : `Pay RM ${amountDue.toFixed(2)} via FPX`}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={`gap-2 ${!isPayable ? "flex-1" : ""} ${inv.status === "paid" ? "border-accent text-accent hover:bg-accent/10" : ""}`}
          onClick={handleDownload}
        >
          <Download className="h-3 w-3" />
          {inv.status === "paid" ? "Receipt" : "Invoice"}
        </Button>
      </div>
    </div>
  );
}

export default function ParentFees() {
  const { user } = useAuth();

  // Tap-to-clear: any fee/invoice/payment notification routed to /parent-fees
  // should auto-mark as read once the parent opens this page.
  useMarkNotificationsRead(["billing", "invoice", "payment", "fees"]);

  const { data: household, isLoading } = useQuery({
    queryKey: ["parent-household", user?.id],
    queryFn: () => getParentHouseholdSummary(user!.id),
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  // Flatten + group invoices by year/month across all children
  const grouped = useMemo(() => {
    if (!household) return { years: [] as number[], byYearMonth: new Map<string, any[]>() };
    const all: any[] = [];
    for (const child of household.children) {
      for (const inv of child.invoices) {
        all.push({ ...inv, child_first_name: child.first_name, child_last_name: child.last_name, child_id: child.id });
      }
    }
    const byYearMonth = new Map<string, any[]>();
    const yearSet = new Set<number>();
    for (const inv of all) {
      const key = `${inv.billing_year}-${String(inv.billing_month).padStart(2, "0")}`;
      yearSet.add(inv.billing_year);
      if (!byYearMonth.has(key)) byYearMonth.set(key, []);
      byYearMonth.get(key)!.push(inv);
    }
    return {
      years: Array.from(yearSet).sort((a, b) => b - a),
      byYearMonth,
    };
  }, [household]);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [childFilter, setChildFilter] = useState<string>("all");
  const [showCancelled, setShowCancelled] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!household || household.children.length === 0) {
    return (
      <DashboardLayout>
        <div className="text-center py-16 space-y-2">
          <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">No invoices found.</p>
        </div>
      </DashboardLayout>
    );
  }

  const h = household;
  const yearOptions = grouped.years.length ? grouped.years : [currentYear];
  const effectiveYear = yearOptions.includes(selectedYear) ? selectedYear : yearOptions[0];

  // Build month rows for the selected year, optionally filtered by child
  const monthRows = Array.from(grouped.byYearMonth.entries())
    .filter(([key]) => key.startsWith(`${effectiveYear}-`))
    .map(([key, invs]) => {
      const filtered = childFilter === "all" ? invs : invs.filter((i) => i.child_id === childFilter);
      const month = parseInt(key.split("-")[1], 10);
      // Cancelled invoices are excluded from totals, unpaid count, and status
      const active = filtered.filter((i) => i.status !== "cancelled");
      const cancelledCount = filtered.length - active.length;
      const totalDue = active.reduce((s, i) => s + (i.outstanding ?? 0), 0);
      const totalAmount = active.reduce((s, i) => s + (i.total_amount ?? 0), 0);
      const totalPaid = active.reduce((s, i) => s + (i.amount_paid ?? 0), 0);
      const unpaidCount = active.filter((i) => i.outstanding > 0).length;
      const overdue = active.some((i) => i.status === "overdue");
      const status: "paid" | "partial" | "due" | "overdue" | "cancelled" =
        active.length === 0 && cancelledCount > 0
          ? "cancelled"
          : overdue
            ? "overdue"
            : totalDue === 0 && active.length > 0
              ? "paid"
              : totalPaid > 0
                ? "partial"
                : "due";
      return { key, month, invoices: filtered, activeCount: active.length, cancelledCount, totalDue, totalAmount, totalPaid, unpaidCount, status };
    })
    .filter((r) => r.invoices.length > 0)
    .sort((a, b) => b.month - a.month);

  const defaultOpenKey = monthRows.find((r) => r.totalDue > 0)?.key ?? monthRows[0]?.key;
  const oldestUnpaid = monthRows
    .flatMap((r) => r.invoices.filter((i) => i.status !== "cancelled" && i.outstanding > 0))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];

  // Flat payable list across all children (for the Due Now tab).
  const payableInvoices = (() => {
    const all: any[] = [];
    for (const child of h.children) {
      for (const inv of child.invoices) {
        if (inv.status !== "cancelled" && (inv.outstanding ?? 0) > 0) {
          all.push({
            ...inv,
            child_first_name: child.first_name,
            child_last_name: child.last_name,
            child_id: child.id,
          });
        }
      }
    }
    return all.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  })();

  // Lookup table so the Payments tab can launch the existing invoice/receipt PDF flow.
  const invoicesById = new Map<string, any>();
  for (const child of h.children) {
    for (const inv of child.invoices) {
      invoicesById.set(inv.id, {
        ...inv,
        child_first_name: child.first_name,
        child_last_name: child.last_name,
      });
    }
  }

  const defaultTab = h.householdOutstanding > 0 ? "due" : "all";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            School Fees & Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tuition, materials and other school charges, organised by month.
          </p>
        </div>

        {/* Summary strip — compact, fits mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card className={`p-3 sm:p-4 ${h.householdOutstanding > 0 ? "border-destructive/30 bg-destructive/5" : "border-accent/30 bg-accent/5"}`}>
            <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Outstanding</p>
            <p className={`text-base sm:text-xl font-bold mt-1 ${h.householdOutstanding > 0 ? "text-destructive" : "text-accent"}`}>
              RM {h.householdOutstanding.toFixed(2)}
            </p>
            {h.householdOutstanding === 0 && (
              <p className="text-[10px] text-accent mt-0.5 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Cleared
              </p>
            )}
          </Card>
          <Card className="p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Paid to date</p>
            <p className="text-base sm:text-xl font-bold text-accent mt-1">RM {h.householdPaid.toFixed(2)}</p>
          </Card>
          <Card className={`p-3 sm:p-4 ${h.walletBalance > 0 ? "border-primary/30 bg-primary/5" : ""}`}>
            <div className="flex items-center gap-1">
              <Wallet className="h-3 w-3 text-primary" />
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">Wallet</p>
            </div>
            <p className={`text-base sm:text-xl font-bold mt-1 ${h.walletBalance > 0 ? "text-primary" : "text-foreground"}`}>RM {h.walletBalance.toFixed(2)}</p>
            {h.walletBalance > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Auto-applied next invoice</p>}
          </Card>
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 h-10">
            <TabsTrigger value="due" className="gap-1.5 text-xs sm:text-sm">
              <AlertTriangle className="h-3.5 w-3.5" />
              Due Now
              {payableInvoices.length > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                  {payableInvoices.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs sm:text-sm">
              <ListChecks className="h-3.5 w-3.5" /> All Invoices
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-3.5 w-3.5" /> Payments
            </TabsTrigger>
          </TabsList>

          {/* DUE NOW — only active payable invoices, flat list, sorted by due date */}
          <TabsContent value="due" className="space-y-3 mt-2">
            {payableInvoices.length === 0 ? (
              <Card className="p-8 text-center space-y-2">
                <CheckCircle className="h-10 w-10 text-accent mx-auto" />
                <p className="text-sm font-semibold text-accent">All caught up!</p>
                <p className="text-xs text-muted-foreground">You have no outstanding invoices right now.</p>
              </Card>
            ) : (
              <>
                {oldestUnpaid && (
                  <Card className="border-destructive/30 bg-destructive/5 p-3 sm:p-4">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-destructive">
                          RM {h.householdOutstanding.toFixed(2)} outstanding
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Next due: <span className="font-mono">{oldestUnpaid.invoice_number}</span> · {oldestUnpaid.due_date}
                        </p>
                      </div>
                    </div>
                  </Card>
                )}
                <div className="space-y-3">
                  {payableInvoices.map((inv) => (
                    <div key={inv.id} className="space-y-1">
                      {h.children.length > 1 && (
                        <p className="text-[11px] text-muted-foreground pl-1">
                          For: <span className="font-medium text-foreground">{inv.child_first_name} {inv.child_last_name}</span>
                        </p>
                      )}
                      <InvoiceCard inv={inv} onPay={() => {}} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ALL INVOICES — full history, cancelled collapsed per month */}
          <TabsContent value="all" className="space-y-3 mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Year
              </div>
              <Select value={String(effectiveYear)} onValueChange={(v) => setSelectedYear(parseInt(v, 10))}>
                <SelectTrigger className="h-8 w-[110px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {h.children.length > 1 && (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                    <Users className="h-3.5 w-3.5" /> Child
                  </div>
                  <Select value={childFilter} onValueChange={setChildFilter}>
                    <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All children</SelectItem>
                      {h.children.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {monthRows.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No invoices for {effectiveYear}.
              </Card>
            ) : (
              <Accordion type="multiple" defaultValue={defaultOpenKey ? [defaultOpenKey] : []} className="space-y-2">
                {monthRows.map((row) => {
                  const activeInvs = row.invoices.filter((i: any) => i.status !== "cancelled");
                  const cancelledInvs = row.invoices.filter((i: any) => i.status === "cancelled");
                  const cancelledOpen = !!showCancelled[row.key];
                  return (
                    <AccordionItem key={row.key} value={row.key} className="border rounded-lg bg-card overflow-hidden">
                      <AccordionTrigger className="px-3 sm:px-4 py-3 hover:no-underline hover:bg-muted/40 [&[data-state=open]]:bg-muted/30">
                        <div className="flex flex-1 items-center justify-between gap-3 pr-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="text-left min-w-0">
                              <p className="text-sm font-semibold">{MONTHS[row.month]} {effectiveYear}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {row.activeCount > 0 && (
                                  <>
                                    {row.activeCount} invoice{row.activeCount > 1 ? "s" : ""}
                                    {row.unpaidCount > 0 && <> · {row.unpaidCount} unpaid</>}
                                  </>
                                )}
                                {row.cancelledCount > 0 && (
                                  <>
                                    {row.activeCount > 0 ? " · " : ""}
                                    {row.cancelledCount} cancelled
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <MonthStatusBadge status={row.status} />
                            <span className={`text-sm font-bold tabular-nums ${
                              row.status === "cancelled"
                                ? "text-muted-foreground"
                                : row.totalDue > 0 ? "text-destructive" : "text-accent"
                            }`}>
                              {row.status === "cancelled"
                                ? "—"
                                : row.totalDue > 0
                                  ? `RM ${row.totalDue.toFixed(2)}`
                                  : "Paid"}
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 sm:px-4 pb-4 pt-1">
                        <div className="space-y-3">
                          {activeInvs.map((inv: any) => (
                            <div key={inv.id} className="space-y-1">
                              {(childFilter === "all" && h.children.length > 1) && (
                                <p className="text-[11px] text-muted-foreground pl-1">
                                  For: <span className="font-medium text-foreground">{inv.child_first_name} {inv.child_last_name}</span>
                                </p>
                              )}
                              <InvoiceCard inv={inv} onPay={() => {}} />
                            </div>
                          ))}
                          {cancelledInvs.length > 0 && (
                            <Collapsible
                              open={cancelledOpen}
                              onOpenChange={(open) =>
                                setShowCancelled((s) => ({ ...s, [row.key]: open }))
                              }
                            >
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8 text-muted-foreground">
                                  <span className="flex items-center gap-1.5">
                                    <Ban className="h-3 w-3" />
                                    {cancelledOpen ? "Hide" : "Show"} cancelled invoice{cancelledInvs.length > 1 ? "s" : ""} ({cancelledInvs.length})
                                  </span>
                                  <ChevronDown className={`h-3 w-3 transition-transform ${cancelledOpen ? "rotate-180" : ""}`} />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-3 pt-2">
                                {cancelledInvs.map((inv: any) => (
                                  <div key={inv.id} className="space-y-1">
                                    {(childFilter === "all" && h.children.length > 1) && (
                                      <p className="text-[11px] text-muted-foreground pl-1">
                                        For: <span className="font-medium text-foreground">{inv.child_first_name} {inv.child_last_name}</span>
                                      </p>
                                    )}
                                    <InvoiceCard inv={inv} onPay={() => {}} />
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </TabsContent>

          {/* PAYMENTS — recent payment history with receipt download */}
          <TabsContent value="payments" className="space-y-3 mt-2">
            {h.recentPayments.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                No payments recorded yet.
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y">
                  {h.recentPayments.map((p) => {
                    const inv = invoicesById.get(p.invoice_id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 p-3 sm:p-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">RM {p.amount.toFixed(2)}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            <span className="font-mono">{p.invoice_number}</span>
                            <span className="mx-1.5">·</span>
                            {p.student_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {p.payment_date}
                            {p.payment_method && <> · {p.payment_method.toUpperCase()}</>}
                          </p>
                        </div>
                        {inv && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-accent text-accent hover:bg-accent/10"
                            onClick={() => downloadPaymentReceiptPdf(p, inv)}
                          >
                            <Download className="h-3 w-3" /> Receipt
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function MonthStatusBadge({ status }: { status: "paid" | "partial" | "due" | "overdue" | "cancelled" }) {
  const map: Record<string, string> = {
    paid: "bg-accent/15 text-accent border-accent/30",
    partial: "bg-warning/15 text-warning border-warning/30",
    due: "bg-primary/10 text-primary border-primary/30",
    overdue: "bg-destructive/15 text-destructive border-destructive/30",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  const label: Record<string, string> = {
    paid: "Paid",
    partial: "Partial",
    due: "Due",
    overdue: "Overdue",
    cancelled: "Cancelled",
  };
  return <Badge variant="outline" className={`text-[10px] ${map[status]}`}>{label[status]}</Badge>;
}
