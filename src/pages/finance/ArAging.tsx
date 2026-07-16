import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, AlertTriangle, Clock, DollarSign, TrendingDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/finance/constants";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  getOverdueInvoicesWithAging,
  computeAgingSummary,
  AGING_BUCKETS,
  getAgingBucketLabel,
  type InvoiceWithAging,
  type AgingSummary,
} from "@/lib/finance/collections-service";

const BUCKET_COLORS: Record<string, string> = {
  current: "bg-success",
  "1_30": "bg-warning",
  "31_60": "bg-warning",
  "61_90": "bg-red-500",
  "90_plus": "bg-red-800",
};

export default function ArAging({ embedded = false }: { embedded?: boolean }) {
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const navigate = useNavigate();

  const branchIds = selectedBranch === "all" ? branches.map((b) => b.id) : [selectedBranch];

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["ar-aging", branchIds],
    queryFn: () => getOverdueInvoicesWithAging(branchIds),
    enabled: branchIds.length > 0,
  });

  const summary = useMemo(() => computeAgingSummary(invoices), [invoices]);

  // Group by branch for breakdown
  const branchBreakdown = useMemo(() => {
    const map: Record<string, { name: string; invoices: InvoiceWithAging[] }> = {};
    for (const inv of invoices) {
      if (!map[inv.branch_id]) map[inv.branch_id] = { name: inv.branch_name, invoices: [] };
      map[inv.branch_id].invoices.push(inv);
    }
    return Object.entries(map).map(([id, data]) => ({
      id,
      name: data.name,
      summary: computeAgingSummary(data.invoices),
    }));
  }, [invoices]);

  // Top debtors
  const topDebtors = useMemo(() => {
    const payerMap: Record<string, { name: string; total: number; count: number }> = {};
    for (const inv of invoices) {
      const key = inv.payer_account_id ?? inv.student_id;
      const name = inv.payer_name ?? inv.student_name;
      if (!payerMap[key]) payerMap[key] = { name, total: 0, count: 0 };
      payerMap[key].total += inv.outstanding;
      payerMap[key].count += 1;
    }
    return Object.entries(payerMap)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [invoices]);

  // Dispute count for risk indicators
  const disputeCount = useMemo(() => invoices.filter((i) => i.has_active_dispute).length, [invoices]);

  const bucketPercent = (key: string) =>
    summary.total > 0 ? ((summary[key as keyof AgingSummary] as number) / summary.total) * 100 : 0;

  const content = (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              AR Aging Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Accounts receivable aging by bucket, branch, and payer
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/finance/collections")} className="gap-2">
              <Clock className="h-4 w-4" /> Collections Workbench
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {AGING_BUCKETS.map((bucket) => {
            const val = summary[bucket.key as keyof AgingSummary] as number;
            return (
              <Card key={bucket.key} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${BUCKET_COLORS[bucket.key]}`} />
                  <p className="text-xs font-medium text-muted-foreground">{bucket.label}</p>
                </div>
                <p className="text-lg font-bold">{formatCurrency(val)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {invoices.filter((i) => i.aging_bucket === bucket.key).length} invoices
                </p>
              </Card>
            );
          })}
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Total Outstanding</p>
            </div>
            <p className="text-lg font-bold text-primary">{formatCurrency(summary.total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{summary.invoiceCount} invoices</p>
          </Card>
        </div>

        {/* Aging Distribution Bar */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Aging Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-6 rounded-full overflow-hidden bg-muted">
              {AGING_BUCKETS.map((bucket) => {
                const pct = bucketPercent(bucket.key);
                if (pct === 0) return null;
                return (
                  <div
                    key={bucket.key}
                    className={`${BUCKET_COLORS[bucket.key]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${bucket.label}: ${formatCurrency(summary[bucket.key as keyof AgingSummary] as number)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {AGING_BUCKETS.map((bucket) => (
                <div key={bucket.key} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${BUCKET_COLORS[bucket.key]}`} />
                  <span className="text-muted-foreground">{bucket.label}</span>
                  <span className="font-medium">{bucketPercent(bucket.key).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Branch */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Aging by Branch</CardTitle>
            </CardHeader>
            <CardContent>
              {branchBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No outstanding invoices</p>
              ) : (
                <div className="space-y-4">
                  {branchBreakdown.map((b) => (
                    <div key={b.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{b.name}</span>
                        <span className="text-sm font-bold">{formatCurrency(b.summary.total)}</span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                        {AGING_BUCKETS.map((bucket) => {
                          const val = b.summary[bucket.key as keyof AgingSummary] as number;
                          const pct = b.summary.total > 0 ? (val / b.summary.total) * 100 : 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={bucket.key}
                              className={BUCKET_COLORS[bucket.key]}
                              style={{ width: `${pct}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Debtors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Top Outstanding Accounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDebtors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No data</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account / Student</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDebtors.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm font-medium">{d.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold text-red-600">
                          {formatCurrency(d.total)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{d.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Collection Risk Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Collection Risk Indicators
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-medium text-red-800">90+ Days Overdue</p>
                <p className="text-xl font-bold text-red-700 mt-1">
                  {formatCurrency(summary["90_plus"])}
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  {invoices.filter((i) => i.aging_bucket === "90_plus").length} invoices at risk
                </p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                <p className="text-xs font-medium text-warning">Broken Promises</p>
                <p className="text-xl font-bold text-warning mt-1">
                  {invoices.filter((i) => i.broken_promise_count > 0).length}
                </p>
                <p className="text-xs text-warning mt-0.5">Accounts with broken PTP</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs font-medium text-muted-foreground">Written Off</p>
                <p className="text-xl font-bold text-muted-foreground mt-1">
                  {formatCurrency(invoices.reduce((s, i) => s + i.written_off_amount, 0))}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {invoices.filter((i) => i.collection_status === "written_off").length} invoices
                </p>
              </div>
              <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                <p className="text-xs font-medium text-success">Recovered</p>
                <p className="text-xl font-bold text-success mt-1">
                  {formatCurrency(invoices.reduce((s, i) => s + i.recovery_amount, 0))}
                </p>
                <p className="text-xs text-success mt-0.5">Post-write-off recovery</p>
              </div>
              {disputeCount > 0 && (
                <div className="p-3 rounded-lg bg-info/10 border border-info/30">
                  <p className="text-xs font-medium text-info">Active Disputes</p>
                  <p className="text-xl font-bold text-info mt-1">{disputeCount}</p>
                  <p className="text-xs text-info mt-0.5">Invoices under dispute</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading aging data...</div>
        )}
      </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
