import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Users, Wallet, AlertTriangle, BarChart3, FileText,
  CreditCard, Clock, ShieldAlert, Phone, Mail, TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";
import { AGING_BUCKETS, getAgingBucketLabel } from "@/lib/finance/collections-types";
import { getPayerFinancialProfile, type PayerFinancialProfile } from "@/lib/finance/payer-service";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RISK_COLORS: Record<string, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  high: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900",
};

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-accent/15 text-accent",
  issued: "bg-primary/15 text-primary",
  partial: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

const BUCKET_COLORS: Record<string, string> = {
  current: "bg-success",
  "1_30": "bg-warning",
  "31_60": "bg-warning",
  "61_90": "bg-red-500",
  "90_plus": "bg-red-800",
};

export default function PayerProfile() {
  const { id: payerAccountId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["payer-profile", payerAccountId],
    queryFn: () => getPayerFinancialProfile(payerAccountId!),
    enabled: !!payerAccountId,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading payer profile...
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="text-center py-16 space-y-3">
          <p className="text-muted-foreground">Payer account not found.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </DashboardLayout>
    );
  }

  const p = profile;
  const agingTotal = p.agingSummary.total;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              {p.payer.name}
            </h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {p.payer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {p.payer.email}
                </span>
              )}
              {p.payer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {p.payer.phone}
                </span>
              )}
              <Badge variant="outline">{p.payer.branch_name}</Badge>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {p.students.length} {p.students.length === 1 ? "child" : "children"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Financial Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Billed</p>
            <p className="text-lg font-bold mt-1">{formatCurrency(p.totalBilled)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Paid</p>
            <p className="text-lg font-bold text-accent mt-1">{formatCurrency(p.totalPaid)}</p>
          </Card>
          <Card className="p-4 border-destructive/20">
            <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold text-destructive mt-1">{formatCurrency(p.totalOutstanding)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Overdue</p>
            <p className="text-lg font-bold text-warning mt-1">{formatCurrency(p.totalOverdue)}</p>
          </Card>
          <Card className="p-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3 w-3 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">Wallet Credit</p>
            </div>
            <p className="text-lg font-bold text-primary mt-1">{formatCurrency(p.walletBalance)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3 text-warning" />
              <p className="text-xs font-medium text-muted-foreground">Disputed</p>
            </div>
            <p className="text-lg font-bold text-warning mt-1">{formatCurrency(p.disputedAmount)}</p>
            {p.activeDisputeCount > 0 && (
              <p className="text-[10px] text-warning">{p.activeDisputeCount} active</p>
            )}
          </Card>
        </div>

        {/* Risk Indicators Row */}
        {(p.writtenOffAmount > 0 || p.brokenPromiseCount > 0 || p.collectionStatus !== "none") && (
          <div className="flex items-center gap-3 flex-wrap">
            {p.writtenOffAmount > 0 && (
              <Badge variant="outline" className="bg-muted gap-1">
                <TrendingDown className="h-3 w-3" />
                Written Off: {formatCurrency(p.writtenOffAmount)}
                {p.recoveryAmount > 0 && ` (Recovered: ${formatCurrency(p.recoveryAmount)})`}
              </Badge>
            )}
            {p.brokenPromiseCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                {p.brokenPromiseCount}× Broken Promise
              </Badge>
            )}
            {p.promiseToPayDate && (
              <Badge variant="outline" className="bg-warning/10 text-warning gap-1">
                <Clock className="h-3 w-3" /> PTP: {p.promiseToPayDate}
              </Badge>
            )}
            {p.lastContactedAt && (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                <Phone className="h-3 w-3" /> Last contact: {new Date(p.lastContactedAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
        )}

        <Tabs defaultValue="statement" className="space-y-4">
          <TabsList>
            <TabsTrigger value="statement" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Consolidated Statement
            </TabsTrigger>
            <TabsTrigger value="aging" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Aging Profile
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Payments
            </TabsTrigger>
          </TabsList>

          {/* Consolidated Statement Tab */}
          <TabsContent value="statement" className="space-y-4">
            {p.students.map((student) => {
              const studentInvoices = p.invoicesByStudent[student.id] ?? [];
              const studentOutstanding = studentInvoices
                .filter((i) => ["issued", "partial", "overdue"].includes(i.status))
                .reduce((s, i) => s + i.outstanding, 0);

              return (
                <Card key={student.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {student.first_name[0]}{student.last_name[0]}
                        </div>
                        {student.first_name} {student.last_name}
                        {student.class_name && (
                          <Badge variant="outline" className="text-[10px]">{student.class_name}</Badge>
                        )}
                        {!student.is_active && (
                          <Badge variant="secondary" className="text-[10px]">Withdrawn</Badge>
                        )}
                      </CardTitle>
                      {studentOutstanding > 0 && (
                        <span className="text-sm font-bold text-destructive">
                          {formatCurrency(studentOutstanding)} outstanding
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {studentInvoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-6 pb-4">No invoices</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead className="text-right">Billed</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentInvoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell>
                                <button
                                  onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                                  className="font-mono text-xs font-medium text-primary hover:underline"
                                >
                                  {inv.invoice_number}
                                </button>
                              </TableCell>
                              <TableCell className="text-xs">
                                {MONTHS[inv.billing_month]} {inv.billing_year}
                              </TableCell>
                              <TableCell className="text-xs">{inv.due_date}</TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {formatCurrency(inv.total_amount)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-accent">
                                {formatCurrency(inv.amount_paid)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-bold">
                                {inv.outstanding > 0 ? (
                                  <span className="text-destructive">{formatCurrency(inv.outstanding)}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[inv.status] ?? ""}`}>
                                  {inv.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Household Total */}
            <Card className="border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Household Total Outstanding</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(p.totalOutstanding)}</p>
              </div>
              {p.walletBalance > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Wallet credit available: {formatCurrency(p.walletBalance)}
                </p>
              )}
            </Card>
          </TabsContent>

          {/* Aging Profile Tab */}
          <TabsContent value="aging" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {AGING_BUCKETS.map((bucket) => {
                const val = p.agingSummary[bucket.key as keyof typeof p.agingSummary] as number;
                const pct = agingTotal > 0 ? (val / agingTotal) * 100 : 0;
                return (
                  <Card key={bucket.key} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${BUCKET_COLORS[bucket.key]}`} />
                      <p className="text-xs font-medium text-muted-foreground">{bucket.label}</p>
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(val)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}%</p>
                  </Card>
                );
              })}
              <Card className="p-4 border-primary/30 bg-primary/5">
                <p className="text-xs font-medium text-muted-foreground">Total AR</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(agingTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.agingSummary.invoiceCount} invoices</p>
              </Card>
            </div>

            {/* Aging bar */}
            {agingTotal > 0 && (
              <div className="flex h-5 rounded-full overflow-hidden bg-muted">
                {AGING_BUCKETS.map((bucket) => {
                  const val = p.agingSummary[bucket.key as keyof typeof p.agingSummary] as number;
                  const pct = (val / agingTotal) * 100;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={bucket.key}
                      className={BUCKET_COLORS[bucket.key]}
                      style={{ width: `${pct}%` }}
                      title={`${bucket.label}: ${formatCurrency(val)}`}
                    />
                  );
                })}
              </div>
            )}

            {/* Risk summary */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Risk Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <p className="text-xs font-medium text-destructive">90+ Days</p>
                    <p className="text-xl font-bold text-destructive mt-1">{formatCurrency(p.agingSummary["90_plus"])}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                    <p className="text-xs font-medium text-warning">Broken Promises</p>
                    <p className="text-xl font-bold text-warning mt-1">{p.brokenPromiseCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted border">
                    <p className="text-xs font-medium text-muted-foreground">Written Off</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(p.writtenOffAmount)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                    <p className="text-xs font-medium text-accent">Recovered</p>
                    <p className="text-xl font-bold text-accent mt-1">{formatCurrency(p.recoveryAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Payments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {p.recentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No payments recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.recentPayments.map((pmt) => (
                        <TableRow key={pmt.id}>
                          <TableCell className="text-xs">{pmt.payment_date}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => navigate(`/finance/invoices/${pmt.invoice_id}`)}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {pmt.invoice_number}
                            </button>
                          </TableCell>
                          <TableCell className="text-xs">{pmt.student_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] capitalize">{pmt.payment_method}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-accent">
                            {formatCurrency(pmt.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
