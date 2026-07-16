import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const rm = (v: number) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

const CHART_COLORS = [
  "hsl(170, 65%, 45%)", "hsl(200, 70%, 50%)", "hsl(260, 60%, 55%)",
  "hsl(30, 80%, 55%)", "hsl(340, 65%, 50%)", "hsl(80, 60%, 45%)",
  "hsl(45, 85%, 50%)", "hsl(150, 55%, 40%)",
];

export default function AccountingReports() {
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  // Manager access gating — no action needed here since reports are read-only,
  // but the route itself is controlled via allowedRoutes in the sidebar/ProtectedRoute
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ revenue: true, expense: true });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const branchId = selectedBranch;

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").eq("branch_id", branchId).eq("is_active", true).order("type").order("code");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions-year", branchId, year],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("account_id, type, amount, transaction_date, description")
        .eq("branch_id", branchId)
        .gte("transaction_date", `${year}-01-01`)
        .lte("transaction_date", `${year}-12-31`);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const revenueAccounts = accounts.filter((a: any) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a: any) => a.type === "expense");

  // Yearly totals
  const accountTotals: Record<string, number> = {};
  transactions.forEach((t: any) => {
    accountTotals[t.account_id] = (accountTotals[t.account_id] || 0) + Number(t.amount);
  });
  const totalRevenue = revenueAccounts.reduce((s: number, a: any) => s + (accountTotals[a.id] || 0), 0);
  const totalExpenses = expenseAccounts.reduce((s: number, a: any) => s + (accountTotals[a.id] || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  // Monthly breakdown
  const monthlyData = useMemo(() => MONTHS.map((m, i) => {
    const monthTxns = transactions.filter((t: any) => new Date(t.transaction_date).getMonth() === i);
    const income = monthTxns.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expense = monthTxns.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    return { month: m, monthIndex: i, Income: income, Expenses: expense, Profit: income - expense };
  }), [transactions]);

  // Selected month data
  const selectedMonthTxns = useMemo(() =>
    transactions.filter((t: any) => new Date(t.transaction_date).getMonth() === selectedMonth),
    [transactions, selectedMonth]
  );

  const monthAccountTotals: Record<string, number> = {};
  selectedMonthTxns.forEach((t: any) => {
    monthAccountTotals[t.account_id] = (monthAccountTotals[t.account_id] || 0) + Number(t.amount);
  });
  const monthRevenue = revenueAccounts.reduce((s: number, a: any) => s + (monthAccountTotals[a.id] || 0), 0);
  const monthExpenses = expenseAccounts.reduce((s: number, a: any) => s + (monthAccountTotals[a.id] || 0), 0);
  const monthNetProfit = monthRevenue - monthExpenses;

  // Previous month comparison
  const prevMonthTxns = transactions.filter((t: any) => new Date(t.transaction_date).getMonth() === selectedMonth - 1);
  const prevMonthRevenue = revenueAccounts.reduce((s: number, a: any) => {
    const tot = prevMonthTxns.filter((t: any) => t.account_id === a.id).reduce((ss: number, t: any) => ss + Number(t.amount), 0);
    return s + tot;
  }, 0);
  const prevMonthExpenses = expenseAccounts.reduce((s: number, a: any) => {
    const tot = prevMonthTxns.filter((t: any) => t.account_id === a.id).reduce((ss: number, t: any) => ss + Number(t.amount), 0);
    return s + tot;
  }, 0);
  const revenueChange = prevMonthRevenue > 0 ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;
  const expenseChange = prevMonthExpenses > 0 ? ((monthExpenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;

  // Pie chart data for expense breakdown
  const expensePieData = useMemo(() =>
    expenseAccounts
      .map((a: any) => ({ name: a.name, value: monthAccountTotals[a.id] || 0, code: a.code }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value),
    [expenseAccounts, monthAccountTotals]
  );

  const incomePieData = useMemo(() =>
    revenueAccounts
      .map((a: any) => ({ name: a.name, value: monthAccountTotals[a.id] || 0, code: a.code }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value),
    [revenueAccounts, monthAccountTotals]
  );

  // Profit trend (line chart)
  const profitTrend = useMemo(() =>
    monthlyData.map((d) => ({ month: d.month, Profit: d.Profit })),
    [monthlyData]
  );

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Financial Reports</h1>
            <p className="text-sm text-muted-foreground">Profit & Loss statements and analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[currentYear - 1, currentYear, currentYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="monthly" className="space-y-4">
          <TabsList>
            <TabsTrigger value="monthly">Monthly P&L</TabsTrigger>
            <TabsTrigger value="yearly">Yearly Overview</TabsTrigger>
          </TabsList>

          {/* ──────── MONTHLY P&L TAB ──────── */}
          <TabsContent value="monthly" className="space-y-6">
            {/* Month selector */}
            <div className="flex items-center gap-3">
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FULL_MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">{year}</span>
            </div>

            {/* Monthly KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Revenue</p>
                  <p className="text-2xl font-bold text-emerald-600">{rm(monthRevenue)}</p>
                  {selectedMonth > 0 && revenueChange !== 0 && (
                    <div className={`flex items-center gap-1 mt-1 text-xs ${revenueChange >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(revenueChange).toFixed(1)}% vs {MONTHS[selectedMonth - 1]}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Expenses</p>
                  <p className="text-2xl font-bold text-destructive">{rm(monthExpenses)}</p>
                  {selectedMonth > 0 && expenseChange !== 0 && (
                    <div className={`flex items-center gap-1 mt-1 text-xs ${expenseChange <= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {expenseChange <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                      {Math.abs(expenseChange).toFixed(1)}% vs {MONTHS[selectedMonth - 1]}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Net Profit / (Loss)</p>
                  <p className={`text-2xl font-bold ${monthNetProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{rm(monthNetProfit)}</p>
                  {monthRevenue > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Margin: {((monthNetProfit / monthRevenue) * 100).toFixed(1)}%
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Income & Expense Breakdown Charts side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Income Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {incomePieData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No income recorded for {FULL_MONTHS[selectedMonth]}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={incomePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                          {incomePieData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => rm(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Expense Breakdown</CardTitle></CardHeader>
                <CardContent>
                  {expensePieData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded for {FULL_MONTHS[selectedMonth]}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                          {expensePieData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => rm(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Monthly P&L Statement Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  P&L Statement — {FULL_MONTHS[selectedMonth]} {year}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Revenue Section */}
                    <TableRow className="bg-muted/30 cursor-pointer" onClick={() => toggleSection("revenue")}>
                      <TableCell colSpan={2} className="font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          {expandedSections.revenue ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          Revenue
                          <Badge variant="secondary" className="ml-auto font-mono">{rm(monthRevenue)}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSections.revenue && (
                      <>
                        {revenueAccounts.map((a: any) => {
                          const val = monthAccountTotals[a.id] || 0;
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="pl-10">{a.code} — {a.name}</TableCell>
                              <TableCell className="text-right text-emerald-600">{rm(val)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {revenueAccounts.length === 0 && (
                          <TableRow><TableCell colSpan={2} className="pl-10 text-muted-foreground text-sm">No revenue accounts</TableCell></TableRow>
                        )}
                      </>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Revenue</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{rm(monthRevenue)}</TableCell>
                    </TableRow>

                    {/* Expense Section */}
                    <TableRow className="bg-muted/30 cursor-pointer" onClick={() => toggleSection("expense")}>
                      <TableCell colSpan={2} className="font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          {expandedSections.expense ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          Expenses
                          <Badge variant="secondary" className="ml-auto font-mono">{rm(monthExpenses)}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedSections.expense && (
                      <>
                        {expenseAccounts.map((a: any) => {
                          const val = monthAccountTotals[a.id] || 0;
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="pl-10">{a.code} — {a.name}</TableCell>
                              <TableCell className="text-right text-destructive">{rm(val)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {expenseAccounts.length === 0 && (
                          <TableRow><TableCell colSpan={2} className="pl-10 text-muted-foreground text-sm">No expense accounts</TableCell></TableRow>
                        )}
                      </>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Expenses</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{rm(monthExpenses)}</TableCell>
                    </TableRow>

                    {/* Net */}
                    <TableRow className="bg-muted/50 border-t-2">
                      <TableCell className="font-bold text-lg">Net Profit / (Loss)</TableCell>
                      <TableCell className={`text-right font-bold text-lg ${monthNetProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {rm(monthNetProfit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ──────── YEARLY OVERVIEW TAB ──────── */}
          <TabsContent value="yearly" className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-emerald-600">{rm(totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-destructive">{rm(totalExpenses)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-1">Net Profit</p>
                  <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{rm(netProfit)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Income vs Expenses bar chart */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Monthly Income vs Expenses — {year}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip formatter={(v: number) => rm(v)} />
                    <Legend />
                    <Bar dataKey="Income" fill="hsl(170, 65%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="hsl(0, 72%, 55%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Profit Trend Line */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Profit Trend — {year}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={profitTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip formatter={(v: number) => rm(v)} />
                    <Line type="monotone" dataKey="Profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Annual P&L Statement */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Annual P&L Statement — {year}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={2} className="font-semibold text-foreground">Revenue</TableCell>
                    </TableRow>
                    {revenueAccounts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-8">{a.code} — {a.name}</TableCell>
                        <TableCell className="text-right text-emerald-600">{rm(accountTotals[a.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                    {revenueAccounts.length === 0 && (
                      <TableRow><TableCell colSpan={2} className="pl-8 text-muted-foreground text-sm">No revenue accounts</TableCell></TableRow>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Revenue</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{rm(totalRevenue)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={2} className="font-semibold text-foreground">Expenses</TableCell>
                    </TableRow>
                    {expenseAccounts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-8">{a.code} — {a.name}</TableCell>
                        <TableCell className="text-right text-destructive">{rm(accountTotals[a.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                    {expenseAccounts.length === 0 && (
                      <TableRow><TableCell colSpan={2} className="pl-8 text-muted-foreground text-sm">No expense accounts</TableCell></TableRow>
                    )}
                    <TableRow className="border-t-2">
                      <TableCell className="font-semibold">Total Expenses</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{rm(totalExpenses)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/50 border-t-2">
                      <TableCell className="font-bold text-lg">Net Profit / (Loss)</TableCell>
                      <TableCell className={`text-right font-bold text-lg ${netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {rm(netProfit)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
