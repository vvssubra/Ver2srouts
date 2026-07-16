import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DollarSign, CreditCard, AlertTriangle, ShieldAlert, TrendingDown, RotateCcw, Wallet, Info, Building2, BarChart3, PieChart, CalendarDays, CalendarRange } from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";
import ArAging from "@/pages/finance/ArAging";
import FinanceReports from "@/pages/finance/FinanceReports";
import { useGlobalBranch } from "@/hooks/use-branch-context";

interface KPICard {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  border: string;
  tooltip: string;
}

export default function FinanceKPIDashboard() {
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const [year, setYear] = useState(new Date().getFullYear());
  const [periodMode, setPeriodMode] = useState<"month" | "ytd">("month");
  const [viewMode, setViewMode] = useState<"single" | "comparison">("single");
  const [activeSection, setActiveSection] = useState("kpi");
  const branchId = selectedBranch;

  const currentMonth = new Date().getMonth() + 1; // 1-based


  // ── Fetch invoices directly (fixes billed=0 bug) ──
  const { data: invoiceTotals } = useQuery({
    queryKey: ["finance-kpi-invoices", branchId, year, viewMode],
    queryFn: async () => {
      let query = supabase.from("invoices")
        .select("total_amount, amount_paid, status, branch_id, due_date, billing_month, billing_year")
        .eq("billing_year", year);
      if (branchId && viewMode === "single") query = query.eq("branch_id", branchId);
      const { data } = await query;
      return data ?? [];
    },
    enabled: viewMode === "comparison" || !!branchId,
  });

  // ── Fetch ledger for supplementary KPIs ──
  const { data: ledgerTotals } = useQuery({
    queryKey: ["finance-kpi-ledger", branchId, year, viewMode],
    queryFn: async () => {
      let query = supabase.from("billing_ledger")
        .select("entry_type, debit, credit, branch_id")
        .gte("created_at", `${year}-01-01`).lt("created_at", `${year + 1}-01-01`);
      if (branchId && viewMode === "single") query = query.eq("branch_id", branchId);
      const { data } = await query;
      return data ?? [];
    },
    enabled: viewMode === "comparison" || !!branchId,
  });

  // ── Carry forward: outstanding from previous months ──
  const { data: carryForwardInvoices } = useQuery({
    queryKey: ["finance-kpi-carry-forward", branchId, year, currentMonth],
    queryFn: async () => {
      // Invoices from before current month that are not fully paid/cancelled
      let query = supabase.from("invoices")
        .select("total_amount, amount_paid, status, billing_month, billing_year")
        .in("status", ["issued", "partial", "overdue"])
        .eq("branch_id", branchId);
      // All invoices before current month/year
      const { data } = await query;
      return (data ?? []).filter((i: any) => {
        if (i.billing_year < year) return true;
        if (i.billing_year === year && i.billing_month < currentMonth) return true;
        return false;
      });
    },
    enabled: !!branchId && periodMode === "month",
  });

  const computeKPIs = (invoices: any[], entries: any[], filterMonth?: number) => {
    // Filter invoices by period
    const periodInvoices = filterMonth
      ? invoices.filter((i: any) => i.billing_month === filterMonth)
      : invoices;

    const activeInvoices = periodInvoices.filter((i: any) => i.status !== "cancelled");
    const billed = activeInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
    const collected = activeInvoices.reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
    const outstanding = activeInvoices.reduce((s: number, i: any) => s + (Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);

    const today = new Date().toISOString().slice(0, 10);
    const overdue = activeInvoices
      .filter((i: any) => ["issued", "partial", "overdue"].includes(i.status) && i.due_date < today)
      .reduce((s: number, i: any) => s + (Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);

    // Supplementary from ledger
    let disputed = 0, writeOffs = 0, recovery = 0, walletLiab = 0;
    for (const e of entries) {
      const t = e.entry_type;
      if (t === "dispute_locked") disputed += e.debit || 0;
      if (t === "dispute_released") disputed -= e.credit || 0;
      if (t === "write_off") writeOffs += e.credit || 0;
      if (t === "recovery") recovery += e.debit || 0;
      if (["wallet_credit_overpayment", "wallet_credit_cn", "wallet_credit_from_overpayment", "wallet_credit_from_cn", "wallet_admin_adjustment"].includes(t)) walletLiab += e.credit || 0;
      if (t === "auto_offset") walletLiab -= e.debit || 0;
    }

    return { billed, collected, outstanding: Math.max(0, outstanding), overdue, disputed: Math.max(0, disputed), writeOffs, recovery, walletLiab: Math.max(0, walletLiab) };
  };

  const kpis = useMemo(() => {
    if (!invoiceTotals || !ledgerTotals) return null;
    const filterMonth = periodMode === "month" ? currentMonth : undefined;
    return computeKPIs(invoiceTotals, ledgerTotals, filterMonth);
  }, [invoiceTotals, ledgerTotals, periodMode, currentMonth]);

  const carryForward = useMemo(() => {
    if (!carryForwardInvoices) return 0;
    return carryForwardInvoices.reduce((s: number, i: any) => s + (Number(i.total_amount || 0) - Number(i.amount_paid || 0)), 0);
  }, [carryForwardInvoices]);

  // Branch comparison
  const branchComparison = useMemo(() => {
    if (viewMode !== "comparison" || !ledgerTotals || !invoiceTotals) return [];
    const branchMap = new Map<string, { entries: any[]; invoices: any[] }>();
    for (const e of ledgerTotals) {
      if (!branchMap.has(e.branch_id)) branchMap.set(e.branch_id, { entries: [], invoices: [] });
      branchMap.get(e.branch_id)!.entries.push(e);
    }
    for (const i of invoiceTotals) {
      if (!branchMap.has(i.branch_id)) branchMap.set(i.branch_id, { entries: [], invoices: [] });
      branchMap.get(i.branch_id)!.invoices.push(i);
    }
    const filterMonth = periodMode === "month" ? currentMonth : undefined;
    return Array.from(branchMap.entries()).map(([bid, data]) => ({
      branchId: bid,
      branchName: branches.find((b: any) => b.id === bid)?.name ?? bid.slice(0, 8),
      ...computeKPIs(data.invoices, data.entries, filterMonth),
    })).sort((a, b) => b.billed - a.billed);
  }, [viewMode, ledgerTotals, invoiceTotals, branches, periodMode, currentMonth]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const periodLabel = periodMode === "month" ? `${MONTHS[currentMonth - 1]} ${year}` : `YTD ${year}`;

  const cards: KPICard[] = kpis ? [
    { label: "Total Billed", value: kpis.billed, icon: DollarSign, color: "text-foreground", border: "border-l-4 border-l-muted-foreground/40", tooltip: `Total invoiced amount for ${periodLabel} (from invoices table)` },
    { label: "Total Collected", value: kpis.collected, icon: CreditCard, color: "text-success", border: "border-l-4 border-l-success", tooltip: "Total payments received against invoices" },
    { label: "Outstanding", value: kpis.outstanding, icon: AlertTriangle, color: "text-warning", border: "border-l-4 border-l-warning", tooltip: "Billed minus collected (active invoices only)" },
    { label: "Overdue", value: kpis.overdue, icon: AlertTriangle, color: "text-destructive", border: "border-l-4 border-l-destructive", tooltip: "Unpaid balance on invoices past due date" },
    ...(periodMode === "month" ? [
      { label: "Carry Forward", value: carryForward, icon: RotateCcw, color: "text-warning", border: "border-l-4 border-l-warning", tooltip: "Outstanding balance from previous months' invoices" } as KPICard,
    ] : []),
    { label: "Disputed / Locked", value: kpis.disputed, icon: ShieldAlert, color: "text-warning", border: "border-l-4 border-l-warning", tooltip: "Funds locked due to active disputes" },
    { label: "Write-Offs", value: kpis.writeOffs, icon: TrendingDown, color: "text-muted-foreground", border: "border-l-4 border-l-gray-400", tooltip: "Bad debt written off" },
    { label: "Wallet Liabilities", value: kpis.walletLiab, icon: Wallet, color: "text-primary", border: "border-l-4 border-l-primary", tooltip: "Unspent wallet credits owed to families" },
  ] : [];

  const collectionRate = kpis && kpis.billed > 0 ? ((kpis.collected / kpis.billed) * 100).toFixed(1) : "0.0";

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Finance KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground">Enterprise financial health at a glance</p>
          </div>
          <Tabs value={activeSection} onValueChange={setActiveSection}>
            <TabsList>
              <TabsTrigger value="kpi" className="gap-1.5 text-xs"><BarChart3 className="h-3 w-3" /> KPIs</TabsTrigger>
              <TabsTrigger value="aging" className="gap-1.5 text-xs"><AlertTriangle className="h-3 w-3" /> AR Aging</TabsTrigger>
              <TabsTrigger value="reports" className="gap-1.5 text-xs"><PieChart className="h-3 w-3" /> Reports</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeSection === "kpi" && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Period Toggle: This Month / Year-to-Date */}
              <Tabs value={periodMode} onValueChange={(v) => setPeriodMode(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="month" className="text-xs h-7 gap-1"><CalendarDays className="h-3 w-3" /> This Month</TabsTrigger>
                  <TabsTrigger value="ytd" className="text-xs h-7 gap-1"><CalendarRange className="h-3 w-3" /> Year-to-Date</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="single" className="text-xs h-7 gap-1"><DollarSign className="h-3 w-3" /> Single Branch</TabsTrigger>
                  <TabsTrigger value="comparison" className="text-xs h-7 gap-1"><Building2 className="h-3 w-3" /> All Branches</TabsTrigger>
                </TabsList>
              </Tabs>


              <Badge variant="outline" className="h-7 px-3 text-xs">{periodLabel}</Badge>
            </div>

            {viewMode === "single" && kpis && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {cards.slice(0, 4).map((c, i) => (
                    <Card key={i} className={c.border}>
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                          <p className="text-[11px] text-muted-foreground font-medium leading-tight">{c.label}</p>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild><button type="button"><Info className="h-3 w-3 text-muted-foreground/60" /></button></TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[250px] text-xs">{c.tooltip}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className={`text-lg font-bold tracking-tight ${c.color}`}>{formatCurrency(c.value)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {cards.slice(4).map((c, i) => (
                    <Card key={i + 4} className={c.border}>
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                          <p className="text-[11px] text-muted-foreground font-medium leading-tight">{c.label}</p>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild><button type="button"><Info className="h-3 w-3 text-muted-foreground/60" /></button></TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[250px] text-xs">{c.tooltip}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className={`text-lg font-bold tracking-tight ${c.color}`}>{formatCurrency(c.value)}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardHeader><CardTitle className="text-base">Financial Health Summary — {periodLabel}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Collection Rate</p>
                        <p className="text-2xl font-bold text-primary">{collectionRate}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Net Write-Off</p>
                        <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(kpis.writeOffs - kpis.recovery)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Risk Exposure</p>
                        <p className="text-2xl font-bold text-warning">{formatCurrency(kpis.disputed + kpis.overdue)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Net Cash Position</p>
                        <p className="text-2xl font-bold text-success">{formatCurrency(kpis.collected - kpis.walletLiab)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {viewMode === "comparison" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Branch Comparison — {periodLabel}</CardTitle>
                  <CardDescription>Side-by-side financial performance across all branches</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Billed</TableHead>
                        <TableHead className="text-right">Collected</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead className="text-right">Disputed</TableHead>
                        <TableHead className="text-right">Write-Off</TableHead>
                        <TableHead className="text-right">Wallet</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchComparison.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No data for {periodLabel}.</TableCell></TableRow>
                      ) : (
                        <>
                          {branchComparison.map((b) => (
                            <TableRow key={b.branchId}>
                              <TableCell className="font-medium">{b.branchName}</TableCell>
                              <TableCell className="text-right">{formatCurrency(b.billed)}</TableCell>
                              <TableCell className="text-right text-success">{formatCurrency(b.collected)}</TableCell>
                              <TableCell className="text-right text-warning">{formatCurrency(b.outstanding)}</TableCell>
                              <TableCell className="text-right text-destructive">{formatCurrency(b.overdue)}</TableCell>
                              <TableCell className="text-right text-warning">{formatCurrency(b.disputed)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(b.writeOffs)}</TableCell>
                              <TableCell className="text-right text-primary">{formatCurrency(b.walletLiab)}</TableCell>
                              <TableCell className="text-right font-semibold">{b.billed > 0 ? ((b.collected / b.billed) * 100).toFixed(1) : "0.0"}%</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{formatCurrency(branchComparison.reduce((s, b) => s + b.billed, 0))}</TableCell>
                            <TableCell className="text-right text-success">{formatCurrency(branchComparison.reduce((s, b) => s + b.collected, 0))}</TableCell>
                            <TableCell className="text-right text-warning">{formatCurrency(branchComparison.reduce((s, b) => s + b.outstanding, 0))}</TableCell>
                            <TableCell className="text-right text-destructive">{formatCurrency(branchComparison.reduce((s, b) => s + b.overdue, 0))}</TableCell>
                            <TableCell className="text-right text-warning">{formatCurrency(branchComparison.reduce((s, b) => s + b.disputed, 0))}</TableCell>
                            <TableCell className="text-right">{formatCurrency(branchComparison.reduce((s, b) => s + b.writeOffs, 0))}</TableCell>
                            <TableCell className="text-right text-primary">{formatCurrency(branchComparison.reduce((s, b) => s + b.walletLiab, 0))}</TableCell>
                            <TableCell className="text-right">
                              {(() => {
                                const tb = branchComparison.reduce((s, b) => s + b.billed, 0);
                                const tc = branchComparison.reduce((s, b) => s + b.collected, 0);
                                return tb > 0 ? ((tc / tb) * 100).toFixed(1) : "0.0";
                              })()}%
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {activeSection === "aging" && <ArAging embedded />}
        {activeSection === "reports" && <FinanceReports embedded />}
      </div>
    </DashboardLayout>
  );
}