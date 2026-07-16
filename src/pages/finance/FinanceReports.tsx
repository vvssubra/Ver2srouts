import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, Printer, FileText, CreditCard, AlertTriangle, ShieldAlert, RotateCcw, Wallet, ArrowDownLeft, Users } from "lucide-react";
import { formatCurrency, getEntryTypeConfig } from "@/lib/finance/constants";
import { format } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const downloadCSV = (headers: string[], rows: string[][], filename: string) => {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const printTable = (title: string, id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}
    th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;font-size:13px}
    th{background:#f5f5f5;font-weight:600}h2{margin-bottom:12px}
    .text-right{text-align:right}.font-bold{font-weight:700}
    @media print{body{margin:0}}</style></head><body>
    <h2>${title}</h2>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
};

export default function FinanceReports({ embedded = false }: { embedded?: boolean }) {
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const branchId = selectedBranch;
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFrom, setMonthFrom] = useState(1);
  const [monthTo, setMonthTo] = useState(new Date().getMonth() + 1);
  const [invoiceView, setInvoiceView] = useState<"class" | "status">("class");


  const { data: ledger } = useQuery({
    queryKey: ["finance-report-ledger", branchId, year],
    queryFn: async () => {
      const { data } = await supabase.from("billing_ledger").select("*").eq("branch_id", branchId!)
        .gte("created_at", `${year}-01-01`).lt("created_at", `${year + 1}-01-01`).order("created_at");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["finance-report-invoices", branchId, year],
    queryFn: async () => {
      const { data } = await supabase.from("invoices")
        .select("*, students(first_name, last_name, class_name)")
        .eq("branch_id", branchId!).eq("billing_year", year).order("billing_month");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: disputes } = useQuery({
    queryKey: ["finance-report-disputes", branchId, year],
    queryFn: async () => {
      const { data } = await supabase.from("payment_disputes")
        .select("*, payments(amount, payment_method, invoices(invoice_number, students(first_name, last_name)))")
        .eq("branch_id", branchId!)
        .gte("created_at", `${year}-01-01`).lt("created_at", `${year + 1}-01-01`)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const rangeLabel = monthFrom === monthTo ? MONTHS[monthFrom - 1] : `${MONTHS[monthFrom - 1]} – ${MONTHS[monthTo - 1]}`;

  const filteredInvoices = useMemo(() => {
    return invoices?.filter((i: any) => i.billing_month >= monthFrom && i.billing_month <= monthTo) ?? [];
  }, [invoices, monthFrom, monthTo]);

  // ── Invoice summary by CLASS → STUDENT (excluding cancelled from outstanding) ──
  const classStudentSummary = useMemo(() => {
    const active = filteredInvoices.filter((i: any) => i.status !== "cancelled");
    const cancelled = filteredInvoices.filter((i: any) => i.status === "cancelled");

    const classMap = new Map<string, Map<string, { name: string; count: number; billed: number; paid: number; outstanding: number }>>();

    for (const inv of active) {
      const cls = inv.students?.class_name || "Unassigned";
      const studentKey = inv.student_id || "unknown";
      const studentName = inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "Unknown";

      if (!classMap.has(cls)) classMap.set(cls, new Map());
      const students = classMap.get(cls)!;
      if (!students.has(studentKey)) students.set(studentKey, { name: studentName, count: 0, billed: 0, paid: 0, outstanding: 0 });
      const s = students.get(studentKey)!;
      s.count++;
      s.billed += Number(inv.total_amount || 0);
      s.paid += Number(inv.amount_paid || 0);
      s.outstanding += Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
    }

    return {
      classes: Array.from(classMap.entries()).map(([className, studentsMap]) => {
        const students = Array.from(studentsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        return {
          className,
          students,
          totals: {
            count: students.reduce((s, st) => s + st.count, 0),
            billed: students.reduce((s, st) => s + st.billed, 0),
            paid: students.reduce((s, st) => s + st.paid, 0),
            outstanding: students.reduce((s, st) => s + st.outstanding, 0),
          },
        };
      }).sort((a, b) => a.className.localeCompare(b.className)),
      cancelledCount: cancelled.length,
      cancelledTotal: cancelled.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
    };
  }, [filteredInvoices]);

  // ── Invoice summary by STATUS (excluding cancelled from outstanding total) ──
  const invoiceSummary = useMemo(() => {
    const byStatus = new Map<string, { count: number; total: number; paid: number }>();
    for (const inv of filteredInvoices) {
      const s = inv.status;
      if (!byStatus.has(s)) byStatus.set(s, { count: 0, total: 0, paid: 0 });
      const e = byStatus.get(s)!;
      e.count++;
      e.total += Number(inv.total_amount);
      e.paid += Number(inv.amount_paid);
    }
    return Array.from(byStatus.entries()).map(([status, data]) => ({ status, ...data }));
  }, [filteredInvoices]);

  // Ledger by type
  const ledgerByType = useMemo(() => {
    const filtered = ledger?.filter((e: any) => {
      const month = new Date(e.created_at).getMonth() + 1;
      return month >= monthFrom && month <= monthTo;
    }) ?? [];
    const map = new Map<string, { debit: number; credit: number; count: number }>();
    for (const e of filtered) {
      if (!map.has(e.entry_type)) map.set(e.entry_type, { debit: 0, credit: 0, count: 0 });
      const row = map.get(e.entry_type)!;
      row.debit += Number(e.debit) || 0;
      row.credit += Number(e.credit) || 0;
      row.count++;
    }
    return Array.from(map.entries()).map(([type, data]) => ({ type, ...data }));
  }, [ledger, monthFrom, monthTo]);

  // Wallet report
  const walletReport = useMemo(() => {
    const walletTypes = ["wallet_credit_overpayment", "wallet_credit_cn", "wallet_credit_from_overpayment", "wallet_credit_from_cn", "wallet_admin_adjustment", "auto_offset"];
    const filtered = ledger?.filter((e: any) => walletTypes.includes(e.entry_type)) ?? [];
    return { total_credited: filtered.reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0), total_used: filtered.reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0), entries: filtered.length };
  }, [ledger]);

  // Write-off report
  const writeOffReport = useMemo(() => {
    const woEntries = ledger?.filter((e: any) => ["write_off", "recovery"].includes(e.entry_type)) ?? [];
    const writeOffs = woEntries.filter((e: any) => e.entry_type === "write_off").reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);
    const recoveries = woEntries.filter((e: any) => e.entry_type === "recovery").reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0);
    return { writeOffs, recoveries, net: writeOffs - recoveries, entries: woEntries };
  }, [ledger]);

  const ExportBar = ({ title, reportId, csvHeaders, csvRows, csvFilename }: { title: string; reportId: string; csvHeaders: string[]; csvRows: string[][]; csvFilename: string }) => (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">{title} — {rangeLabel} {year}</h3>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printTable(title, reportId)}>
          <Printer className="h-3.5 w-3.5" /> Print / PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCSV(csvHeaders, csvRows, csvFilename)}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>
    </div>
  );

  const monthSelect = (value: number, onChange: (v: number) => void, label: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={v => onChange(parseInt(v))}>
        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  // Grand totals for class view (excluding cancelled)
  const grandTotal = useMemo(() => {
    return {
      count: classStudentSummary.classes.reduce((s, c) => s + c.totals.count, 0),
      billed: classStudentSummary.classes.reduce((s, c) => s + c.totals.billed, 0),
      paid: classStudentSummary.classes.reduce((s, c) => s + c.totals.paid, 0),
      outstanding: classStudentSummary.classes.reduce((s, c) => s + c.totals.outstanding, 0),
    };
  }, [classStudentSummary]);

  const content = (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Finance Reporting Center</h1>
          <p className="text-sm text-muted-foreground">Enterprise-grade operational and financial reports</p>
        </div>


      </div>

      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">Year</Label>
              <Input type="number" className="w-[100px]" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} />
            </div>
            {monthSelect(monthFrom, setMonthFrom, "From")}
            {monthSelect(monthTo, setMonthTo, "To")}
            <Badge variant="outline" className="h-9 px-3 flex items-center">{rangeLabel} {year}</Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoice-summary">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoice-summary" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Invoice Summary</TabsTrigger>
          <TabsTrigger value="ledger-summary" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Ledger Summary</TabsTrigger>
          <TabsTrigger value="disputes" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Disputes</TabsTrigger>
          <TabsTrigger value="reversals" className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reversals</TabsTrigger>
          <TabsTrigger value="wallet" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Wallet / Credit</TabsTrigger>
          <TabsTrigger value="writeoff" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Write-Offs</TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5"><ArrowDownLeft className="h-3.5 w-3.5" /> Reconciliation</TabsTrigger>
        </TabsList>

        {/* Invoice Summary — By Class / By Status toggle */}
        <TabsContent value="invoice-summary" className="space-y-3">
          <div className="flex items-center justify-between">
            <ExportBar
              title="Invoice Summary Report"
              reportId="rpt-invoice-summary"
              csvHeaders={["Class", "Student", "Invoices", "Total Billed", "Total Paid", "Outstanding"]}
              csvRows={classStudentSummary.classes.flatMap(c => c.students.map(s => [c.className, s.name, String(s.count), s.billed.toFixed(2), s.paid.toFixed(2), s.outstanding.toFixed(2)]))}
              csvFilename={`invoice-summary-${year}-${monthFrom}-${monthTo}.csv`}
            />
          </div>
          <Tabs value={invoiceView} onValueChange={(v) => setInvoiceView(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="class" className="text-xs h-7 gap-1"><Users className="h-3 w-3" /> By Class</TabsTrigger>
              <TabsTrigger value="status" className="text-xs h-7 gap-1"><FileText className="h-3 w-3" /> By Status</TabsTrigger>
            </TabsList>
          </Tabs>

          {invoiceView === "class" && (
            <div id="rpt-invoice-summary">
              {classStudentSummary.classes.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">No invoices for this period.</CardContent></Card>
              ) : (
                <>
                  <Accordion type="multiple" className="space-y-2">
                    {classStudentSummary.classes.map((cls) => (
                      <AccordionItem key={cls.className} value={cls.className} className="border rounded-lg overflow-hidden bg-card">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="font-semibold text-sm">{cls.className}</span>
                            <span className="text-xs text-muted-foreground">({cls.students.length} students · {cls.totals.count} invoices)</span>
                            <div className="ml-auto flex items-center gap-4 mr-4 text-xs">
                              <span>Billed <span className="font-semibold text-foreground">{formatCurrency(cls.totals.billed)}</span></span>
                              <span>Paid <span className="font-semibold text-success">{formatCurrency(cls.totals.paid)}</span></span>
                              <span>Due <span className={`font-semibold ${cls.totals.outstanding > 0 ? "text-red-600" : ""}`}>{formatCurrency(cls.totals.outstanding)}</span></span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="pl-4">Student</TableHead>
                                <TableHead className="text-center">Invoices</TableHead>
                                <TableHead className="text-right">Billed</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Outstanding</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cls.students.map((s, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium pl-4">{s.name}</TableCell>
                                  <TableCell className="text-center">{s.count}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(s.billed)}</TableCell>
                                  <TableCell className="text-right text-success">{formatCurrency(s.paid)}</TableCell>
                                  <TableCell className={`text-right font-semibold ${s.outstanding > 0 ? "text-red-600" : ""}`}>{formatCurrency(s.outstanding)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  {/* Grand Total */}
                  <Card className="mt-3">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span>Grand Total (excl. cancelled)</span>
                        <div className="flex items-center gap-6">
                          <span>{grandTotal.count} invoices</span>
                          <span>Billed {formatCurrency(grandTotal.billed)}</span>
                          <span className="text-success">Paid {formatCurrency(grandTotal.paid)}</span>
                          <span className={grandTotal.outstanding > 0 ? "text-red-600" : ""}>Due {formatCurrency(grandTotal.outstanding)}</span>
                        </div>
                      </div>
                      {classStudentSummary.cancelledCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 line-through">
                          {classStudentSummary.cancelledCount} cancelled invoice(s) totalling {formatCurrency(classStudentSummary.cancelledTotal)} — excluded from totals
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {invoiceView === "status" && (
            <Card>
              <CardContent className="p-0" id="rpt-invoice-summary-status">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Count</TableHead>
                      <TableHead className="text-right">Total Billed</TableHead>
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceSummary.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data.</TableCell></TableRow>
                    ) : (
                      <>
                        {invoiceSummary.map((r) => {
                          const isCancelled = r.status === "cancelled";
                          return (
                            <TableRow key={r.status} className={isCancelled ? "opacity-50 line-through" : ""}>
                              <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                              <TableCell className="text-center">{r.count}</TableCell>
                              <TableCell className="text-right">{formatCurrency(r.total)}</TableCell>
                              <TableCell className="text-right text-primary">{formatCurrency(r.paid)}</TableCell>
                              <TableCell className={`text-right font-semibold ${!isCancelled && (r.total - r.paid) > 0 ? "text-destructive" : ""}`}>
                                {isCancelled ? "—" : formatCurrency(r.total - r.paid)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell>Total (excl. cancelled)</TableCell>
                          <TableCell className="text-center">{invoiceSummary.filter(r => r.status !== "cancelled").reduce((s, r) => s + r.count, 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(invoiceSummary.filter(r => r.status !== "cancelled").reduce((s, r) => s + r.total, 0))}</TableCell>
                          <TableCell className="text-right text-primary">{formatCurrency(invoiceSummary.filter(r => r.status !== "cancelled").reduce((s, r) => s + r.paid, 0))}</TableCell>
                          <TableCell className="text-right text-destructive">{formatCurrency(invoiceSummary.filter(r => r.status !== "cancelled").reduce((s, r) => s + (r.total - r.paid), 0))}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Ledger Summary */}
        <TabsContent value="ledger-summary" className="space-y-3">
          <ExportBar title="Ledger Summary Report" reportId="rpt-ledger-summary"
            csvHeaders={["Entry Type", "Count", "Total Debit", "Total Credit"]}
            csvRows={ledgerByType.map(r => [getEntryTypeConfig(r.type).label, String(r.count), r.debit.toFixed(2), r.credit.toFixed(2)])}
            csvFilename={`ledger-summary-${year}-${monthFrom}-${monthTo}.csv`}
          />
          <Card>
            <CardContent className="p-0" id="rpt-ledger-summary">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Entry Type</TableHead><TableHead className="text-center">Count</TableHead>
                  <TableHead className="text-right">Total Debit</TableHead><TableHead className="text-right">Total Credit</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ledgerByType.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No ledger entries.</TableCell></TableRow>
                  ) : (<>
                    {ledgerByType.map((r) => {
                      const cfg = getEntryTypeConfig(r.type);
                      return (
                        <TableRow key={r.type}>
                          <TableCell><Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge></TableCell>
                          <TableCell className="text-center">{r.count}</TableCell>
                          <TableCell className="text-right">{r.debit > 0 ? formatCurrency(r.debit) : "—"}</TableCell>
                          <TableCell className="text-right">{r.credit > 0 ? formatCurrency(r.credit) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-center">{ledgerByType.reduce((s, r) => s + r.count, 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ledgerByType.reduce((s, r) => s + r.debit, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ledgerByType.reduce((s, r) => s + r.credit, 0))}</TableCell>
                    </TableRow>
                  </>)}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Disputes */}
        <TabsContent value="disputes" className="space-y-3">
          <ExportBar title="Dispute Report" reportId="rpt-disputes"
            csvHeaders={["Date", "Invoice", "Student", "Reason", "Amount", "Status"]}
            csvRows={(disputes ?? []).map((d: any) => [
              format(new Date(d.created_at), "dd/MM/yyyy"),
              d.payments?.invoices?.invoice_number ?? "",
              `${d.payments?.invoices?.students?.first_name ?? ""} ${d.payments?.invoices?.students?.last_name ?? ""}`.trim(),
              d.reason_code ?? "", String(d.disputed_amount ?? d.payments?.amount ?? 0), d.status,
            ])}
            csvFilename={`disputes-${year}.csv`}
          />
          <Card>
            <CardContent className="p-0" id="rpt-disputes">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Student</TableHead>
                  <TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {!disputes?.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No disputes recorded.</TableCell></TableRow>
                  ) : disputes.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>{format(new Date(d.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-mono text-sm">{d.payments?.invoices?.invoice_number ?? "—"}</TableCell>
                      <TableCell>{d.payments?.invoices?.students?.first_name} {d.payments?.invoices?.students?.last_name}</TableCell>
                      <TableCell className="capitalize text-xs">{d.reason_code?.replace(/_/g, " ") ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(d.disputed_amount ?? d.payments?.amount ?? 0)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize text-xs">{d.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reversals */}
        <TabsContent value="reversals" className="space-y-3">
          <ExportBar title="Reversal Report" reportId="rpt-reversals"
            csvHeaders={["Date", "Type", "Reference", "Debit", "Credit", "Description"]}
            csvRows={(ledger?.filter((e: any) => ["payment_reversed", "allocation_reversed", "invoice_cancelled"].includes(e.entry_type)) ?? []).map((e: any) => [
              format(new Date(e.created_at), "dd/MM/yyyy"), getEntryTypeConfig(e.entry_type).label,
              e.reference_number ?? "", String(e.debit || 0), String(e.credit || 0), e.description ?? "",
            ])}
            csvFilename={`reversals-${year}.csv`}
          />
          <Card>
            <CardContent className="p-0" id="rpt-reversals">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Description</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(() => {
                    const reversals = ledger?.filter((e: any) => ["payment_reversed", "allocation_reversed", "invoice_cancelled"].includes(e.entry_type)) ?? [];
                    return reversals.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No reversals.</TableCell></TableRow>
                    ) : reversals.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell>{format(new Date(e.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-xs ${getEntryTypeConfig(e.entry_type).color}`}>{getEntryTypeConfig(e.entry_type).label}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{e.reference_number || "—"}</TableCell>
                        <TableCell className="text-right">{e.debit > 0 ? formatCurrency(e.debit) : "—"}</TableCell>
                        <TableCell className="text-right">{e.credit > 0 ? formatCurrency(e.credit) : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.description || "—"}</TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet / Credit */}
        <TabsContent value="wallet" className="space-y-3">
          <ExportBar title="Wallet & Credit Report" reportId="rpt-wallet"
            csvHeaders={["Metric", "Value"]}
            csvRows={[["Total Credited", walletReport.total_credited.toFixed(2)], ["Total Used", walletReport.total_used.toFixed(2)], ["Net Balance", (walletReport.total_credited - walletReport.total_used).toFixed(2)]]}
            csvFilename={`wallet-report-${year}.csv`}
          />
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-success"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total Credited</p><p className="text-lg font-bold text-success">{formatCurrency(walletReport.total_credited)}</p></CardContent></Card>
            <Card className="border-l-4 border-l-info"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total Used / Offset</p><p className="text-lg font-bold text-primary">{formatCurrency(walletReport.total_used)}</p></CardContent></Card>
            <Card className="border-l-4 border-l-primary"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Net Wallet Liability</p><p className="text-lg font-bold text-primary">{formatCurrency(walletReport.total_credited - walletReport.total_used)}</p></CardContent></Card>
          </div>
        </TabsContent>

        {/* Write-Offs */}
        <TabsContent value="writeoff" className="space-y-3">
          <ExportBar title="Write-Off Report" reportId="rpt-writeoff"
            csvHeaders={["Date", "Type", "Invoice", "Amount", "Description"]}
            csvRows={writeOffReport.entries.map((e: any) => [format(new Date(e.created_at), "dd/MM/yyyy"), e.entry_type, e.reference_number ?? "", String(e.entry_type === "write_off" ? e.credit : e.debit), e.description ?? ""])}
            csvFilename={`writeoffs-${year}.csv`}
          />
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-l-4 border-l-gray-400"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total Written Off</p><p className="text-lg font-bold">{formatCurrency(writeOffReport.writeOffs)}</p></CardContent></Card>
            <Card className="border-l-4 border-l-teal-500"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Recoveries</p><p className="text-lg font-bold text-teal-600">{formatCurrency(writeOffReport.recoveries)}</p></CardContent></Card>
            <Card className="border-l-4 border-l-destructive"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Net Bad Debt</p><p className="text-lg font-bold text-destructive">{formatCurrency(writeOffReport.net)}</p></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-0" id="rpt-writeoff">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead>Description</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {writeOffReport.entries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No write-offs or recoveries.</TableCell></TableRow>
                  ) : writeOffReport.entries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{format(new Date(e.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-xs ${getEntryTypeConfig(e.entry_type).color}`}>{getEntryTypeConfig(e.entry_type).label}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{e.reference_number || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(e.entry_type === "write_off" ? e.credit : e.debit)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.description || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation */}
        <TabsContent value="reconciliation" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Reconciliation Summary — {rangeLabel} {year}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const billed = ledgerByType.find(r => r.type === "invoice_issued")?.debit ?? 0;
              const collected = ledgerByType.find(r => r.type === "payment_received")?.credit ?? 0;
              const reversed = ledgerByType.find(r => r.type === "payment_reversed")?.debit ?? 0;
              const woAmount = ledgerByType.find(r => r.type === "write_off")?.credit ?? 0;
              return [
                { label: "Total Billed", value: billed, color: "text-muted-foreground" },
                { label: "Total Collected", value: collected, color: "text-primary" },
                { label: "Total Reversed", value: reversed, color: "text-destructive" },
                { label: "Net Receivable", value: billed - collected + reversed - woAmount, color: "text-warning" },
              ].map((c, i) => (
                <Card key={i}><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{formatCurrency(c.value)}</p></CardContent></Card>
              ));
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}