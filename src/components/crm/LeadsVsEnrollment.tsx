import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { CalendarIcon, Users, GraduationCap, TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Props {
  activeBranchIds: string[];
}

interface MonthMetrics {
  totalLeads: number;
  totalEnrolled: number;
  conversion: number;
}

async function fetchMonthMetrics(
  activeBranchIds: string[],
  monthStart: Date,
  monthEnd: Date
): Promise<MonthMetrics> {
  const fromDateOnly = format(monthStart, "yyyy-MM-dd");
  const toDateOnly = format(monthEnd, "yyyy-MM-dd");
  const fromIso = monthStart.toISOString();
  const toIso = monthEnd.toISOString();

  // Leads received in the selected month (received date, fallback created_at)
  const receivedRes = await supabase
    .from("leads")
    .select("id, lead_received_date, created_at")
    .in("branch_id", activeBranchIds)
    .or(
      `and(lead_received_date.gte.${fromDateOnly},lead_received_date.lte.${toDateOnly}),` +
      `and(lead_received_date.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`
    );
  if (receivedRes.error) throw receivedRes.error;

  const received = (receivedRes.data || []).filter((l: any) => {
    const raw = l.lead_received_date || l.created_at;
    if (!raw) return false;
    const d = new Date(raw);
    return !isNaN(d.getTime()) && d >= monthStart && d <= monthEnd;
  });

  // Enrollments in the selected month (by enrolled_at)
  const enrolledRes = await supabase
    .from("leads")
    .select("id, enrolled_at, status")
    .in("branch_id", activeBranchIds)
    .eq("status", "enrolled")
    .gte("enrolled_at", fromIso)
    .lte("enrolled_at", toIso);
  if (enrolledRes.error) throw enrolledRes.error;

  const totalLeads = received.length;
  const totalEnrolled = (enrolledRes.data || []).length;
  return {
    totalLeads,
    totalEnrolled,
    conversion: totalLeads > 0 ? (totalEnrolled / totalLeads) * 100 : 0,
  };
}

function buildComparisonRow(
  label: string,
  current: number,
  compare: number,
  isRate = false
) {
  const delta = current - compare;
  const pct = compare !== 0 ? (delta / compare) * 100 : (current > 0 ? 100 : 0);
  const positiveGood = !isRate ? delta > 0 : delta > 0;
  const negativeGood = isRate ? delta < 0 : delta < 0;
  const isNeutral = delta === 0;

  return {
    label,
    current,
    compare,
    delta,
    pct,
    positiveGood,
    negativeGood,
    isNeutral,
  };
}

/**
 * Leads Received vs Enrollment — monthly comparison reporting card.
 * Live data via react-query; no schema changes, no side effects on the pipeline.
 */
export default function LeadsVsEnrollment({ activeBranchIds }: Props) {
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [compareMonth, setCompareMonth] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));

  const monthStart = useMemo(() => startOfMonth(month), [month]);
  const monthEnd = useMemo(() => {
    const d = endOfMonth(month);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [month]);
  const monthKey = format(monthStart, "yyyy-MM");

  const compareStart = useMemo(() => startOfMonth(compareMonth), [compareMonth]);
  const compareEnd = useMemo(() => {
    const d = endOfMonth(compareMonth);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [compareMonth]);
  const compareKey = format(compareStart, "yyyy-MM");

  const { data: currentData, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ["leads-vs-enrollment", activeBranchIds.join(","), monthKey],
    enabled: activeBranchIds.length > 0,
    queryFn: () => fetchMonthMetrics(activeBranchIds, monthStart, monthEnd),
  });

  const { data: compareData, isLoading: isLoadingCompare } = useQuery({
    queryKey: ["leads-vs-enrollment", activeBranchIds.join(","), compareKey],
    enabled: activeBranchIds.length > 0,
    queryFn: () => fetchMonthMetrics(activeBranchIds, compareStart, compareEnd),
  });

  const isLoading = isLoadingCurrent || isLoadingCompare;

  const current = currentData ?? { totalLeads: 0, totalEnrolled: 0, conversion: 0 };
  const compare = compareData ?? { totalLeads: 0, totalEnrolled: 0, conversion: 0 };

  const conversionLabel = current.totalLeads > 0 ? `${current.conversion.toFixed(1)}%` : "—";
  const hasAnyData = !isLoading && (current.totalLeads > 0 || current.totalEnrolled > 0 || compare.totalLeads > 0 || compare.totalEnrolled > 0);

  const cards = [
    { label: "Total Leads Received", value: current.totalLeads, icon: Users, tone: "text-primary" },
    { label: "Total Enrollments", value: current.totalEnrolled, icon: GraduationCap, tone: "text-success" },
    { label: "Conversion Rate", value: conversionLabel, icon: TrendingUp, tone: "text-info" },
  ];

  const rows = [
    buildComparisonRow("Total Leads Received", current.totalLeads, compare.totalLeads),
    buildComparisonRow("Total Enrollments", current.totalEnrolled, compare.totalEnrolled),
    buildComparisonRow("Conversion Rate", current.conversion, compare.conversion, true),
  ];

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm">Leads Received vs Enrollment</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Compare selected month against a prior month to spot admissions trends.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-[180px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(monthStart, "MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={monthStart}
                onSelect={(d) => d && setMonth(startOfMonth(d))}
                defaultMonth={monthStart}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-[180px] justify-start text-left font-normal">
                <span className="text-muted-foreground mr-2">vs</span>
                {format(compareStart, "MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={compareStart}
                onSelect={(d) => d && setCompareMonth(startOfMonth(d))}
                defaultMonth={compareStart}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="border-muted">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <p className={cn("text-2xl font-bold mt-1", c.tone)}>{c.value}</p>
                  </div>
                  <Icon className={cn("h-8 w-8 opacity-70", c.tone)} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : hasAnyData ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Metric</TableHead>
                  <TableHead className="text-right font-semibold">{format(monthStart, "MMM yyyy")}</TableHead>
                  <TableHead className="text-right font-semibold">{format(compareStart, "MMM yyyy")}</TableHead>
                  <TableHead className="text-right font-semibold">Change</TableHead>
                  <TableHead className="text-right font-semibold">% Change</TableHead>
                  <TableHead className="text-center font-semibold w-16">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const TrendIcon = r.isNeutral ? Minus : r.positiveGood ? ArrowUp : ArrowDown;
                  const trendColor = r.isNeutral
                    ? "text-muted-foreground"
                    : r.positiveGood
                    ? "text-emerald-600"
                    : "text-rose-600";
                  const isRate = r.label === "Conversion Rate";
                  const fmtValue = (v: number) => (isRate ? `${v.toFixed(1)}%` : v.toLocaleString());
                  const fmtDelta = (v: number) =>
                    `${v >= 0 ? "+" : ""}${isRate ? v.toFixed(1) + "%" : v.toLocaleString()}`;
                  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

                  return (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtValue(r.current)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtValue(r.compare)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          r.isNeutral ? "text-muted-foreground" : r.positiveGood ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {fmtDelta(r.delta)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          r.isNeutral ? "text-muted-foreground" : r.positiveGood ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {fmtPct(r.pct)}
                      </TableCell>
                      <TableCell className="text-center">
                        <TrendIcon className={cn("h-4 w-4 mx-auto", trendColor)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No lead or enrollment data is available for the selected months.
          </p>
        )}
      </CardContent>
    </Card>
  );
}