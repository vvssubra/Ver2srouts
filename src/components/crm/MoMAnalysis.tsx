import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, Minus, Download, Info } from "lucide-react";
import {
  format,
  startOfMonth,
  addMonths,
  parseISO,
  differenceInCalendarDays,
  max as dateMax,
  min as dateMin,
  startOfDay,
  addDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { normalizeSource, sourceLabel, groupForSource, groupLabel } from "@/lib/crm-sources";

type Helpers = {
  leadReportingDate: (l: any) => Date | null;
  spendPeriodOf: (s: any) => { start: Date; endExclusive: Date; endInclusiveLabel: Date } | null;
};

interface Props {
  leads: any[];
  enquiries: any[];
  spends: any[];
  periodStart: Date;
  periodEnd: Date;
  viewMode: "grouped" | "channel";
  helpers: Helpers;
  activeBranchIds: string[];
}

const fmtMYR = (n: number) =>
  `RM ${(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const head = keys.join(",");
  const body = rows
    .map((r) =>
      keys
        .map((k) => {
          const v = r[k] ?? "";
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(",")
    )
    .join("\n");
  return `${head}\n${body}`;
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Day-overlap between a spend row and an arbitrary half-open range.
function spendOverlapRatio(
  spend: any,
  rangeStart: Date,
  rangeEndExclusive: Date,
  spendPeriodOf: Helpers["spendPeriodOf"],
) {
  const period = spendPeriodOf(spend);
  if (!period) return 0;
  const total = differenceInCalendarDays(period.endExclusive, period.start);
  if (total <= 0) return 0;
  const oStart = dateMax([period.start, rangeStart]);
  const oEnd = dateMin([period.endExclusive, rangeEndExclusive]);
  const overlap = Math.max(0, differenceInCalendarDays(oEnd, oStart));
  return Math.min(1, Math.max(0, overlap / total));
}

type Bucket = {
  key: string;
  start: Date;
  endExclusive: Date;
  leads: number;
  enquiries: number;
  enrolled: number;
  spend: number;
  revenue: number;
  lagSum: number;
  lagCount: number;
  bySource: Map<string, { leads: number; enrolled: number; spend: number; revenue: number }>;
};

const ratePct = (curr: number, prev: number): { diff: number; pct: number | null } => {
  const diff = curr - prev;
  if (prev === 0) return { diff, pct: curr === 0 ? 0 : null };
  return { diff, pct: (diff / prev) * 100 };
};

type Direction = "up_good" | "up_bad" | "neutral";
const directionFor = (metric: string): Direction => {
  const lowerBetter = ["cpl", "cpe", "avg_lag"];
  if (lowerBetter.includes(metric)) return "up_bad";
  if (metric === "spend") return "neutral";
  return "up_good";
};

function ChangeBadge({ diff, pct, metric }: { diff: number; pct: number | null; metric: string }) {
  const dir = directionFor(metric);
  if (pct === null) {
    return <Badge variant="outline" className="text-[10px] h-4 px-1">new</Badge>;
  }
  const isUp = diff > 0;
  const isFlat = diff === 0;
  const improved = dir === "neutral" ? false : dir === "up_good" ? isUp : !isUp && !isFlat;
  const tone = isFlat
    ? "text-muted-foreground border-muted"
    : dir === "neutral"
    ? "text-foreground border-muted"
    : improved
    ? "text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30"
    : "text-destructive border-destructive/30";
  const Icon = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", tone)}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 cursor-help opacity-60 inline-block ml-0.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

export default function MoMAnalysis({
  leads,
  enquiries,
  spends,
  periodStart,
  periodEnd,
  viewMode,
  helpers,
  activeBranchIds,
}: Props) {
  const [chartMetric, setChartMetric] = useState<"leads" | "enrolled" | "spend" | "cpl" | "roi">("leads");
  const [compareMode, setCompareMode] = useState<"previous_period" | "calendar_month">("previous_period");

  // Current + previous windows (period-over-period or calendar-month).
  const windows = useMemo(() => {
    const curStart = startOfDay(periodStart);
    const curEnd = startOfDay(periodEnd);
    const fmtRange = (a: Date, bExcl: Date) =>
      `${format(a, "d MMM yyyy")} – ${format(addDays(bExcl, -1), "d MMM yyyy")}`;
    if (compareMode === "calendar_month") {
      const cStart = startOfMonth(curEnd);
      const cEndExcl = addMonths(cStart, 1);
      const pStart = addMonths(cStart, -1);
      return {
        current: { start: cStart, endExclusive: cEndExcl, label: format(cStart, "MMM yyyy") },
        previous: { start: pStart, endExclusive: cStart, label: format(pStart, "MMM yyyy") },
      };
    }
    const lenDays = Math.max(1, differenceInCalendarDays(curEnd, curStart) + 1);
    const cEndExcl = addDays(curEnd, 1);
    const pEndExcl = curStart;
    const pStart = addDays(curStart, -lenDays);
    return {
      current: { start: curStart, endExclusive: cEndExcl, label: fmtRange(curStart, cEndExcl) },
      previous: { start: pStart, endExclusive: pEndExcl, label: fmtRange(pStart, pEndExcl) },
    };
  }, [periodStart, periodEnd, compareMode]);

  // Fetch previous-period data (leads / spend / enquiries).
  const prevKey = [
    activeBranchIds.join(","),
    format(windows.previous.start, "yyyy-MM-dd"),
    format(windows.previous.endExclusive, "yyyy-MM-dd"),
    compareMode,
  ].join("|");

  const { data: prevLeads = [] } = useQuery({
    queryKey: ["mom-prev-leads", prevKey],
    queryFn: async () => {
      const fromIso = windows.previous.start.toISOString();
      const toIso = addDays(windows.previous.endExclusive, -1).toISOString();
      const fromDateOnly = format(windows.previous.start, "yyyy-MM-dd");
      const toDateOnly = format(addDays(windows.previous.endExclusive, -1), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("branch_id", activeBranchIds)
        .or(
          `and(lead_received_date.gte.${fromDateOnly},lead_received_date.lte.${toDateOnly}),` +
          `and(lead_received_date.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`
        );
      if (error) throw error;
      return (data || []).filter((l: any) => {
        const d = helpers.leadReportingDate(l);
        return d !== null && d >= windows.previous.start && d < windows.previous.endExclusive;
      });
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: prevSpends = [] } = useQuery({
    queryKey: ["mom-prev-spends", prevKey],
    queryFn: async () => {
      const fromDateOnly = format(windows.previous.start, "yyyy-MM-dd");
      const toDateOnly = format(addDays(windows.previous.endExclusive, -1), "yyyy-MM-dd");
      const monthFrom = format(startOfMonth(windows.previous.start), "yyyy-MM-dd");
      const monthTo = format(startOfMonth(addDays(windows.previous.endExclusive, -1)), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("marketing_spend")
        .select("*")
        .in("branch_id", activeBranchIds)
        .or(
          `and(spend_start_date.lte.${toDateOnly},spend_end_date.gte.${fromDateOnly}),` +
          `and(spend_start_date.is.null,spend_month.gte.${monthFrom},spend_month.lte.${monthTo})`
        );
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: prevEnquiries = [] } = useQuery({
    queryKey: ["mom-prev-enquiries", prevKey],
    queryFn: async () => {
      const monthFrom = format(startOfMonth(windows.previous.start), "yyyy-MM-dd");
      const monthTo = format(startOfMonth(addDays(windows.previous.endExclusive, -1)), "yyyy-MM-dd");
      const { data, error } = await (supabase as any)
        .from("source_enquiries")
        .select("*")
        .in("branch_id", activeBranchIds)
        .gte("period_month", monthFrom)
        .lte("period_month", monthTo);
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  // Bucket builder used for current, previous, and trend buckets.
  function buildBucket(
    key: string,
    start: Date,
    endExclusive: Date,
    leadsSrc: any[],
    spendsSrc: any[],
    enquiriesSrc: any[],
  ): Bucket {
    const bucket: Bucket = {
      key,
      start,
      endExclusive,
      leads: 0,
      enquiries: 0,
      enrolled: 0,
      spend: 0,
      revenue: 0,
      lagSum: 0,
      lagCount: 0,
      bySource: new Map(),
    };

    leadsSrc.forEach((l) => {
      const rd = helpers.leadReportingDate(l);
      if (!rd) return;
      const d = startOfDay(rd);
      if (d < start || d >= endExclusive) return;
      bucket.leads += 1;
      const k = normalizeSource(l.source);
      const row = bucket.bySource.get(k) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
      row.leads += 1;
      bucket.bySource.set(k, row);
    });

    leadsSrc.forEach((l) => {
      if (l.status !== "enrolled" || !l.enrolled_at) return;
      const enrolled = new Date(l.enrolled_at);
      if (enrolled < start || enrolled >= endExclusive) return;
      bucket.enrolled += 1;
      bucket.revenue += Number(l.total_fees_paid_at_enrollment) || 0;
      const k = normalizeSource(l.source);
      const row = bucket.bySource.get(k) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
      row.enrolled += 1;
      row.revenue += Number(l.total_fees_paid_at_enrollment) || 0;
      bucket.bySource.set(k, row);
      const origin = helpers.leadReportingDate(l);
      if (origin) {
        bucket.lagSum += differenceInCalendarDays(enrolled, origin);
        bucket.lagCount += 1;
      }
    });

    // Enquiries are monthly; prorate by day-overlap with [start, endExclusive).
    enquiriesSrc.forEach((e) => {
      if (!e.period_month) return;
      const mStart = startOfMonth(parseISO(String(e.period_month).slice(0, 10)));
      const mEndExcl = addMonths(mStart, 1);
      const oStart = dateMax([mStart, start]);
      const oEnd = dateMin([mEndExcl, endExclusive]);
      const overlap = Math.max(0, differenceInCalendarDays(oEnd, oStart));
      const total = differenceInCalendarDays(mEndExcl, mStart);
      if (overlap <= 0 || total <= 0) return;
      bucket.enquiries += (Number(e.count) || 0) * (overlap / total);
    });

    spendsSrc.forEach((s) => {
      const ratio = spendOverlapRatio(s, start, endExclusive, helpers.spendPeriodOf);
      if (ratio <= 0) return;
      const amt = Number(s.amount || 0) * ratio;
      bucket.spend += amt;
      const srcs: string[] =
        Array.isArray(s.sources) && s.sources.length > 0
          ? s.sources.map(normalizeSource)
          : s.source
          ? [normalizeSource(s.source)]
          : [];
      if (srcs.length === 0) return;
      const per = amt / srcs.length;
      srcs.forEach((k) => {
        const row = bucket.bySource.get(k) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
        row.spend += per;
        bucket.bySource.set(k, row);
      });
    });

    return bucket;
  }

  const current = useMemo(
    () => buildBucket("current", windows.current.start, windows.current.endExclusive, leads, spends, enquiries),
    [windows, leads, spends, enquiries, helpers],
  );
  const previous = useMemo(
    () => buildBucket("previous", windows.previous.start, windows.previous.endExclusive, prevLeads as any[], prevSpends as any[], prevEnquiries as any[]),
    [windows, prevLeads, prevSpends, prevEnquiries, helpers],
  );

  // Trend buckets: weekly if range < 60 days, else monthly.
  const trendBuckets = useMemo<Bucket[]>(() => {
    const rangeDays = differenceInCalendarDays(windows.current.endExclusive, windows.current.start);
    if (rangeDays < 60) {
      const weeks = eachWeekOfInterval(
        { start: windows.current.start, end: addDays(windows.current.endExclusive, -1) },
        { weekStartsOn: 1 },
      );
      return weeks.map((w) => {
        const wStart = startOfDay(w);
        const wEndExcl = addDays(endOfWeek(w, { weekStartsOn: 1 }), 1);
        const s = dateMax([wStart, windows.current.start]);
        const e = dateMin([wEndExcl, windows.current.endExclusive]);
        return buildBucket(format(s, "d MMM"), s, e, leads, spends, enquiries);
      });
    }
    const months = eachMonthOfInterval({
      start: startOfMonth(windows.current.start),
      end: startOfMonth(addDays(windows.current.endExclusive, -1)),
    });
    return months.map((m) => {
      const mStart = startOfMonth(m);
      const mEndExcl = addMonths(mStart, 1);
      const s = dateMax([mStart, windows.current.start]);
      const e = dateMin([mEndExcl, windows.current.endExclusive]);
      return buildBucket(format(mStart, "MMM yy"), s, e, leads, spends, enquiries);
    });
  }, [windows, leads, spends, enquiries, helpers]);

  const metrics = useMemo(() => {
    const cCPL = safeDiv(current.spend, current.leads);
    const cCPE = safeDiv(current.spend, current.enrolled);
    const cROAS = safeDiv(current.revenue, current.spend);
    const cROI = current.spend > 0 ? ((current.revenue - current.spend) / current.spend) * 100 : 0;
    const cLag = current.lagCount > 0 ? current.lagSum / current.lagCount : 0;
    const pCPL = safeDiv(previous.spend, previous.leads);
    const pCPE = safeDiv(previous.spend, previous.enrolled);
    const pROAS = safeDiv(previous.revenue, previous.spend);
    const pROI = previous.spend > 0 ? ((previous.revenue - previous.spend) / previous.spend) * 100 : 0;
    const pLag = previous.lagCount > 0 ? previous.lagSum / previous.lagCount : 0;

    return [
      { key: "leads", label: "Leads Received", curr: current.leads, prev: previous.leads, fmt: (n: number) => String(Math.round(n)) },
      { key: "enquiries", label: "Enquiries", curr: current.enquiries, prev: previous.enquiries, fmt: (n: number) => String(Math.round(n)) },
      { key: "enrolled", label: "Enrolled", curr: current.enrolled, prev: previous.enrolled, fmt: (n: number) => String(Math.round(n)) },
      { key: "spend", label: "Marketing Spend", curr: current.spend, prev: previous.spend, fmt: fmtMYR, hint: "Prorated by day overlap with each period." },
      { key: "revenue", label: "Revenue", curr: current.revenue, prev: previous.revenue, fmt: fmtMYR },
      { key: "cpl", label: "CPL", curr: cCPL, prev: pCPL, fmt: fmtMYR, hint: "Cost per Lead = Spend ÷ Leads." },
      { key: "cpe", label: "Cost per Enrollment", curr: cCPE, prev: pCPE, fmt: fmtMYR, hint: "Spend ÷ Enrolled." },
      { key: "roas", label: "ROAS", curr: cROAS, prev: pROAS, fmt: (n: number) => `${n.toFixed(2)}x`, hint: "Return on Ad Spend = Revenue ÷ Spend." },
      { key: "roi", label: "ROI %", curr: cROI, prev: pROI, fmt: (n: number) => `${n.toFixed(1)}%`, hint: "(Revenue − Spend) ÷ Spend × 100." },
      { key: "avg_lag", label: "Avg Lead → Enrollment", curr: cLag, prev: pLag, fmt: (n: number) => (n > 0 ? `${Math.round(n)} days` : "—") },
    ] as { key: string; label: string; curr: number; prev: number; fmt: (n: number) => string; hint?: string }[];
  }, [current, previous]);

  type SourceRow = {
    key: string;
    label: string;
    cLeads: number; pLeads: number;
    cEnrolled: number; pEnrolled: number;
    cSpend: number; pSpend: number;
    cRevenue: number; pRevenue: number;
  };
  const [sortBy, setSortBy] = useState<keyof SourceRow | "leads_change">("cLeads");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sourceRows = useMemo<SourceRow[]>(() => {
    const collect = (bucket: Bucket) => {
      const map = new Map<string, { leads: number; enrolled: number; spend: number; revenue: number }>();
      if (viewMode === "channel") {
        bucket.bySource.forEach((v, k) => map.set(k, { ...v }));
      } else {
        bucket.bySource.forEach((v, k) => {
          const g = groupForSource(k);
          const prev = map.get(g) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
          prev.leads += v.leads;
          prev.enrolled += v.enrolled;
          prev.spend += v.spend;
          prev.revenue += v.revenue;
          map.set(g, prev);
        });
      }
      return map;
    };
    const c = collect(current);
    const p = collect(previous);
    const keys = new Set<string>([...c.keys(), ...p.keys()]);
    const rows: SourceRow[] = [];
    keys.forEach((k) => {
      const cv = c.get(k) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
      const pv = p.get(k) || { leads: 0, enrolled: 0, spend: 0, revenue: 0 };
      rows.push({
        key: k,
        label: viewMode === "grouped" ? groupLabel(k) : sourceLabel(k),
        cLeads: cv.leads, pLeads: pv.leads,
        cEnrolled: cv.enrolled, pEnrolled: pv.enrolled,
        cSpend: cv.spend, pSpend: pv.spend,
        cRevenue: cv.revenue, pRevenue: pv.revenue,
      });
    });
    rows.sort((a, b) => {
      const av = (a as any)[sortBy] ?? 0;
      const bv = (b as any)[sortBy] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [current, previous, viewMode, sortBy, sortDir]);

  const chartData = useMemo(() => {
    return trendBuckets.map((b) => ({
      bucket: b.key,
      leads: b.leads,
      enrolled: b.enrolled,
      spend: Number(b.spend.toFixed(2)),
      cpl: Number(safeDiv(b.spend, b.leads).toFixed(2)),
      roi: Number((b.spend > 0 ? ((b.revenue - b.spend) / b.spend) * 100 : 0).toFixed(1)),
    }));
  }, [trendBuckets]);

  const exportMomCSV = () => {
    const rows: any[] = metrics.map((m) => {
      const r = ratePct(m.curr, m.prev);
      const dir = directionFor(m.key);
      const direction =
        r.pct === null ? "new"
        : r.diff === 0 ? "stable"
        : dir === "neutral" ? (r.diff > 0 ? "increase" : "decrease")
        : dir === "up_good" ? (r.diff > 0 ? "improved" : "dropped")
        : (r.diff > 0 ? "dropped" : "improved");
      return {
        current_period: windows.current.label,
        previous_period: windows.previous.label,
        metric: m.key,
        current_value: typeof m.curr === "number" ? m.curr.toFixed(2) : m.curr,
        previous_value: typeof m.prev === "number" ? m.prev.toFixed(2) : m.prev,
        absolute_change: r.diff.toFixed(2),
        percentage_change: r.pct === null ? "" : r.pct.toFixed(2),
        direction,
        source_group: "",
        source: "",
      };
    });
    sourceRows.forEach((s) => {
      const r = ratePct(s.cLeads, s.pLeads);
      const dir = directionFor("leads");
      const direction =
        r.pct === null ? "new"
        : r.diff === 0 ? "stable"
        : dir === "up_good" ? (r.diff > 0 ? "improved" : "dropped")
        : (r.diff > 0 ? "dropped" : "improved");
      rows.push({
        current_period: windows.current.label,
        previous_period: windows.previous.label,
        metric: "leads_by_source",
        current_value: s.cLeads,
        previous_value: s.pLeads,
        absolute_change: r.diff,
        percentage_change: r.pct === null ? "" : r.pct.toFixed(2),
        direction,
        source_group: viewMode === "grouped" ? s.label : groupLabel(groupForSource(s.key)),
        source: viewMode === "channel" ? s.label : "",
      });
    });
    download(`period-comparison-${format(windows.current.start, "yyyyMMdd")}-${format(addDays(windows.current.endExclusive, -1), "yyyyMMdd")}.csv`, toCSV(rows));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm">Period-over-Period Analysis</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Compares your selected reporting range against the previous period of the same length.
                Leads use <strong>Lead Received Date</strong>, enrollments use <strong>Enrolled Date</strong>, spend is prorated by day-overlap.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={compareMode} onValueChange={(v) => setCompareMode(v as any)}>
              <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="previous_period">Compare vs previous period</SelectItem>
                <SelectItem value="calendar_month">Compare vs previous calendar month</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8" onClick={exportMomCSV}>
              <Download className="h-3.5 w-3.5 mr-1" />Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Period headers */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border p-2 bg-primary/5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current period</p>
            <p className="font-medium">{windows.current.label}</p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Previous period
              <InfoTip text="The reporting window immediately before your selected range, of the same length. Switch to calendar-month compare in the dropdown above if preferred." />
            </p>
            <p className="font-medium">{windows.previous.label}</p>
          </div>
        </div>

        {/* KPI comparison cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((m) => {
            const r = ratePct(m.curr, m.prev);
            return (
              <Card key={m.key}>
                <CardContent className="p-3">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {m.label}
                    {m.hint && <InfoTip text={m.hint} />}
                  </p>
                  <p className="text-base font-semibold mt-0.5">{m.fmt(m.curr)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">prev {m.fmt(m.prev)}</span>
                    <ChangeBadge diff={r.diff} pct={r.pct} metric={m.key} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trend chart (within current period) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium">Trend within current period</p>
            <Select value={chartMetric} onValueChange={(v) => setChartMetric(v as any)}>
              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads Received</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="spend">Spend (RM)</SelectItem>
                <SelectItem value="cpl">CPL (RM)</SelectItem>
                <SelectItem value="roi">ROI %</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey={chartMetric} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source breakdown */}
        <div>
          <p className="text-xs font-medium mb-2">
            Comparison by {viewMode === "grouped" ? "channel group" : "source"} (toggle in filter bar above)
          </p>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewMode === "grouped" ? "Group" : "Source"}</TableHead>
                  {[
                    ["cLeads", "Leads (curr)"],
                    ["pLeads", "Leads (prev)"],
                    ["leads_change", "Leads Δ"],
                    ["cEnrolled", "Enrol (curr)"],
                    ["pEnrolled", "Enrol (prev)"],
                    ["enrolled_change", "Enrol Δ"],
                    ["cSpend", "Spend (curr)"],
                    ["pSpend", "Spend (prev)"],
                    ["cpl_change", "CPL Δ"],
                    ["roi_change", "ROI Δ"],
                  ].map(([key, label]) => (
                    <TableHead key={key} className="text-right">
                      <button
                        onClick={() => {
                          if (sortBy === key) {
                            setSortDir(sortDir === "desc" ? "asc" : "desc");
                          } else {
                            setSortBy(key as any);
                            setSortDir("desc");
                          }
                        }}
                        className="inline-flex items-center gap-0.5 hover:underline"
                      >
                        {label}
                        {sortBy === key && (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRows.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-4 text-xs">No source activity.</TableCell></TableRow>
                ) : sourceRows.map((s) => {
                  const leadsR = ratePct(s.cLeads, s.pLeads);
                  const enrR = ratePct(s.cEnrolled, s.pEnrolled);
                  const cCPL = safeDiv(s.cSpend, s.cLeads);
                  const pCPL = safeDiv(s.pSpend, s.pLeads);
                  const cplR = ratePct(cCPL, pCPL);
                  const cROI = s.cSpend > 0 ? ((s.cRevenue - s.cSpend) / s.cSpend) * 100 : 0;
                  const pROI = s.pSpend > 0 ? ((s.pRevenue - s.pSpend) / s.pSpend) * 100 : 0;
                  const roiR = ratePct(cROI, pROI);
                  return (
                    <TableRow key={s.key}>
                      <TableCell className="font-medium text-xs">{s.label}</TableCell>
                      <TableCell className="text-right text-xs">{s.cLeads}</TableCell>
                      <TableCell className="text-right text-xs">{s.pLeads}</TableCell>
                      <TableCell className="text-right"><ChangeBadge {...leadsR} metric="leads" /></TableCell>
                      <TableCell className="text-right text-xs">{s.cEnrolled}</TableCell>
                      <TableCell className="text-right text-xs">{s.pEnrolled}</TableCell>
                      <TableCell className="text-right"><ChangeBadge {...enrR} metric="enrolled" /></TableCell>
                      <TableCell className="text-right text-xs">{fmtMYR(s.cSpend)}</TableCell>
                      <TableCell className="text-right text-xs">{fmtMYR(s.pSpend)}</TableCell>
                      <TableCell className="text-right"><ChangeBadge {...cplR} metric="cpl" /></TableCell>
                      <TableCell className="text-right"><ChangeBadge {...roiR} metric="roi" /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}