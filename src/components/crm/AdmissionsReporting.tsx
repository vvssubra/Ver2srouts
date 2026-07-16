import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, TrendingUp, DollarSign, Users, Target, Pencil, ChevronRight, ChevronDown, Clock, Info } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format, startOfMonth, endOfMonth, parseISO, startOfYear, subDays, subMonths, differenceInCalendarDays, eachMonthOfInterval, getDaysInMonth, max as dateMax, min as dateMin, addDays, addMonths, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { LEAD_SOURCES, SPEND_CHANNELS, normalizeSource, sourceLabel, CHANNEL_GROUPS, groupForSource, sourcesForGroup, groupLabel } from "@/lib/crm-sources";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import MoMAnalysis from "./MoMAnalysis";
import LeadsVsEnrollment from "./LeadsVsEnrollment";
import CohortAnalysisMoM from "./CohortAnalysisMoM";

const CHANNELS = SPEND_CHANNELS;

const fmtMYR = (n: number) => `RM ${(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const head = keys.join(",");
  const body = rows.map((r) => keys.map((k) => {
    const v = r[k] ?? "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(",")).join("\n");
  return `${head}\n${body}`;
}
function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  activeBranchIds: string[];
  branches: { id: string; name: string }[];
}

export default function AdmissionsReporting({ activeBranchIds, branches }: Props) {
  const qc = useQueryClient();
  const today = new Date();
  const defaultFrom = format(startOfMonth(new Date(today.getFullYear(), today.getMonth() - 5, 1)), "yyyy-MM-dd");
  const defaultTo = format(today, "yyyy-MM-dd");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [viewMode, setViewMode] = useState<"grouped" | "channel">("grouped");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [cohortTab, setCohortTab] = useState<"origin" | "lag">("origin");
  const [spendDialogOpen, setSpendDialogOpen] = useState(false);
  const [enquiriesDialogOpen, setEnquiriesDialogOpen] = useState(false);

  const periodStart = useMemo(() => parseISO(fromDate), [fromDate]);
  const periodEnd = useMemo(() => {
    const d = parseISO(toDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [toDate]);
  const monthQueryStart = useMemo(() => startOfMonth(periodStart), [periodStart]);
  const monthQueryEnd = useMemo(() => endOfMonth(periodEnd), [periodEnd]);

  // Reset filter when toggling view modes so stale values don't mismatch
  useEffect(() => {
    setSourceFilter("all");
    setExpandedGroups(new Set());
  }, [viewMode]);

  const applyQuickRange = (key: string) => {
    const now = new Date();
    let from: Date, to: Date;
    switch (key) {
      case "this_month": from = startOfMonth(now); to = now; break;
      case "last_month": {
        const lm = subMonths(now, 1);
        from = startOfMonth(lm); to = endOfMonth(lm); break;
      }
      case "7d": from = subDays(now, 6); to = now; break;
      case "30d": from = subDays(now, 29); to = now; break;
      case "90d": from = subDays(now, 89); to = now; break;
      case "ytd": from = startOfYear(now); to = now; break;
      default: return;
    }
    setFromDate(format(from, "yyyy-MM-dd"));
    setToDate(format(to, "yyyy-MM-dd"));
  };

  // Helper: a lead's "reporting date" is its lead_received_date if present,
  // otherwise its created_at. All admissions reporting is keyed off this date.
  const leadReportingDate = (l: any): Date | null => {
    const raw = l?.lead_received_date || l?.inquiry_date || l?.created_at;
    if (!raw) return null;
    // date-only strings (yyyy-MM-dd) parse to UTC midnight — fine for day buckets
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  const { data: leads = [] } = useQuery({
    queryKey: ["report-leads", activeBranchIds.join(","), fromDate, toDate],
    queryFn: async () => {
      // Pull leads whose lead_received_date falls in range OR (when missing)
      // whose created_at falls in range. Filtered client-side by leadReportingDate.
      const fromIso = periodStart.toISOString();
      const toIso = periodEnd.toISOString();
      const fromDateOnly = format(periodStart, "yyyy-MM-dd");
      const toDateOnly = format(periodEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("branch_id", activeBranchIds)
        .or(
          `and(lead_received_date.gte.${fromDateOnly},lead_received_date.lte.${toDateOnly}),` +
          `and(lead_received_date.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`
        );
      if (error) throw error;
      const rows = (data || []) as any[];
      // Final guard: only keep rows whose reporting date is inside the range.
      return rows.filter((l) => {
        const d = leadReportingDate(l);
        return d !== null && d >= periodStart && d <= periodEnd;
      });
    },
    enabled: activeBranchIds.length > 0,
  });

  // Enrolled-in-range cohort: leads whose enrolled_at falls in the period,
  // regardless of when the lead was originally created. Used for lag analysis.
  const { data: enrolledCohort = [] } = useQuery({
    queryKey: ["report-enrolled-cohort", activeBranchIds.join(","), fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("branch_id", activeBranchIds)
        .eq("status", "enrolled")
        .gte("enrolled_at", periodStart.toISOString())
        .lte("enrolled_at", periodEnd.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: spends = [], refetch: refetchSpends } = useQuery({
    queryKey: ["marketing-spend", activeBranchIds.join(","), fromDate, toDate],
    queryFn: async () => {
      // Fetch spends that overlap the selected date range. Two cases:
      // (a) row has explicit period dates that overlap [fromDate, toDate]
      // (b) legacy row with no period dates — fall back to spend_month month bucket
      const fromDateOnly = format(periodStart, "yyyy-MM-dd");
      const toDateOnly = format(periodEnd, "yyyy-MM-dd");
      const monthFrom = format(monthQueryStart, "yyyy-MM-dd");
      const monthTo = format(monthQueryEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("marketing_spend")
        .select("*")
        .in("branch_id", activeBranchIds)
        .or(
          `and(spend_start_date.lte.${toDateOnly},spend_end_date.gte.${fromDateOnly}),` +
          `and(spend_start_date.is.null,spend_month.gte.${monthFrom},spend_month.lte.${monthTo})`
        )
        .order("spend_month", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: enquiries = [], refetch: refetchEnquiries } = useQuery({
    queryKey: ["source-enquiries", activeBranchIds.join(","), fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("source_enquiries")
        .select("*")
        .in("branch_id", activeBranchIds)
        .gte("period_month", format(monthQueryStart, "yyyy-MM-dd"))
        .lte("period_month", format(monthQueryEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  // Per-month proration: ratio of selected-range overlap vs full month.
  // Used to scale month-based spend & enquiries when the user picks a partial range.
  const monthProration = useMemo(() => {
    const map = new Map<string, number>();
    const months = eachMonthOfInterval({ start: monthQueryStart, end: monthQueryEnd });
    months.forEach((m) => {
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const overlapStart = dateMax([mStart, periodStart]);
      const overlapEnd = dateMin([mEnd, periodEnd]);
      const overlapDays = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart) + 1);
      const ratio = overlapDays / getDaysInMonth(m);
      map.set(format(mStart, "yyyy-MM"), Math.min(1, Math.max(0, ratio)));
    });
    return map;
  }, [monthQueryStart, monthQueryEnd, periodStart, periodEnd]);

  // Spend period uses HALF-OPEN intervals: [start, endExclusive).
  // - The saved spend_end_date is treated as exclusive for calculation so
  //   back-to-back periods (e.g. 7 Jun–7 Jul, 7 Jul–7 Aug) never double-count
  //   the boundary date.
  // - The UI continues to render the saved end date as the visible label.
  // - For legacy rows without period dates, the period is the full calendar
  //   month derived from spend_month: [startOfMonth, startOfNextMonth).
  const spendPeriodOf = (s: any): { start: Date; endExclusive: Date; endInclusiveLabel: Date } | null => {
    if (s?.spend_start_date && s?.spend_end_date) {
      const start = startOfDay(parseISO(s.spend_start_date));
      const endExclusive = startOfDay(parseISO(s.spend_end_date));
      if (endExclusive <= start) return null;
      return { start, endExclusive, endInclusiveLabel: parseISO(s.spend_end_date) };
    }
    if (s?.spend_month) {
      const start = startOfMonth(parseISO(s.spend_month));
      const endExclusive = addMonths(start, 1);
      const endInclusiveLabel = endOfMonth(start);
      return { start, endExclusive, endInclusiveLabel };
    }
    return null;
  };

  // Report range as half-open interval: [periodStart, reportEndExclusive)
  const reportEndExclusive = useMemo(() => addDays(startOfDay(parseISO(toDate)), 1), [toDate]);
  const reportStartDay = useMemo(() => startOfDay(parseISO(fromDate)), [fromDate]);

  const prorationOfSpend = (s: any): { ratio: number; prorated: boolean } => {
    const period = spendPeriodOf(s);
    if (!period) return { ratio: 1, prorated: false };
    const totalDays = differenceInCalendarDays(period.endExclusive, period.start);
    if (totalDays <= 0) return { ratio: 0, prorated: false };
    const overlapStart = dateMax([period.start, reportStartDay]);
    const overlapEnd = dateMin([period.endExclusive, reportEndExclusive]);
    const overlapDays = Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart));
    const ratio = Math.min(1, Math.max(0, overlapDays / totalDays));
    return { ratio, prorated: ratio > 0 && ratio < 1 };
  };
  // Kept for enquiries (which are still monthly buckets)
  const prorationOf = (monthStr: string) => monthProration.get(monthStr.slice(0, 7)) ?? 1;

  // Per-source enquiry totals across the selected period (prorated)
  const enquiriesBySource = useMemo(() => {
    const map = new Map<string, number>();
    (enquiries as any[]).forEach((e) => {
      const k = normalizeSource(e.source);
      const ratio = prorationOf(e.period_month);
      map.set(k, (map.get(k) || 0) + (Number(e.count) || 0) * ratio);
    });
    return map;
  }, [enquiries, monthProration]);

  // Filter helper that understands both raw sources and channel groups
  const matchesSourceFilter = (rawSource: string | null | undefined): boolean => {
    if (sourceFilter === "all") return true;
    const norm = normalizeSource(rawSource);
    if (viewMode === "grouped") {
      return sourcesForGroup(sourceFilter).includes(norm);
    }
    return norm === sourceFilter;
  };

  const filteredLeads = useMemo(
    () => (sourceFilter === "all" ? leads : leads.filter((l: any) => matchesSourceFilter(l.source))),
    [leads, sourceFilter, viewMode]
  );

  // Funnel
  const funnel = useMemo(() => {
    const total = filteredLeads.length;
    const contacted = filteredLeads.filter((l: any) => l.first_contacted_at || ["contacted","tour_scheduled","trial_scheduled","waitlisted","enrolled"].includes(l.status)).length;
    const tours = filteredLeads.filter((l: any) => l.tour_scheduled_at || ["tour_scheduled","trial_scheduled","waitlisted","enrolled"].includes(l.status)).length;
    const trials = filteredLeads.filter((l: any) => l.trial_scheduled_at || ["trial_scheduled","waitlisted","enrolled"].includes(l.status)).length;
    const enrolled = filteredLeads.filter((l: any) => l.status === "enrolled").length;
    const lost = filteredLeads.filter((l: any) => l.status === "lost" || l.lost_at).length;
    return { total, contacted, tours, trials, enrolled, lost };
  }, [filteredLeads]);

  const revenue = useMemo(
    () => filteredLeads.reduce((sum: number, l: any) => sum + (Number(l.total_fees_paid_at_enrollment) || 0), 0),
    [filteredLeads]
  );
  // Spend rows carry either a `sources` array (new) or a single `source` (legacy).
  // For totals: when a source filter is active, we attribute the per-source split
  // (amount / N sources) to the selected source. Otherwise we sum full amounts.
  const spendSourcesOf = (s: any): string[] => {
    const arr: string[] = Array.isArray(s.sources) && s.sources.length > 0
      ? s.sources
      : (s.source ? [s.source] : []);
    return arr.map(normalizeSource);
  };
  // Effective amount of a spend row after applying period (or legacy month) proration
  const proratedAmount = (s: any) => Number(s.amount || 0) * prorationOfSpend(s).ratio;
  const hasProratedSpend = useMemo(
    () => (spends as any[]).some((s) => prorationOfSpend(s).prorated),
    [spends, periodStart, periodEnd, monthProration]
  );
  // Back-compat alias (used in some banners). True if any included spend row
  // is prorated for the selected range.
  const hasPartialMonth = hasProratedSpend;

  const totalSpend = useMemo(() => {
    if (sourceFilter === "all") {
      return spends.reduce((sum: number, s: any) => sum + proratedAmount(s), 0);
    }
    return spends.reduce((sum: number, s: any) => {
      const srcs = spendSourcesOf(s);
      const matchingSrcs = srcs.filter((k) => matchesSourceFilter(k));
      if (matchingSrcs.length === 0) return sum;
      // Attribute by share of matching sources
      return sum + proratedAmount(s) * (matchingSrcs.length / srcs.length);
    }, 0);
  }, [spends, sourceFilter, viewMode, monthProration]);

  const cpl = safeDiv(totalSpend, funnel.total);
  const cpe = safeDiv(totalSpend, funnel.enrolled);
  const roas = safeDiv(revenue, totalSpend);
  const roi = totalSpend > 0 ? ((revenue - totalSpend) / totalSpend) * 100 : 0;

  // Per source
  // Per source — always computed at raw-source granularity; the table renderer
  // rolls these up into channel groups when viewMode === "grouped".
  const bySource = useMemo(() => {
    const map = new Map<string, { source: string; enquiries: number; leads: number; enrolled: number; revenue: number; spend: number }>();
    filteredLeads.forEach((l: any) => {
      const k = normalizeSource(l.source);
      const r = map.get(k) || { source: k, enquiries: 0, leads: 0, enrolled: 0, revenue: 0, spend: 0 };
      r.leads += 1;
      if (l.status === "enrolled") r.enrolled += 1;
      r.revenue += Number(l.total_fees_paid_at_enrollment) || 0;
      map.set(k, r);
    });
    spends.forEach((s: any) => {
      const srcs = spendSourcesOf(s);
      if (srcs.length === 0) return;
      const perSource = proratedAmount(s) / srcs.length;
      srcs.forEach((k) => {
        if (!matchesSourceFilter(k)) return;
        const r = map.get(k) || { source: k, enquiries: 0, leads: 0, enrolled: 0, revenue: 0, spend: 0 };
        r.spend += perSource;
        map.set(k, r);
      });
    });
    // Fold enquiry counts in (also surface sources that only have enquiries logged)
    enquiriesBySource.forEach((count, k) => {
      if (!matchesSourceFilter(k)) return;
      const r = map.get(k) || { source: k, enquiries: 0, leads: 0, enrolled: 0, revenue: 0, spend: 0 };
      r.enquiries += count;
      map.set(k, r);
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [filteredLeads, spends, sourceFilter, viewMode, enquiriesBySource, monthProration]);

  // Rolled-up rows for "Grouped" view: one row per channel group, with
  // children = per-channel breakdown for drill-down.
  type GroupRow = {
    group: string;
    label: string;
    enquiries: number;
    leads: number;
    enrolled: number;
    revenue: number;
    spend: number;
    children: { source: string; enquiries: number; leads: number; enrolled: number; revenue: number; spend: number }[];
  };
  const byGroup = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();
    bySource.forEach((r) => {
      const g = groupForSource(r.source);
      const row = map.get(g) || { group: g, label: groupLabel(g), enquiries: 0, leads: 0, enrolled: 0, revenue: 0, spend: 0, children: [] };
      row.enquiries += r.enquiries;
      row.leads += r.leads;
      row.enrolled += r.enrolled;
      row.revenue += r.revenue;
      row.spend += r.spend;
      row.children.push(r);
      map.set(g, row);
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [bySource]);

  // Cohort: enrolled-in-range leads grouped by their origin month
  const cohortByOriginMonth = useMemo(() => {
    const map = new Map<string, { month: string; enrolled: number; lagSum: number; topSource: Map<string, number> }>();
    (enrolledCohort as any[]).forEach((l) => {
      const origin = leadReportingDate(l);
      if (!origin || !l.enrolled_at) return;
      const enrolled = new Date(l.enrolled_at);
      const key = format(startOfMonth(origin), "yyyy-MM");
      const lag = differenceInCalendarDays(enrolled, origin);
      const row = map.get(key) || { month: key, enrolled: 0, lagSum: 0, topSource: new Map() };
      row.enrolled += 1;
      row.lagSum += lag;
      const src = normalizeSource(l.source);
      row.topSource.set(src, (row.topSource.get(src) || 0) + 1);
      map.set(key, row);
    });
    const total = (enrolledCohort as any[]).length;
    return Array.from(map.values())
      .map((r) => {
        let top = "—", topN = 0;
        r.topSource.forEach((v, k) => { if (v > topN) { topN = v; top = k; } });
        return {
          month: r.month,
          enrolled: r.enrolled,
          pct: total > 0 ? (r.enrolled / total) * 100 : 0,
          avgLag: r.enrolled > 0 ? Math.round(r.lagSum / r.enrolled) : 0,
          topSource: top,
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [enrolledCohort]);

  const lagDistribution = useMemo(() => {
    const buckets = [
      { label: "< 7 days", min: 0, max: 6, count: 0 },
      { label: "7–30 days", min: 7, max: 30, count: 0 },
      { label: "30–60 days", min: 31, max: 60, count: 0 },
      { label: "60–90 days", min: 61, max: 90, count: 0 },
      { label: "> 90 days", min: 91, max: Infinity, count: 0 },
    ];
    (enrolledCohort as any[]).forEach((l) => {
      const origin = leadReportingDate(l);
      if (!origin || !l.enrolled_at) return;
      const lag = differenceInCalendarDays(new Date(l.enrolled_at), origin);
      const b = buckets.find((x) => lag >= x.min && lag <= x.max);
      if (b) b.count += 1;
    });
    return buckets;
  }, [enrolledCohort]);

  const avgLag = useMemo(() => {
    const lags: number[] = (enrolledCohort as any[])
      .map((l) => {
        const origin = leadReportingDate(l);
        if (!origin || !l.enrolled_at) return null;
        return differenceInCalendarDays(new Date(l.enrolled_at), origin);
      })
      .filter((n): n is number => n !== null);
    if (!lags.length) return null;
    return Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
  }, [enrolledCohort]);

  const enrolledInPeriodAnyOrigin = (enrolledCohort as any[]).length;
  const enrolledInPeriodAndCreatedInPeriod = (enrolledCohort as any[]).filter((l) => {
    const d = leadReportingDate(l);
    if (!d) return false;
    return d >= periodStart && d <= periodEnd;
  }).length;

  const byCampaign = useMemo(() => {
    // Each campaign row = a marketing_spend entry. Attribute leads to it when
    // the lead's source matches one of the campaign's sources AND the lead was
    // created in the same month as the spend (spend_month).
    type Row = { campaign: string; leads: number; enrolled: number; revenue: number; spend: number };
    const rows: Row[] = [];
    spends.forEach((s: any) => {
      const name = s.campaign_name || "(Unnamed campaign)";
      const srcs = spendSourcesOf(s);
      // Attribute leads whose reporting date falls inside the spend's
      // half-open period [start, endExclusive). Falls back to the spend_month
      // bucket for legacy rows (handled inside spendPeriodOf).
      const period = spendPeriodOf(s);
      const row: Row = { campaign: name, leads: 0, enrolled: 0, revenue: 0, spend: proratedAmount(s) };
      filteredLeads.forEach((l: any) => {
        const leadSrc = normalizeSource(l.source);
        if (srcs.length > 0 && !srcs.includes(leadSrc)) return;
        const reportDate = leadReportingDate(l);
        if (!reportDate || !period) return;
        if (reportDate < period.start || reportDate >= period.endExclusive) return;
        row.leads += 1;
        if (l.status === "enrolled") row.enrolled += 1;
        row.revenue += Number(l.total_fees_paid_at_enrollment) || 0;
      });
      rows.push(row);
    });
    // Also include leads explicitly tagged with a campaign_name that has no spend entry
    const tagged = new Map<string, Row>();
    filteredLeads.forEach((l: any) => {
      if (!l.campaign_name) return;
      if (rows.some((r) => r.campaign === l.campaign_name)) return;
      const r = tagged.get(l.campaign_name) || { campaign: l.campaign_name, leads: 0, enrolled: 0, revenue: 0, spend: 0 };
      r.leads += 1;
      if (l.status === "enrolled") r.enrolled += 1;
      r.revenue += Number(l.total_fees_paid_at_enrollment) || 0;
      tagged.set(l.campaign_name, r);
    });
    return [...rows, ...Array.from(tagged.values())].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  }, [filteredLeads, spends]);

  const lostBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.filter((l: any) => l.status === "lost" || l.lost_at).forEach((l: any) => {
      const k = l.lost_reason || "Unspecified";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [filteredLeads]);

  const deleteSpend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_spend").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Spend entry removed" }); refetchSpends(); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const kpis = [
    { label: "Total Leads", value: funnel.total, icon: Users, tone: "text-primary" },
    { label: "Enrolled (in period)", value: enrolledInPeriodAnyOrigin, icon: Target, tone: "text-accent-foreground", hint: `Any origin · ${enrolledInPeriodAndCreatedInPeriod} also created in-period` },
    { label: "Revenue (Attribution)", value: fmtMYR(revenue), icon: DollarSign, tone: "text-[hsl(var(--role-teacher))]" },
    {
      label: "Marketing Spend",
      value: fmtMYR(totalSpend),
      icon: TrendingUp,
      tone: "text-[hsl(var(--role-franchisee))]",
      hint: hasProratedSpend
        ? "Spend is prorated because the selected report date range only overlaps part of the saved spend period."
        : "Full saved spend period is within the selected report range.",
      badge: hasProratedSpend ? "Prorated" : undefined,
    },
    { label: "CPL", value: fmtMYR(cpl), icon: DollarSign, tone: "text-muted-foreground", hint: "Spend ÷ Total Leads" },
    { label: "Cost per Enrollment", value: fmtMYR(cpe), icon: DollarSign, tone: "text-muted-foreground", hint: "Spend ÷ Enrolled (in period)" },
    { label: "ROAS", value: `${roas.toFixed(2)}x`, icon: TrendingUp, tone: "text-primary", hint: "Revenue ÷ Spend" },
    { label: "ROI %", value: totalSpend > 0 ? `${roi.toFixed(1)}%` : "—", icon: TrendingUp, tone: roi >= 0 ? "text-[hsl(var(--role-teacher))]" : "text-destructive", hint: "(Revenue − Spend) ÷ Spend" },
    { label: "Avg Lead → Enrollment", value: avgLag !== null ? `${avgLag} days` : "—", icon: Clock, tone: "text-muted-foreground", hint: "Average time from lead received (or created, if no received date) to enrolled" },
  ] as const;

  const sourceFilterOptions = viewMode === "grouped" ? CHANNEL_GROUPS : LEAD_SOURCES;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-[160px]" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-[160px]" />
            </div>
            <div>
              <Label className="text-xs">View</Label>
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grouped">Grouped (Meta / Google …)</SelectItem>
                  <SelectItem value="channel">Per channel (FB, IG …)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sourceFilterOptions.map((s: any) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Quick range:</span>
            {[
              { k: "this_month", l: "This month" },
              { k: "last_month", l: "Last month" },
              { k: "7d", l: "Last 7 days" },
              { k: "30d", l: "Last 30 days" },
              { k: "90d", l: "Last 90 days" },
              { k: "ytd", l: "YTD" },
            ].map((c) => (
              <Button key={c.k} variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyQuickRange(c.k)}>{c.l}</Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Leads are reported by <strong>Lead Received Date</strong>. Older leads without this field use Created Date as fallback.
              {hasProratedSpend && " Spend rows whose saved period only partly overlaps this range are prorated by day."}
            </span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => download(`admissions-source-${fromDate}-${toDate}.csv`, toCSV((viewMode === "grouped" ? byGroup.map((g) => ({ group: g.label, enquiries: g.enquiries, leads: g.leads, enrolled: g.enrolled, spend: g.spend.toFixed(2), revenue: g.revenue.toFixed(2) })) : bySource) as any))}>
              <Download className="h-3.5 w-3.5 mr-1" />Export Source CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const rows = (filteredLeads as any[]).map((l) => {
                const rd = leadReportingDate(l);
                const enrolled = l.enrolled_at ? new Date(l.enrolled_at) : null;
                const lag = rd && enrolled ? differenceInCalendarDays(enrolled, rd) : "";
                return {
                  child_name: l.child_name || "",
                  parent_name: l.parent_name || "",
                  source: sourceLabel(l.source),
                  status: l.status,
                  created_at: l.created_at ? format(new Date(l.created_at), "yyyy-MM-dd") : "",
                  lead_received_date: l.lead_received_date || "",
                  lead_reporting_date: rd ? format(rd, "yyyy-MM-dd") : "",
                  lead_origin_month: rd ? format(startOfMonth(rd), "yyyy-MM") : "",
                  enrolled_at: l.enrolled_at ? format(new Date(l.enrolled_at), "yyyy-MM-dd") : "",
                  lag_days: lag,
                  fees_paid: l.total_fees_paid_at_enrollment ?? "",
                  campaign_name: l.campaign_name || "",
                };
              });
              download(`admissions-leads-${fromDate}-${toDate}.csv`, toCSV(rows));
            }}>
              <Download className="h-3.5 w-3.5 mr-1" />Export Leads CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const rows = (spends as any[]).map((s) => {
                const p = prorationOfSpend(s);
                const period = spendPeriodOf(s);
                return {
                  report_period_start: fromDate,
                  report_period_end: toDate,
                  spend_month: s.spend_month || "",
                  spend_start_date: s.spend_start_date || (period ? format(period.start, "yyyy-MM-dd") : ""),
                  spend_end_date: s.spend_end_date || (period ? format(period.endInclusiveLabel, "yyyy-MM-dd") : ""),
                  branch: branches.find((b) => b.id === s.branch_id)?.name || "",
                  sources: (Array.isArray(s.sources) && s.sources.length ? s.sources : [s.source]).map(sourceLabel).join(" + "),
                  campaign_name: s.campaign_name || "",
                  channel: s.channel || "",
                  amount: Number(s.amount || 0).toFixed(2),
                  prorated_spend: (Number(s.amount || 0) * p.ratio).toFixed(2),
                  proration_ratio: p.ratio.toFixed(4),
                  is_prorated: p.prorated ? "yes" : "no",
                  results: s.results ?? "",
                };
              });
              download(`marketing-spend-${fromDate}-${toDate}.csv`, toCSV(rows));
            }}>
              <Download className="h-3.5 w-3.5 mr-1" />Export Spend CSV
            </Button>
            <EnquiriesDialog
              open={enquiriesDialogOpen}
              onOpenChange={setEnquiriesDialogOpen}
              branches={branches}
              activeBranchIds={activeBranchIds}
              entries={enquiries as any[]}
              onSaved={() => refetchEnquiries()}
            />
            <SpendDialog
              open={spendDialogOpen}
              onOpenChange={setSpendDialogOpen}
              branches={branches}
              activeBranchIds={activeBranchIds}
              onSaved={() => refetchSpends()}
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {k.label}
                  {(k as any).hint && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help opacity-60" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">{(k as any).hint}</TooltipContent>
                    </Tooltip>
                  )}
                </p>
                <k.icon className={cn("h-4 w-4", k.tone)} />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-lg font-semibold">{k.value}</p>
                {(k as any).badge && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
                    {(k as any).badge}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leads Received vs Enrollment (monthly summary) */}
      <LeadsVsEnrollment activeBranchIds={activeBranchIds} />

      {/* Cohort Analysis (Month vs Month) */}
      <CohortAnalysisMoM activeBranchIds={activeBranchIds} />

      {/* Month-over-Month Analysis */}
      <MoMAnalysis
        leads={leads as any[]}
        enquiries={enquiries as any[]}
        spends={spends as any[]}
        periodStart={periodStart}
        periodEnd={periodEnd}
        viewMode={viewMode}
        helpers={{ leadReportingDate, spendPeriodOf }}
        activeBranchIds={activeBranchIds}
      />

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Funnel Overview</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Funnel reflects leads <strong>created</strong> in this period. The Enrolled KPI above counts leads <strong>enrolled</strong> in this period (may include leads created earlier — see Cohort Analysis).
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: "Leads", count: funnel.total },
            { label: "Contacted", count: funnel.contacted },
            { label: "Tours", count: funnel.tours },
            { label: "Trials", count: funnel.trials },
            { label: "Enrolled", count: funnel.enrolled },
          ].map((s) => {
            const width = funnel.total > 0 ? (s.count / funnel.total) * 100 : 0;
            return (
              <div key={s.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">{s.count} · {pct(s.count, funnel.total)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Source Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Source Performance & ROI</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            {viewMode === "grouped"
              ? "Grouped by ad network (Meta = Facebook + Instagram). Click a row to drill into per-channel breakdown."
              : "Per-channel view. Toggle to Grouped to roll up Facebook + Instagram into Meta Ads."}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{viewMode === "grouped" ? "Channel group" : "Source"}</TableHead>
                <TableHead className="text-right">Enquiries</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center gap-1">Enrolled <Info className="h-3 w-3 opacity-60" /></TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">Counts leads created in this period whose status is Enrolled.</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">Conv %</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">CPE</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">ROI %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(viewMode === "grouped" ? byGroup.length : bySource.length) === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6 text-sm">No data in this period.</TableCell></TableRow>
              ) : viewMode === "channel" ? (
                bySource.map((r) => {
                  const r_roas = safeDiv(r.revenue, r.spend);
                  const r_roi = r.spend > 0 ? ((r.revenue - r.spend) / r.spend) * 100 : 0;
                  return (
                    <TableRow key={r.source}>
                      <TableCell className="font-medium">{sourceLabel(r.source)}</TableCell>
                      <TableCell className="text-right">{r.enquiries ? Math.round(r.enquiries) : "—"}</TableCell>
                      <TableCell className="text-right">{r.leads}</TableCell>
                      <TableCell className="text-right">{r.enrolled}</TableCell>
                      <TableCell className="text-right">{pct(r.enrolled, r.leads)}</TableCell>
                      <TableCell className="text-right">{fmtMYR(r.spend)}</TableCell>
                      <TableCell className="text-right">{fmtMYR(r.revenue)}</TableCell>
                      <TableCell className="text-right">{r.leads > 0 ? fmtMYR(r.spend / r.leads) : "—"}</TableCell>
                      <TableCell className="text-right">{r.enrolled > 0 ? fmtMYR(r.spend / r.enrolled) : "—"}</TableCell>
                      <TableCell className="text-right">{r.spend > 0 ? `${r_roas.toFixed(2)}x` : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium", r.spend > 0 && r_roi >= 0 ? "text-[hsl(var(--role-teacher))]" : r.spend > 0 ? "text-destructive" : "")}>
                        {r.spend > 0 ? `${r_roi.toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                byGroup.flatMap((g) => {
                  const g_roas = safeDiv(g.revenue, g.spend);
                  const g_roi = g.spend > 0 ? ((g.revenue - g.spend) / g.spend) * 100 : 0;
                  const expandable = g.children.length > 1;
                  const isExpanded = expandedGroups.has(g.group);
                  const rows: any[] = [
                    <TableRow
                      key={g.group}
                      className={cn(expandable && "cursor-pointer hover:bg-muted/40")}
                      onClick={() => {
                        if (!expandable) return;
                        setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          next.has(g.group) ? next.delete(g.group) : next.add(g.group);
                          return next;
                        });
                      }}
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {expandable ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
                          {g.label}
                          {expandable && <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{g.children.length}</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{g.enquiries ? Math.round(g.enquiries) : "—"}</TableCell>
                      <TableCell className="text-right">{g.leads}</TableCell>
                      <TableCell className="text-right">{g.enrolled}</TableCell>
                      <TableCell className="text-right">{pct(g.enrolled, g.leads)}</TableCell>
                      <TableCell className="text-right">{fmtMYR(g.spend)}</TableCell>
                      <TableCell className="text-right">{fmtMYR(g.revenue)}</TableCell>
                      <TableCell className="text-right">{g.leads > 0 ? fmtMYR(g.spend / g.leads) : "—"}</TableCell>
                      <TableCell className="text-right">{g.enrolled > 0 ? fmtMYR(g.spend / g.enrolled) : "—"}</TableCell>
                      <TableCell className="text-right">{g.spend > 0 ? `${g_roas.toFixed(2)}x` : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium", g.spend > 0 && g_roi >= 0 ? "text-[hsl(var(--role-teacher))]" : g.spend > 0 ? "text-destructive" : "")}>
                        {g.spend > 0 ? `${g_roi.toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>,
                  ];
                  if (expandable && isExpanded) {
                    g.children.forEach((c) => {
                      const c_roas = safeDiv(c.revenue, c.spend);
                      const c_roi = c.spend > 0 ? ((c.revenue - c.spend) / c.spend) * 100 : 0;
                      rows.push(
                        <TableRow key={`${g.group}-${c.source}`} className="bg-muted/20">
                          <TableCell className="pl-9 text-xs text-muted-foreground">↳ {sourceLabel(c.source)}</TableCell>
                          <TableCell className="text-right text-xs">{c.enquiries ? Math.round(c.enquiries) : "—"}</TableCell>
                          <TableCell className="text-right text-xs">{c.leads}</TableCell>
                          <TableCell className="text-right text-xs">{c.enrolled}</TableCell>
                          <TableCell className="text-right text-xs">{pct(c.enrolled, c.leads)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMYR(c.spend)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtMYR(c.revenue)}</TableCell>
                          <TableCell className="text-right text-xs">{c.leads > 0 ? fmtMYR(c.spend / c.leads) : "—"}</TableCell>
                          <TableCell className="text-right text-xs">{c.enrolled > 0 ? fmtMYR(c.spend / c.enrolled) : "—"}</TableCell>
                          <TableCell className="text-right text-xs">{c.spend > 0 ? `${c_roas.toFixed(2)}x` : "—"}</TableCell>
                          <TableCell className={cn("text-right text-xs font-medium", c.spend > 0 && c_roi >= 0 ? "text-[hsl(var(--role-teacher))]" : c.spend > 0 ? "text-destructive" : "")}>
                            {c.spend > 0 ? `${c_roi.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  }
                  return rows;
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Enrolled Cohort Analysis */}
      {enrolledCohort.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Enrolled Cohort Analysis</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Of the {enrolledInPeriodAnyOrigin} enrolment(s) in this period, see which month the lead originally came in.
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={cohortTab === "origin" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCohortTab("origin")}>By origin month</Button>
              <Button size="sm" variant={cohortTab === "lag" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCohortTab("lag")}>Lag distribution</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {cohortTab === "origin" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead origin month</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">% of period</TableHead>
                    <TableHead className="text-right">Avg lag (days)</TableHead>
                    <TableHead>Top source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cohortByOriginMonth.map((r) => (
                    <TableRow key={r.month}>
                      <TableCell className="font-medium">{format(parseISO(`${r.month}-01`), "MMM yyyy")}</TableCell>
                      <TableCell className="text-right">{r.enrolled}</TableCell>
                      <TableCell className="text-right">{r.pct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{r.avgLag}</TableCell>
                      <TableCell className="text-xs">{sourceLabel(r.topSource)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4 space-y-2">
                {(() => {
                  const maxCount = Math.max(1, ...lagDistribution.map((b) => b.count));
                  return lagDistribution.map((b) => (
                    <div key={b.label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{b.label}</span>
                        <span className="text-muted-foreground">{b.count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(b.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaign Performance */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign Performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROI %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCampaign.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">No campaigns tracked.</TableCell></TableRow>
              ) : byCampaign.map((r) => {
                const r_roi = r.spend > 0 ? ((r.revenue - r.spend) / r.spend) * 100 : 0;
                return (
                  <TableRow key={r.campaign}>
                    <TableCell className="font-medium">{r.campaign}</TableCell>
                    <TableCell className="text-right">{r.leads}</TableCell>
                    <TableCell className="text-right">{r.enrolled}</TableCell>
                    <TableCell className="text-right">{fmtMYR(r.spend)}</TableCell>
                    <TableCell className="text-right">{fmtMYR(r.revenue)}</TableCell>
                    <TableCell className={cn("text-right font-medium", r.spend > 0 && r_roi >= 0 ? "text-[hsl(var(--role-teacher))]" : r.spend > 0 ? "text-destructive" : "")}>
                      {r.spend > 0 ? `${r_roi.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Enrolled Leads — Fee Attribution Editor */}
      <EnrolledLeadsFeeEditor
        leads={filteredLeads.filter((l: any) => l.status === "enrolled")}
        onSaved={() => qc.invalidateQueries({ queryKey: ["report-leads"] })}
      />

      {/* Lost Reasons */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Lost Lead Reasons</CardTitle></CardHeader>
        <CardContent>
          {lostBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lost leads in this period.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lostBreakdown.map((r) => (
                <Badge key={r.reason} variant="outline" className="text-xs">
                  {r.reason} · {r.count}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Marketing Spend Ledger */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Marketing Spend Entries</CardTitle>
          <Badge variant="secondary" className="text-xs">{spends.length} entries</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="inline-flex items-center gap-1">Saved Period
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 opacity-60 cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">The exact date range this spend covers, as entered when the row was created.</TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">Effective Spend
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 opacity-60 cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">Amount actually counted in the KPIs for the selected report range = Amount × (overlap days ÷ saved period days).</TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">Results
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3 w-3 opacity-60 cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">Campaign result count reported by the ad platform (e.g. Meta Ads Results, messaging conversations). Compare to Leads / Enquiries / Enrolments to gauge lead quality.</TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spends.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6 text-sm">No spend entries. Add one to start tracking ROI.</TableCell></TableRow>
              ) : spends.map((s: any) => {
                const p = prorationOfSpend(s);
                const period = spendPeriodOf(s);
                const label = period
                  ? (s.spend_start_date && s.spend_end_date
                      ? `${format(period.start, "d MMM yyyy")} – ${format(period.endInclusiveLabel, "d MMM yyyy")}`
                      : `${format(parseISO(s.spend_month), "MMM yyyy")} (full month)`)
                  : "—";
                const effective = Number(s.amount || 0) * p.ratio;
                return (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>{label}</span>
                      {p.prorated && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-700 dark:text-amber-300 cursor-help">Prorated</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[240px] text-xs">
                            Selected report range only overlaps part of this saved spend period. Effective spend counted: {fmtMYR(effective)} ({(p.ratio * 100).toFixed(1)}% of {fmtMYR(Number(s.amount || 0))}).
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{branches.find(b => b.id === s.branch_id)?.name || "—"}</TableCell>
                  <TableCell className="text-xs">{
                    Array.isArray(s.sources) && s.sources.length > 0
                      ? s.sources.map(sourceLabel).join(" + ")
                      : sourceLabel(s.source)
                  }</TableCell>
                  <TableCell className="text-xs">{s.campaign_name || "—"}</TableCell>
                  <TableCell className="capitalize text-xs">{s.channel || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMYR(Number(s.amount))}</TableCell>
                  <TableCell className="text-right text-xs">
                    <span className={cn(p.prorated && "text-amber-700 dark:text-amber-300 font-medium")}>{fmtMYR(effective)}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs">{s.results != null && s.results !== "" ? Number(s.results).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteSpend.mutate(s.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

function SpendDialog({
  open, onOpenChange, branches, activeBranchIds, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  branches: { id: string; name: string }[];
  activeBranchIds: string[];
  onSaved: () => void;
}) {
  const today = new Date();
  const [form, setForm] = useState({
    branch_id: activeBranchIds[0] || "",
    spend_start_date: format(startOfMonth(today), "yyyy-MM-dd"),
    spend_end_date: format(endOfMonth(today), "yyyy-MM-dd"),
    sources: [] as string[],
    campaign_name: "",
    channel: "paid",
    amount: "",
    results: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.branch_id || !form.spend_start_date || !form.spend_end_date || !form.amount || form.sources.length === 0) {
      toast({ title: "Missing fields", description: "Branch, period dates, at least one source, and amount are required.", variant: "destructive" });
      return;
    }
    if (form.spend_end_date < form.spend_start_date) {
      toast({ title: "Invalid period", description: "End date must be on or after start date.", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Derive spend_month bucket from period start for back-compat with legacy queries
    const monthBucket = `${form.spend_start_date.slice(0, 7)}-01`;
    const payload: any = {
      branch_id: form.branch_id,
      spend_month: monthBucket,
      spend_start_date: form.spend_start_date,
      spend_end_date: form.spend_end_date,
      source: form.sources.length === 1 ? form.sources[0] : "multi",
      sources: form.sources,
      campaign_name: form.campaign_name || null,
      channel: form.channel || null,
      amount: Number(form.amount),
      results: form.results === "" ? null : Number(form.results),
      notes: form.notes || null,
    };
    const { error } = await supabase.from("marketing_spend").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Spend entry added" });
    setForm({ ...form, sources: [], campaign_name: "", amount: "", results: "", notes: "" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Add Marketing Spend</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Marketing Spend</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Branch *</Label>
              <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.filter(b => activeBranchIds.includes(b.id)).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Period From *</Label>
                <Input type="date" value={form.spend_start_date} onChange={(e) => setForm({ ...form, spend_start_date: e.target.value })} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Period To *</Label>
                <Input type="date" value={form.spend_end_date} onChange={(e) => setForm({ ...form, spend_end_date: e.target.value })} className="h-9" />
              </div>
              <p className="col-span-2 text-[10px] text-muted-foreground -mt-1">
                Actual spend period (e.g. 7 Jun – 7 Jul). Reporting prorates by overlap with the selected report range.
              </p>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Sources * <span className="text-muted-foreground font-normal">(pick one or more — e.g. Facebook + Instagram for Meta. Amount is split evenly across sources for ROI.)</span></Label>
              <div className="flex gap-2 mt-1 mb-1">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setForm({ ...form, sources: ["facebook", "instagram"] })}>
                  Meta Ads (FB + IG)
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setForm({ ...form, sources: [] })}>
                  Clear
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1 p-2 border rounded-md bg-background">
                {LEAD_SOURCES.map((s) => {
                  const checked = form.sources.includes(s.value);
                  return (
                    <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForm({
                            ...form,
                            sources: v
                              ? [...form.sources, s.value]
                              : form.sources.filter((x) => x !== s.value),
                          });
                        }}
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Campaign Name</Label>
              <Input value={form.campaign_name} onChange={(e) => setForm({ ...form, campaign_name: e.target.value })} placeholder="e.g. June Open Day" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Amount (RM) *</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Results
                <span className="text-muted-foreground font-normal"> (Meta Ads results / messaging conversations)</span>
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={form.results}
                onChange={(e) => setForm({ ...form, results: e.target.value })}
                placeholder="e.g. 49"
                className="h-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-9" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrolledLeadsFeeEditor({ leads, onSaved }: { leads: any[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [fees, setFees] = useState("");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState("");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  const openEditor = (l: any) => {
    setEditing(l);
    setFees(l.total_fees_paid_at_enrollment != null ? String(l.total_fees_paid_at_enrollment) : "");
    setMethod(l.enrollment_payment_method || "");
    setDate(l.enrollment_payment_date ? String(l.enrollment_payment_date).slice(0, 10) : "");
    setRef(l.enrollment_payment_reference || "");
  };

  const save = async () => {
    if (!editing) return;
    const n = Number(fees);
    if (fees.trim() === "" || !Number.isFinite(n) || n < 0) {
      toast({ title: "Invalid amount", description: "Enter a fee amount (0 or greater).", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leads").update({
      total_fees_paid_at_enrollment: n,
      enrollment_payment_method: method || null,
      enrollment_payment_date: date || null,
      enrollment_payment_reference: ref || null,
    } as any).eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fee attribution updated" });
    setEditing(null);
    onSaved();
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Enrolled Leads — Fee Attribution</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit fees recorded at enrollment to correct Marketing ROI. Does not touch finance invoices.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">{leads.length} enrolled</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead>Enrolled</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Fees (RM)</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-sm">No enrolled leads in this period.</TableCell></TableRow>
            ) : leads.map((l: any) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.child_name || "—"}</TableCell>
                <TableCell className="text-xs">{l.enrolled_at ? format(new Date(l.enrolled_at), "dd MMM yyyy") : "—"}</TableCell>
                <TableCell className="text-xs">{sourceLabel(l.source)}</TableCell>
                <TableCell className={cn("text-right font-medium", (!l.total_fees_paid_at_enrollment || Number(l.total_fees_paid_at_enrollment) <= 0) && "text-destructive")}>
                  {l.total_fees_paid_at_enrollment != null ? fmtMYR(Number(l.total_fees_paid_at_enrollment)) : "— missing"}
                </TableCell>
                <TableCell className="text-xs capitalize">{l.enrollment_payment_method || "—"}</TableCell>
                <TableCell className="text-xs">{l.enrollment_payment_reference || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => openEditor(l)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Enrollment Fees — {editing?.child_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Total fees paid at enrollment (RM) *</Label>
              <Input type="number" step="0.01" min="0" value={fees} onChange={(e) => setFees(e.target.value)} className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment method</Label>
                <Select value={method || "__none__"} onValueChange={(v) => setMethod(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="fpx">FPX / Online Banking</SelectItem>
                    <SelectItem value="card">Credit / Debit Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Payment date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Receipt / reference no.</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EnquiriesDialog({
  open, onOpenChange, branches, activeBranchIds, entries, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  branches: { id: string; name: string }[];
  activeBranchIds: string[];
  entries: any[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    branch_id: activeBranchIds[0] || "",
    period_month: format(startOfMonth(new Date()), "yyyy-MM"),
    source: LEAD_SOURCES[0]?.value || "facebook",
    count: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Keep branch_id in sync once branches load (initial render often has empty list)
  useEffect(() => {
    if (!form.branch_id && activeBranchIds[0]) {
      setForm((f) => ({ ...f, branch_id: activeBranchIds[0] }));
    }
  }, [activeBranchIds, form.branch_id]);

  const save = async () => {
    const n = parseInt(form.count, 10);
    if (!form.branch_id || !form.period_month || !form.source || !Number.isFinite(n) || n < 0) {
      toast({ title: "Missing fields", description: "Branch, month, source and a non-negative count are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      branch_id: form.branch_id,
      period_month: `${form.period_month}-01`,
      source: form.source,
      count: n,
      notes: form.notes || null,
    };
    const { error } = await (supabase as any)
      .from("source_enquiries")
      .upsert(payload, { onConflict: "branch_id,period_month,source" });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Enquiry count saved" });
    setForm({ ...form, count: "", notes: "" });
    onSaved();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("source_enquiries").delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Entry removed" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Users className="h-3.5 w-3.5 mr-1" />Log Enquiries</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log Enquiries by Source</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Total enquiries received per source per month (e.g. 20 messages on Facebook → maybe only 2 became leads).
            Used as the top of your marketing funnel.
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end border rounded-md p-3 bg-muted/30">
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Branch *</Label>
            <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {branches.filter(b => activeBranchIds.includes(b.id)).map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Month *</Label>
            <Input type="month" value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Source *</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meta_ads">Meta Ads (combined)</SelectItem>
                {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Enquiries *</Label>
            <Input type="number" min="0" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} className="h-9" />
          </div>
          <Button onClick={save} disabled={saving} className="h-9">{saving ? "Saving…" : "Save"}</Button>
        </div>
        <div className="max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">No enquiry entries in this range yet.</TableCell></TableRow>
              ) : entries.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{format(parseISO(e.period_month), "MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{branches.find(b => b.id === e.branch_id)?.name || "—"}</TableCell>
                  <TableCell className="text-xs">{sourceLabel(e.source)}</TableCell>
                  <TableCell className="text-right font-medium">{e.count}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(e.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}