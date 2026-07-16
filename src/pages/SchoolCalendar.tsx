import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useCalendarFeed, expandFeedByDay, EVENT_KIND_META, type CalendarFeedRow, type CalendarEventKind } from "@/hooks/use-calendar-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, CalendarDays, ExternalLink, Info } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

const KIND_ORDER: CalendarEventKind[] = [
  "public_holiday", "term_break", "replacement_holiday",
  "staff_training", "school_activity", "ptm_day", "assessment_window",
];

export default function SchoolCalendar() {
  const { selectedBranchId } = useGlobalBranch();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Pad to full grid weeks so range queries cover overflow days too
  const gridStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  const rangeStart = format(gridStart, "yyyy-MM-dd");
  const rangeEnd = format(gridEnd, "yyyy-MM-dd");

  const { data: feed = [], isLoading } = useCalendarFeed(selectedBranchId, rangeStart, rangeEnd);
  const byDay = useMemo(() => expandFeedByDay(feed as CalendarFeedRow[]), [feed]);

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of feed) {
      // Only count rows that touch the visible month
      counts[r.event_kind] = (counts[r.event_kind] ?? 0) + 1;
    }
    return counts;
  }, [feed]);

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedRows = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="calendar" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
              School Calendar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Day-to-day operational view of every closure, activity and staff event affecting your school.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/yearly-planner">
                <ExternalLink className="h-4 w-4 mr-1" /> Annual Planner
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/hr-calendar">
                <ExternalLink className="h-4 w-4 mr-1" /> HR Calendar
              </Link>
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-start gap-2 text-sm">
          <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="text-muted-foreground">
            This calendar reads from the <strong className="text-foreground">Annual Planner</strong> (school holidays, term breaks, activities)
            and the <strong className="text-foreground">HR Calendar</strong> (staff training, leave). Add new events at the source; they appear here automatically and the timetable + lesson planner adjust accordingly.
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentMonth(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-xs font-medium text-muted-foreground mb-1">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                <div key={d} className="px-2 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const k = format(d, "yyyy-MM-dd");
                const rows = byDay.get(k) ?? [];
                const inMonth = isSameMonth(d, currentMonth);
                const isToday = isSameDay(d, new Date());
                const closed = rows.some((r) => r.school_closed);
                return (
                  <button
                    key={k}
                    onClick={() => setSelectedDay(d)}
                    className={cn(
                      "min-h-[88px] rounded-md border p-1.5 text-left transition hover:border-primary hover:bg-accent/40",
                      !inMonth && "opacity-40",
                      isToday && "ring-2 ring-primary",
                      closed && "bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs font-semibold", isToday && "text-primary")}>{format(d, "d")}</span>
                      {rows.length > 0 && (
                        <div className="flex gap-0.5">
                          {rows.slice(0, 3).map((r, i) => (
                            <span key={i} className={cn("h-1.5 w-1.5 rounded-full", (EVENT_KIND_META[r.event_kind] ?? EVENT_KIND_META.normal).dot)} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {rows.slice(0, 2).map((r, i) => (
                        <div
                          key={i}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[10px] border",
                            (EVENT_KIND_META[r.event_kind] ?? EVENT_KIND_META.normal).badge,
                          )}
                          title={r.name}
                        >
                          {r.name}
                        </div>
                      ))}
                      {rows.length > 2 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{rows.length - 2} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Legend & this month at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {KIND_ORDER.map((k) => (
                <Badge key={k} variant="outline" className={cn("gap-1.5", EVENT_KIND_META[k].badge)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", EVENT_KIND_META[k].dot)} />
                  {EVENT_KIND_META[k].label}
                  <span className="opacity-60">· {monthCounts[k] ?? 0}</span>
                </Badge>
              ))}
            </div>
            {isLoading && <p className="text-xs text-muted-foreground mt-3">Loading calendar…</p>}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedDay ? format(selectedDay, "EEEE, d MMMM yyyy") : ""}</SheetTitle>
            <SheetDescription>
              {selectedRows.length === 0
                ? "Normal school day. No closures, activities or staff events."
                : `${selectedRows.length} event${selectedRows.length === 1 ? "" : "s"} on this day.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedRows.map((r, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{r.name}</div>
                  <Badge variant="outline" className={cn((EVENT_KIND_META[r.event_kind] ?? EVENT_KIND_META.normal).badge)}>
                    {(EVENT_KIND_META[r.event_kind] ?? EVENT_KIND_META.normal).label}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Source: {r.source_table === "school_holidays" ? "Annual Planner" : "HR Calendar"}
                  {r.school_closed && <span className="ml-2 text-destructive font-medium">School closed</span>}
                </div>
              </div>
            ))}
            {selectedRows.length === 0 && (
              <div className="text-sm text-muted-foreground">
                To add an event for this day, open the{" "}
                <Link to="/yearly-planner" className="text-primary underline">Annual Planner</Link> (school events) or the{" "}
                <Link to="/hr-calendar" className="text-primary underline">HR Calendar</Link> (staff events).
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}