import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { differenceInDays, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const QUARTER_LABELS = ["Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dec)"];

interface Props {
  allInvoices: any[];
  studentFees: any[];
  allPayments: any[];
}

export default function CashflowProjectionsTab({ allInvoices, studentFees, allPayments }: Props) {
  const now = new Date();
  const [projectionYear, setProjectionYear] = useState(now.getFullYear());

  // Aging report with student details
  const aging = useMemo(() => {
    const overdue = allInvoices.filter((i: any) =>
      (i.status === "issued" || i.status === "partial" || i.status === "overdue") &&
      new Date(i.due_date) < now
    );
    const buckets: Record<string, { label: string; total: number; students: any[] }> = {
      days30: { label: "0–30 days", total: 0, students: [] },
      days60: { label: "31–60 days", total: 0, students: [] },
      days90: { label: "61–90 days", total: 0, students: [] },
      days90plus: { label: "90+ days", total: 0, students: [] },
    };
    overdue.forEach((i: any) => {
      const diff = differenceInDays(now, new Date(i.due_date));
      const amt = Number(i.total_amount) - Number(i.amount_paid);
      const name = `${i.students?.first_name ?? ""} ${i.students?.last_name ?? ""}`.trim();
      const entry = { name, invoiceNumber: i.invoice_number, amount: amt };
      if (diff <= 30) { buckets.days30.total += amt; buckets.days30.students.push(entry); }
      else if (diff <= 60) { buckets.days60.total += amt; buckets.days60.students.push(entry); }
      else if (diff <= 90) { buckets.days90.total += amt; buckets.days90.students.push(entry); }
      else { buckets.days90plus.total += amt; buckets.days90plus.students.push(entry); }
    });
    return Object.values(buckets);
  }, [allInvoices]);

  // Collection efficiency trend (6 months)
  const collectionTrend = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const monthInvoices = allInvoices.filter((inv: any) => inv.billing_month === month && inv.billing_year === year);
      const expected = monthInvoices.reduce((s: number, inv: any) => s + Number(inv.total_amount), 0);
      const collected = monthInvoices.reduce((s: number, inv: any) => s + Number(inv.amount_paid), 0);
      return {
        month: MONTHS[d.getMonth()].substring(0, 3),
        rate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
        collected,
      };
    });
  }, [allInvoices]);

  // Average collection rate
  const avgCollectionRate = useMemo(() => {
    const rates = collectionTrend.filter(c => c.rate > 0);
    return rates.length > 0 ? rates.reduce((s, c) => s + c.rate, 0) / rates.length : 85;
  }, [collectionTrend]);

  // Full calendar year projections (Jan–Dec of selected year)
  const yearlyProjections = useMemo(() => {
    const currentMonth = now.getMonth(); // 0-based
    const currentYear = now.getFullYear();

    const monthlyRev = studentFees?.reduce((s: number, sf: any) => {
      if (sf.fee_packages?.fee_type === "monthly") {
        return s + ((sf.fee_packages?.amount ?? 0) - (sf.discount_amount ?? 0));
      }
      return s;
    }, 0) ?? 0;
    const studentCount = new Set(studentFees?.filter((sf: any) => sf.fee_packages?.fee_type === "monthly").map((sf: any) => sf.student_id)).size;

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1; // 1-based
      const isPast = projectionYear < currentYear || (projectionYear === currentYear && i <= currentMonth);

      if (isPast) {
        // Show actual data
        const monthInvoices = allInvoices.filter((inv: any) => inv.billing_month === month && inv.billing_year === projectionYear);
        const expected = monthInvoices.reduce((s: number, inv: any) => s + Number(inv.total_amount), 0);
        const collected = monthInvoices.reduce((s: number, inv: any) => s + Number(inv.amount_paid), 0);
        return {
          month: MONTHS[i].substring(0, 3),
          fullMonth: MONTHS[i],
          expected,
          actual: collected,
          projected: null as number | null,
          students: monthInvoices.length > 0 ? new Set(monthInvoices.map((inv: any) => inv.student_id)).size : studentCount,
          isPast: true,
          quarterIdx: Math.floor(i / 3),
        };
      } else {
        // Show projected
        return {
          month: MONTHS[i].substring(0, 3),
          fullMonth: MONTHS[i],
          expected: monthlyRev,
          actual: null as number | null,
          projected: monthlyRev * (avgCollectionRate / 100),
          students: studentCount,
          isPast: false,
          quarterIdx: Math.floor(i / 3),
        };
      }
    });
  }, [projectionYear, allInvoices, studentFees, avgCollectionRate]);

  // Quarterly subtotals
  const quarterlyTotals = useMemo(() => {
    return [0, 1, 2, 3].map(q => {
      const qMonths = yearlyProjections.filter(m => m.quarterIdx === q);
      return {
        label: QUARTER_LABELS[q],
        expected: qMonths.reduce((s, m) => s + m.expected, 0),
        actualOrProjected: qMonths.reduce((s, m) => s + (m.actual ?? m.projected ?? 0), 0),
      };
    });
  }, [yearlyProjections]);

  // Chart data for area chart
  const chartData = useMemo(() => {
    return yearlyProjections.map(m => ({
      month: m.month,
      Actual: m.actual ?? undefined,
      Projected: m.projected ?? undefined,
      Expected: m.expected,
    }));
  }, [yearlyProjections]);

  // Dues this month
  const duesThisMonth = useMemo(() => {
    const month = now.getMonth();
    const year = now.getFullYear();
    return allInvoices.filter((i: any) => {
      if (i.status === "paid" || i.status === "cancelled") return false;
      const due = new Date(i.due_date);
      return due.getMonth() === month && due.getFullYear() === year;
    });
  }, [allInvoices]);

  return (
    <div className="space-y-4">
      {/* Collection Efficiency + Year Area Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collection Efficiency</CardTitle>
            <CardDescription>Monthly collection rate % over last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{projectionYear} Revenue Overview</CardTitle>
                <CardDescription>Actual vs Projected collections</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProjectionYear(y => y - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-12 text-center">{projectionYear}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProjectionYear(y => y + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => rm(v)} />
                <Legend />
                <Area type="monotone" dataKey="Expected" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="Actual" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                <Area type="monotone" dataKey="Projected" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.2} strokeDasharray="6 3" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Aging Report */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging Report</CardTitle>
          <CardDescription>Overdue amounts by aging bucket — expand to see students</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {aging.map((b, i) => (
              <div key={i} className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">{b.label}</p>
                <p className={`text-xl font-bold ${i >= 2 ? "text-destructive" : "text-foreground"}`}>{rm(b.total)}</p>
                <p className="text-xs text-muted-foreground">{b.students.length} invoice(s)</p>
              </div>
            ))}
          </div>
          <Accordion type="multiple">
            {aging.filter(b => b.students.length > 0).map((b, i) => (
              <AccordionItem key={i} value={`aging-${i}`}>
                <AccordionTrigger className="text-sm">{b.label} — {b.students.length} student(s)</AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {b.students.map((s, j) => (
                        <TableRow key={j}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell className="font-mono text-sm">{s.invoiceNumber}</TableCell>
                          <TableCell className="text-right font-medium text-destructive">{rm(s.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Dues This Month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dues This Month</CardTitle>
          <CardDescription>Outstanding invoices due in {MONTHS[now.getMonth()]} {now.getFullYear()}</CardDescription>
        </CardHeader>
        <CardContent>
          {!duesThisMonth.length ? (
            <p className="text-center py-6 text-muted-foreground">No outstanding dues this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duesThisMonth.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.students?.first_name} {inv.students?.last_name}</TableCell>
                    <TableCell>{new Date(inv.due_date).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}</TableCell>
                    <TableCell className="text-right">{rm(inv.total_amount)}</TableCell>
                    <TableCell className="text-right">{rm(inv.amount_paid)}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{rm(Number(inv.total_amount) - Number(inv.amount_paid))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Calendar Year Forecast */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{projectionYear} Revenue Forecast</CardTitle>
              <CardDescription>
                Jan–Dec breakdown. Past months show actuals, future months show projections based on {avgCollectionRate.toFixed(0)}% avg collection rate.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setProjectionYear(y => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold w-14 text-center">{projectionYear}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setProjectionYear(y => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual / Projected</TableHead>
                <TableHead className="text-center">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearlyProjections.map((p, i) => {
                const isQuarterEnd = (i + 1) % 3 === 0;
                return (
                  <>
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.fullMonth}</TableCell>
                      <TableCell className="text-right">{p.students}</TableCell>
                      <TableCell className="text-right">{rm(p.expected)}</TableCell>
                      <TableCell className={`text-right font-medium ${p.isPast ? "text-primary" : "text-muted-foreground"}`}>
                        {rm(p.actual ?? p.projected ?? 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.isPast ? "default" : "outline"} className="text-xs">
                          {p.isPast ? "Actual" : "Projected"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {isQuarterEnd && (
                      <TableRow key={`q${p.quarterIdx}`} className="bg-muted/50 font-semibold">
                        <TableCell>{QUARTER_LABELS[p.quarterIdx]}</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{rm(quarterlyTotals[p.quarterIdx].expected)}</TableCell>
                        <TableCell className="text-right text-primary">{rm(quarterlyTotals[p.quarterIdx].actualOrProjected)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </>
                );
              })}
              <TableRow className="border-t-2 font-bold">
                <TableCell>Annual Total</TableCell>
                <TableCell />
                <TableCell className="text-right">{rm(yearlyProjections.reduce((s, p) => s + p.expected, 0))}</TableCell>
                <TableCell className="text-right text-primary">{rm(yearlyProjections.reduce((s, p) => s + (p.actual ?? p.projected ?? 0), 0))}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
