import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, Printer, CreditCard, Percent, ArrowDownLeft } from "lucide-react";
import { format } from "date-fns";

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const downloadCSV = (headers: string[], rows: string[][], filename: string) => {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const printReport = (title: string, contentId: string) => {
  const el = document.getElementById(contentId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:system-ui,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}
    th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;font-size:13px}
    th{background:#f5f5f5;font-weight:600}h2{margin-bottom:12px}
    .text-right{text-align:right}.font-bold{font-weight:700}.text-sm{font-size:13px}
    @media print{body{margin:0}}</style></head><body>
    <h2>${title}</h2>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
};

export default function BillingReportsTab({ branchId }: { branchId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthFrom, setMonthFrom] = useState(1);
  const [monthTo, setMonthTo] = useState(new Date().getMonth() + 1);

  // Invoices
  const { data: invoices } = useQuery({
    queryKey: ["report-invoices", branchId, year],
    queryFn: async () => {
      const { data } = await supabase.from("invoices")
        .select("*, students(first_name, last_name, class_name)")
        .eq("branch_id", branchId).eq("billing_year", year)
        .order("billing_month").order("created_at");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Payments
  const { data: payments } = useQuery({
    queryKey: ["report-payments", branchId, year],
    queryFn: async () => {
      const { data: invs } = await supabase.from("invoices").select("id").eq("branch_id", branchId).eq("billing_year", year);
      if (!invs?.length) return [];
      const { data } = await supabase.from("payments")
        .select("*, invoices(invoice_number, student_id, billing_month, students(first_name, last_name, class_name))")
        .in("invoice_id", invs.map((i: any) => i.id))
        .order("payment_date");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Student fees (for discount report)
  const { data: studentFees } = useQuery({
    queryKey: ["report-student-fees", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("student_fees")
        .select("*, students(first_name, last_name, class_name), fee_packages(name, amount, fee_type)")
        .eq("is_active", true);
      return (data ?? []).filter((sf: any) => sf.discount_amount > 0);
    },
    enabled: !!branchId,
  });

  // Credit notes
  const { data: creditNotes } = useQuery({
    queryKey: ["report-credit-notes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("credit_notes")
        .select("*, students(first_name, last_name, class_name)")
        .eq("branch_id", branchId).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Filtered invoices by month range
  const filteredInvoices = useMemo(() =>
    invoices?.filter((i: any) => i.billing_month >= monthFrom && i.billing_month <= monthTo && i.status !== "cancelled") ?? []
  , [invoices, monthFrom, monthTo]);

  const filteredPayments = useMemo(() =>
    payments?.filter((p: any) => {
      const m = p.invoices?.billing_month;
      return m >= monthFrom && m <= monthTo;
    }) ?? []
  , [payments, monthFrom, monthTo]);

  // Fee collection summary
  const collectionSummary = useMemo(() => {
    const map = new Map<string, { name: string; className: string; billed: number; paid: number; outstanding: number; invoiceCount: number }>();
    filteredInvoices.forEach((inv: any) => {
      const key = inv.student_id;
      const name = `${inv.students?.first_name ?? ""} ${inv.students?.last_name ?? ""}`.trim();
      if (!map.has(key)) map.set(key, { name, className: inv.students?.class_name || "Unassigned", billed: 0, paid: 0, outstanding: 0, invoiceCount: 0 });
      const e = map.get(key)!;
      e.billed += Number(inv.total_amount);
      e.paid += Number(inv.amount_paid);
      e.outstanding += Number(inv.total_amount) - Number(inv.amount_paid);
      e.invoiceCount++;
    });
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  }, [filteredInvoices]);

  const collectionTotals = useMemo(() => collectionSummary.reduce((t, r) => ({
    billed: t.billed + r.billed, paid: t.paid + r.paid, outstanding: t.outstanding + r.outstanding, count: t.count + r.invoiceCount,
  }), { billed: 0, paid: 0, outstanding: 0, count: 0 }), [collectionSummary]);

  // Payment by method
  const paymentByMethod = useMemo(() => {
    const map = new Map<string, number>();
    filteredPayments.forEach((p: any) => {
      const method = p.payment_method || "unknown";
      map.set(method, (map.get(method) ?? 0) + Number(p.amount));
    });
    return Array.from(map.entries()).sort(([, a], [, b]) => b - a);
  }, [filteredPayments]);

  // Date range label
  const rangeLabel = monthFrom === monthTo ? MONTHS[monthFrom - 1] : `${MONTHS[monthFrom - 1]} – ${MONTHS[monthTo - 1]}`;

  const monthSelect = (value: number, onChange: (v: number) => void, label: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={v => onChange(parseInt(v))}>
        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
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

      <Tabs defaultValue="collection">
        <TabsList className="flex-wrap">
          <TabsTrigger value="collection" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Fee Collection</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payment Summary</TabsTrigger>
          <TabsTrigger value="discounts" className="gap-1.5"><Percent className="h-3.5 w-3.5" /> Discounts</TabsTrigger>
          <TabsTrigger value="refunds" className="gap-1.5"><ArrowDownLeft className="h-3.5 w-3.5" /> Refunds</TabsTrigger>
        </TabsList>

        {/* Fee Collection Report */}
        <TabsContent value="collection" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Fee Collection Report — {rangeLabel} {year}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printReport(`Fee Collection Report — ${rangeLabel} ${year}`, "report-collection")}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCSV(
                ["Class", "Student", "Invoices", "Total Billed", "Total Paid", "Outstanding"],
                collectionSummary.map(r => [r.className, r.name, String(r.invoiceCount), r.billed.toFixed(2), r.paid.toFixed(2), r.outstanding.toFixed(2)]),
                `fee-collection-${year}-${monthFrom}-${monthTo}.csv`
              )}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-0" id="report-collection">
              {!collectionSummary.length ? (
                <p className="text-center py-8 text-muted-foreground">No invoices in selected period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center">Invoices</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionSummary.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><Badge variant="outline" className="text-xs">{r.className}</Badge></TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-center">{r.invoiceCount}</TableCell>
                        <TableCell className="text-right">{rm(r.billed)}</TableCell>
                        <TableCell className="text-right text-primary">{rm(r.paid)}</TableCell>
                        <TableCell className={`text-right font-semibold ${r.outstanding > 0 ? "text-destructive" : ""}`}>{rm(r.outstanding)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-center">{collectionTotals.count}</TableCell>
                      <TableCell className="text-right">{rm(collectionTotals.billed)}</TableCell>
                      <TableCell className="text-right text-primary">{rm(collectionTotals.paid)}</TableCell>
                      <TableCell className={`text-right ${collectionTotals.outstanding > 0 ? "text-destructive" : ""}`}>{rm(collectionTotals.outstanding)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Summary */}
        <TabsContent value="payments" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Payment Summary — {rangeLabel} {year}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => printReport(`Payment Summary — ${rangeLabel} ${year}`, "report-payments")}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCSV(
                ["Date", "Invoice", "Student", "Method", "Reference", "Paid By", "Amount"],
                filteredPayments.map((p: any) => [
                  format(new Date(p.payment_date), "dd/MM/yyyy"),
                  p.invoices?.invoice_number ?? "",
                  `${p.invoices?.students?.first_name ?? ""} ${p.invoices?.students?.last_name ?? ""}`.trim(),
                  p.payment_method || "", p.payment_reference || "", (p as any).payer_name || "",
                  Number(p.amount).toFixed(2),
                ]),
                `payments-${year}-${monthFrom}-${monthTo}.csv`
              )}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>

          {/* By method summary cards */}
          {paymentByMethod.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {paymentByMethod.map(([method, total]) => (
                <Card key={method}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground capitalize">{method.replace("_", " ")}</p>
                    <p className="text-lg font-bold text-primary">{rm(total)}</p>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-l-4 border-l-primary">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground font-semibold">Total Received</p>
                  <p className="text-lg font-bold text-primary">{rm(paymentByMethod.reduce((s, [, t]) => s + t, 0))}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardContent className="p-0" id="report-payments">
              {!filteredPayments.length ? (
                <p className="text-center py-8 text-muted-foreground">No payments in selected period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Paid By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{format(new Date(p.payment_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="font-mono text-sm">{p.invoices?.invoice_number ?? "—"}</TableCell>
                        <TableCell>{p.invoices?.students?.first_name} {p.invoices?.students?.last_name}</TableCell>
                        <TableCell className="capitalize">{p.payment_method?.replace("_", " ")}</TableCell>
                        <TableCell className="font-mono text-sm">{p.payment_reference || "—"}</TableCell>
                        <TableCell>{(p as any).payer_name || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{rm(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discounts Report */}
        <TabsContent value="discounts" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Active Discounts Report</h3>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCSV(
              ["Student", "Class", "Fee Package", "Fee Type", "Original Amount", "Discount", "Net Amount"],
              (studentFees ?? []).map((sf: any) => [
                `${sf.students?.first_name ?? ""} ${sf.students?.last_name ?? ""}`.trim(),
                sf.students?.class_name || "Unassigned",
                sf.fee_packages?.name ?? "", sf.fee_packages?.fee_type ?? "",
                String(sf.fee_packages?.amount ?? 0), String(sf.discount_amount ?? 0),
                String((sf.fee_packages?.amount ?? 0) - (sf.discount_amount ?? 0)),
              ]),
              `discounts-report.csv`
            )}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {!studentFees?.length ? (
                <p className="text-center py-8 text-muted-foreground">No active discounts.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentFees.map((sf: any) => (
                      <TableRow key={sf.id}>
                        <TableCell className="font-medium">{sf.students?.first_name} {sf.students?.last_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sf.students?.class_name || "—"}</Badge></TableCell>
                        <TableCell>{sf.fee_packages?.name}</TableCell>
                        <TableCell className="capitalize text-xs">{sf.fee_packages?.fee_type?.replace("_", " ")}</TableCell>
                        <TableCell className="text-right">{rm(sf.fee_packages?.amount ?? 0)}</TableCell>
                        <TableCell className="text-right text-destructive">−{rm(sf.discount_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{rm((sf.fee_packages?.amount ?? 0) - (sf.discount_amount ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>Total ({studentFees.length} discounts)</TableCell>
                      <TableCell className="text-right">{rm(studentFees.reduce((s: number, sf: any) => s + (sf.fee_packages?.amount ?? 0), 0))}</TableCell>
                      <TableCell className="text-right text-destructive">−{rm(studentFees.reduce((s: number, sf: any) => s + (sf.discount_amount ?? 0), 0))}</TableCell>
                      <TableCell className="text-right">{rm(studentFees.reduce((s: number, sf: any) => s + (sf.fee_packages?.amount ?? 0) - (sf.discount_amount ?? 0), 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Refunds Report */}
        <TabsContent value="refunds" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Refunds & Credit Notes</h3>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => downloadCSV(
              ["Credit Note #", "Student", "Class", "Type", "Amount", "Reason", "Status", "Date"],
              (creditNotes ?? []).map((cn: any) => [
                cn.credit_note_number, `${cn.students?.first_name ?? ""} ${cn.students?.last_name ?? ""}`.trim(),
                cn.students?.class_name || "", cn.type ?? "", String(cn.amount),
                cn.reason || "", cn.status, format(new Date(cn.created_at), "dd/MM/yyyy"),
              ]),
              `refunds-report.csv`
            )}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {!creditNotes?.length ? (
                <p className="text-center py-8 text-muted-foreground">No credit notes issued.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CN #</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map((cn: any) => (
                      <TableRow key={cn.id}>
                        <TableCell className="font-mono text-sm">{cn.credit_note_number}</TableCell>
                        <TableCell className="font-medium">{cn.students?.first_name} {cn.students?.last_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{cn.students?.class_name || "—"}</Badge></TableCell>
                        <TableCell className="capitalize text-xs">{cn.type?.replace("_", " ")}</TableCell>
                        <TableCell className="text-right font-medium">{rm(cn.amount)}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={cn.reason}>{cn.reason || "—"}</TableCell>
                        <TableCell>
                          <Badge className={cn.status === "processed" ? "bg-green-100 text-green-800" : cn.status === "approved" ? "bg-primary/15 text-primary" : cn.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}>
                            {cn.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(cn.created_at), "dd MMM yyyy")}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>Total ({creditNotes.length} notes)</TableCell>
                      <TableCell className="text-right">{rm(creditNotes.reduce((s: number, cn: any) => s + Number(cn.amount), 0))}</TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
