import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, isAfter } from "date-fns";
import { CalendarIcon, Users, GraduationCap, TrendingUp, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";

interface Props {
  activeBranchIds: string[];
}

interface MonthRow {
  key: string;
  label: string;
  leads: number;
  enrolled: number;
  conversion: number;
}

/**
 * Cohort Analysis (Month vs Month)
 * Live comparison of leads received vs enrollments across a user-selected
 * range of calendar months. Reads directly from the leads table — no schema
 * changes and no side effects on the admissions pipeline.
 */
export default function CohortAnalysisMoM({ activeBranchIds }: Props) {
  const now = new Date();
  const [startMonth, setStartMonth] = useState<Date>(startOfMonth(subMonths(now, 5)));
  const [endMonth, setEndMonth] = useState<Date>(startOfMonth(now));

  const rangeInvalid = isAfter(startOfMonth(startMonth), startOfMonth(endMonth));

  const rangeStart = useMemo(() => startOfMonth(startMonth), [startMonth]);
  const rangeEnd = useMemo(() => {
    const d = endOfMonth(endMonth);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [endMonth]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "cohort-mom",
      activeBranchIds.join(","),
      format(rangeStart, "yyyy-MM"),
      format(endMonth, "yyyy-MM"),
    ],
    enabled: activeBranchIds.length > 0 && !rangeInvalid,
    queryFn: async () => {
      const fromIso = rangeStart.toISOString();
      const toIso = rangeEnd.toISOString();
      const fromDateOnly = format(rangeStart, "yyyy-MM-dd");
      const toDateOnly = format(rangeEnd, "yyyy-MM-dd");

      const [receivedRes, enrolledRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, lead_received_date, created_at")
          .in("branch_id", activeBranchIds)
          .or(
            `and(lead_received_date.gte.${fromDateOnly},lead_received_date.lte.${toDateOnly}),` +
            `and(lead_received_date.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`
          ),
        supabase
          .from("leads")
          .select("id, enrolled_at")
          .in("branch_id", activeBranchIds)
          .eq("status", "enrolled")
          .gte("enrolled_at", fromIso)
          .lte("enrolled_at", toIso),
      ]);
      if (receivedRes.error) throw receivedRes.error;
      if (enrolledRes.error) throw enrolledRes.error;

      const months = eachMonthOfInterval({ start: rangeStart, end: endOfMonth(endMonth) });
      const rows: MonthRow[] = months.map((m) => ({
        key: format(m, "yyyy-MM"),
        label: format(m, "MMM yyyy"),
        leads: 0,
        enrolled: 0,
        conversion: 0,
      }));
      const idx = new Map(rows.map((r, i) => [r.key, i]));

      (receivedRes.data || []).forEach((l: any) => {
        const raw = l.lead_received_date || l.created_at;
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime())) return;
        const k = format(startOfMonth(d), "yyyy-MM");
        const i = idx.get(k);
        if (i !== undefined) rows[i].leads += 1;
      });
      (enrolledRes.data || []).forEach((l: any) => {
        if (!l.enrolled_at) return;
        const d = new Date(l.enrolled_at);
        if (isNaN(d.getTime())) return;
        const k = format(startOfMonth(d), "yyyy-MM");
        const i = idx.get(k);
        if (i !== undefined) rows[i].enrolled += 1;
      });
      rows.forEach((r) => {
        r.conversion = r.leads > 0 ? (r.enrolled / r.leads) * 100 : 0;
      });
      return rows;
    },
  });

  const rows = data ?? [];
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalEnrolled = rows.reduce((s, r) => s + r.enrolled, 0);
  const overallConversion = totalLeads > 0 ? (totalEnrolled / totalLeads) * 100 : 0;

  const monthsWithLeads = rows.filter((r) => r.leads > 0);
  const bestMonth = monthsWithLeads.length
    ? monthsWithLeads.reduce((a, b) => (b.conversion > a.conversion ? b : a))
    : null;
  const highestLeadMonth = rows.length ? rows.reduce((a, b) => (b.leads > a.leads ? b : a)) : null;
  const highestEnrolledMonth = rows.length ? rows.reduce((a, b) => (b.enrolled > a.enrolled ? b : a)) : null;
  const lowestConversionMonth = monthsWithLeads.length
    ? monthsWithLeads.reduce((a, b) => (b.conversion < a.conversion ? b : a))
    : null;
  const avgConversion = monthsWithLeads.length
    ? monthsWithLeads.reduce((s, r) => s + r.conversion, 0) / monthsWithLeads.length
    : 0;

  const hasAny = !isLoading && !rangeInvalid && (totalLeads > 0 || totalEnrolled > 0);

  const cards = [
    { label: "Total Leads Received", value: totalLeads.toLocaleString(), icon: Users, tone: "text-primary" },
    { label: "Total Enrollments", value: totalEnrolled.toLocaleString(), icon: GraduationCap, tone: "text-success" },
    {
      label: "Overall Conversion Rate",
      value: totalLeads > 0 ? `${overallConversion.toFixed(1)}%` : "—",
      icon: TrendingUp,
      tone: "text-info",
    },
    {
      label: "Best Performing Month",
      value: bestMonth ? `${bestMonth.label} • ${bestMonth.conversion.toFixed(1)}%` : "—",
      icon: Trophy,
      tone: "text-amber-600",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-sm">Cohort Analysis (Month vs Month)</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Compare admission performance across a range of months to spot trends.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <MonthPicker label="Start Month" value={rangeStart} onChange={(d) => setStartMonth(startOfMonth(d))} />
          <MonthPicker label="End Month" value={startOfMonth(endMonth)} onChange={(d) => setEndMonth(startOfMonth(d))} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rangeInvalid && (
          <p className="text-sm text-rose-600">Start Month cannot be later than End Month.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="border-muted">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <p className={cn("text-xl font-bold mt-1 truncate", c.tone)}>{c.value}</p>
                  </div>
                  <Icon className={cn("h-7 w-7 opacity-70 shrink-0", c.tone)} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : hasAny ? (
          <>
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium mb-2">Monthly Trend</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <RTooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="leads" name="Leads Received" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="enrolled" name="Enrollments" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Month</TableHead>
                    <TableHead className="text-right font-semibold">Leads Received</TableHead>
                    <TableHead className="text-right font-semibold">Enrollments</TableHead>
                    <TableHead className="text-right font-semibold">Conversion Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.leads.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.enrolled.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.leads > 0 ? `${r.conversion.toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs font-medium mb-2">Performance Insights</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  <span className="font-medium text-foreground">Highest Lead Month:</span>{" "}
                  {highestLeadMonth && highestLeadMonth.leads > 0
                    ? `${highestLeadMonth.label} (${highestLeadMonth.leads.toLocaleString()} leads)`
                    : "—"}
                </li>
                <li>
                  <span className="font-medium text-foreground">Highest Enrollment Month:</span>{" "}
                  {highestEnrolledMonth && highestEnrolledMonth.enrolled > 0
                    ? `${highestEnrolledMonth.label} (${highestEnrolledMonth.enrolled.toLocaleString()} enrollments)`
                    : "—"}
                </li>
                <li>
                  <span className="font-medium text-foreground">Best Conversion Rate:</span>{" "}
                  {bestMonth ? `${bestMonth.label} (${bestMonth.conversion.toFixed(1)}%)` : "—"}
                </li>
                <li>
                  <span className="font-medium text-foreground">Lowest Conversion Rate:</span>{" "}
                  {lowestConversionMonth
                    ? `${lowestConversionMonth.label} (${lowestConversionMonth.conversion.toFixed(1)}%)`
                    : "—"}
                </li>
                <li>
                  <span className="font-medium text-foreground">Average Monthly Conversion Rate:</span>{" "}
                  {monthsWithLeads.length ? `${avgConversion.toFixed(1)}%` : "—"}
                </li>
              </ul>
            </div>
          </>
        ) : (
          !rangeInvalid && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No admission data is available for the selected period.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

function MonthPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-[190px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="text-muted-foreground mr-2">{label}:</span>
          {format(value, "MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && onChange(startOfMonth(d))}
          defaultMonth={value}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}