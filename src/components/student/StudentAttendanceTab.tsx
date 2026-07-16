import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, CalendarOff } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay,
  isWeekend, isFuture, startOfDay, isBefore, isAfter,
} from "date-fns";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useSchoolCalendar, holidaySetFrom, activeBreaksIn } from "@/hooks/use-school-calendar";
import { Badge } from "@/components/ui/badge";

const STATUS_COLOR: Record<string, string> = {
  present: "hsl(142 71% 45%)",
  absent: "hsl(0 84% 60%)",
  late: "hsl(38 92% 50%)",
  excused: "hsl(217 91% 60%)",
};

const STATUS_LABEL: Record<string, string> = {
  present: "Present", absent: "Absent", late: "Late", excused: "Excused",
};

export default function StudentAttendanceTab({ studentId, branchId }: { studentId: string; branchId?: string }) {
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const { data: calendar } = useSchoolCalendar(branchId);
  const holidayMap = useMemo(() => holidaySetFrom(calendar?.holidays ?? []), [calendar]);
  const monthBreaks = useMemo(
    () => activeBreaksIn(calendar?.holidays ?? [], startOfMonth(cursor), endOfMonth(cursor)),
    [calendar, cursor],
  );

  // Fetch last 6 months for trend chart
  const trendStart = startOfMonth(subMonths(cursor, 5));
  const trendEnd = endOfMonth(cursor);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student-attendance-range", studentId, format(trendStart, "yyyy-MM"), format(trendEnd, "yyyy-MM")],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("date, status")
        .eq("student_id", studentId)
        .gte("date", format(trendStart, "yyyy-MM-dd"))
        .lte("date", format(trendEnd, "yyyy-MM-dd"));
      return data ?? [];
    },
  });

  // Stats for current cursor month
  const monthRows = useMemo(() => {
    const ms = format(startOfMonth(cursor), "yyyy-MM-dd");
    const me = format(endOfMonth(cursor), "yyyy-MM-dd");
    return rows.filter((r: any) => r.date >= ms && r.date <= me);
  }, [rows, cursor]);

  const stats = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    monthRows.forEach((r: any) => {
      if (c[r.status as keyof typeof c] !== undefined) (c as any)[r.status]++;
      c.total++;
    });
    return c;
  }, [monthRows]);

  // Expected school days for the month: weekdays (Mon-Fri) ∩ not a blocking holiday, capped at today.
  const expectedInfo = useMemo(() => {
    const today = startOfDay(new Date());
    const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
    let expected = 0;
    let holidayCount = 0;
    for (const d of days) {
      if (isAfter(d, today)) continue;
      if (isWeekend(d)) continue;
      const key = format(d, "yyyy-MM-dd");
      if (holidayMap.has(key)) { holidayCount++; continue; }
      expected++;
    }
    return { expected, holidayCount };
  }, [cursor, holidayMap]);

  const rate = expectedInfo.expected > 0
    ? Math.round(((stats.present + stats.late) / expectedInfo.expected) * 100)
    : null;

  // 6-month trend, with expected-school-days denominator per month
  const trendData = useMemo(() => {
    const today = startOfDay(new Date());
    const months: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(cursor, i);
      const ms = format(startOfMonth(m), "yyyy-MM-dd");
      const me = format(endOfMonth(m), "yyyy-MM-dd");
      const inM = rows.filter((r: any) => r.date >= ms && r.date <= me);
      const days = eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) });
      let expected = 0;
      for (const d of days) {
        if (isAfter(d, today)) continue;
        if (isWeekend(d)) continue;
        if (holidayMap.has(format(d, "yyyy-MM-dd"))) continue;
        expected++;
      }
      const present = inM.filter((r: any) => r.status === "present").length;
      const late = inM.filter((r: any) => r.status === "late").length;
      const absent = inM.filter((r: any) => r.status === "absent").length;
      const excused = inM.filter((r: any) => r.status === "excused").length;
      months.push({
        key: format(m, "yyyy-MM"),
        label: format(m, "MMM"),
        present, late, absent, excused,
        expected,
        rate: expected > 0 ? Math.round(((present + late) / expected) * 100) : 0,
      });
    }
    return months;
  }, [rows, cursor, holidayMap]);

  // Calendar grid for current month — now annotates holidays & "no record" days
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
    const today = startOfDay(new Date());
    return days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const rec = monthRows.find((r: any) => isSameDay(new Date(r.date), d));
      const holiday = holidayMap.get(key) ?? null;
      const future = isFuture(d) && !isSameDay(d, today);
      const weekend = isWeekend(d);
      const isSchoolDay = !weekend && !holiday && !future;
      const noRecord = isSchoolDay && !rec;
      return { d, status: rec?.status as string | undefined, future, weekend, holiday, noRecord };
    });
  }, [cursor, monthRows, holidayMap]);

  const isCurrentMonth = isSameDay(startOfMonth(cursor), startOfMonth(new Date()));

  return (
    <div className="space-y-4">
      {/* Month switcher + KPIs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(c => subMonths(c, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base px-2 min-w-[160px] text-center">{format(cursor, "MMMM yyyy")}</CardTitle>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(c => addMonths(c, 1))} disabled={isCurrentMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
              )}
            </div>
            {rate !== null && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attendance Rate</p>
                <p className="text-xl font-bold tabular-nums">{rate}%</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {monthBreaks.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {monthBreaks.map((b) => (
                <Badge
                  key={b.id}
                  variant="outline"
                  className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[11px] font-medium gap-1"
                  title={`${format(new Date(b.event_date), "d MMM")} – ${format(new Date(b.end_date ?? b.event_date), "d MMM yyyy")}`}
                >
                  <CalendarOff className="h-3 w-3" />
                  {b.event_name} · {format(new Date(b.event_date), "d MMM")} – {format(new Date(b.end_date ?? b.event_date), "d MMM")}
                </Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
            {[
              { label: "Expected", value: expectedInfo.expected, color: "text-foreground", hint: "school days" },
              { label: "Present", value: stats.present, color: "text-green-600" },
              { label: "Late", value: stats.late, color: "text-yellow-600" },
              { label: "Absent", value: stats.absent, color: "text-red-600" },
              { label: "Excused", value: stats.excused, color: "text-blue-600" },
              { label: "Holidays", value: expectedInfo.holidayCount, color: "text-purple-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-muted/20 text-center py-3">
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Calendar */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* leading blanks */}
            {Array.from({ length: startOfMonth(cursor).getDay() }).map((_, i) => <div key={`b${i}`} />)}
            {calendarDays.map(({ d, status, future, weekend, holiday, noRecord }) => {
              const bg = status ? STATUS_COLOR[status] : undefined;
              const title = holiday
                ? `${format(d, "d MMM")} — Holiday: ${holiday.event_name}`
                : status
                  ? `${format(d, "d MMM")} — ${STATUS_LABEL[status] ?? status}`
                  : noRecord
                    ? `${format(d, "d MMM")} — School day, no attendance recorded`
                    : format(d, "d MMM");
              return (
                <div
                  key={d.toISOString()}
                  title={title}
                  className={`relative aspect-square rounded-md flex items-center justify-center text-xs font-medium border ${
                    future
                      ? "opacity-30 bg-muted/30 border-transparent"
                      : holiday
                        ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
                        : weekend
                          ? "bg-muted/40 text-muted-foreground border-transparent"
                          : noRecord
                            ? "bg-muted/20 text-muted-foreground border-dashed border-border/60"
                            : "border-border"
                  }`}
                  style={bg ? { background: bg, color: "white", borderColor: bg } : undefined}
                >
                  {d.getDate()}
                  {holiday && <CalendarOff className="absolute top-0.5 right-0.5 h-2.5 w-2.5 opacity-70" />}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-muted-foreground">
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: STATUS_COLOR[k] }} />{v}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm inline-block bg-purple-500/30 border border-purple-500/40" />Public holiday
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm inline-block bg-muted/20 border border-dashed" />School day, no record
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm inline-block bg-muted/40 border" />Weekend
            </span>
            {calendar?.year && (
              <span className="ml-auto text-[10px]">Calendar: {calendar.year.year_name}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 6-month trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">6-Month Trend</CardTitle>
          <p className="text-[11px] text-muted-foreground">Rate = (present + late) ÷ expected school days (weekdays minus public holidays).</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 8, right: 30, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="present" stackId="a" fill={STATUS_COLOR.present} name="Present" />
                  <Bar yAxisId="left" dataKey="late" stackId="a" fill={STATUS_COLOR.late} name="Late" />
                  <Bar yAxisId="left" dataKey="excused" stackId="a" fill={STATUS_COLOR.excused} name="Excused" />
                  <Bar yAxisId="left" dataKey="absent" stackId="a" fill={STATUS_COLOR.absent} name="Absent" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} name="Rate %" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}