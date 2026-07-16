import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parse } from "date-fns";
import { Loader2 } from "lucide-react";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SUBJECT_COLORS: Record<string, string> = {
  Maths: "#dbeafe",
  Science: "#dcfce7",
  STEAM: "#f3e8ff",
  English: "#fef3c7",
  Phonics: "#ffedd5",
  "Bahasa Melayu": "#fee2e2",
  Mandarin: "#ffe4e6",
  "Islamic Studies": "#d1fae5",
  "Moral Education": "#cffafe",
  Assembly: "#e5e7eb",
  Break: "#f3f4f6",
  "Event / Activity": "#fef3c7",
};

function fmtTime(t: string) {
  // "08:30:00" -> "8:30 AM"
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
}

export default function TimetablePrint() {
  const { classId } = useParams<{ classId: string }>();
  const [params] = useSearchParams();
  const mode = (params.get("mode") as "week" | "month") || "week";
  const monthParam = params.get("month"); // YYYY-MM

  const { data: classObj } = useQuery({
    queryKey: ["print-class", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group, program_type, branch_id, branches(name, address, phone)")
        .eq("id", classId)
        .single();
      return data as any;
    },
    enabled: !!classId,
  });

  const { data: templateSlots = [] } = useQuery({
    queryKey: ["print-template", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time");
      return (data ?? []) as any[];
    },
    enabled: !!classId && mode === "week",
  });

  const monthRange = useMemo(() => {
    const base = monthParam ? parse(monthParam + "-01", "yyyy-MM-dd", new Date()) : new Date();
    return {
      start: format(startOfMonth(base), "yyyy-MM-dd"),
      end: format(endOfMonth(base), "yyyy-MM-dd"),
      label: format(base, "MMMM yyyy"),
    };
  }, [monthParam]);

  const { data: dailySlots = [] } = useQuery({
    queryKey: ["print-daily", classId, monthRange.start],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_timetable_slots")
        .select("*")
        .eq("class_id", classId)
        .gte("slot_date", monthRange.start)
        .lte("slot_date", monthRange.end)
        .order("slot_date")
        .order("start_time");
      return (data ?? []) as any[];
    },
    enabled: !!classId && mode === "month",
  });

  // Build time rows (unique start/end pairs)
  const timeRows = useMemo(() => {
    const source = mode === "week" ? templateSlots : dailySlots;
    const keys = new Set<string>();
    const out: { start: string; end: string }[] = [];
    for (const s of source) {
      const k = `${s.start_time}|${s.end_time}`;
      if (!keys.has(k)) {
        keys.add(k);
        out.push({ start: s.start_time, end: s.end_time });
      }
    }
    out.sort((a, b) => a.start.localeCompare(b.start));
    return out;
  }, [mode, templateSlots, dailySlots]);

  const isLoading = !classObj || (mode === "week" ? false : false);

  useEffect(() => {
    document.title = classObj
      ? `Schedule – ${classObj.class_name} (${mode === "week" ? "Weekly" : monthRange.label})`
      : "Class Schedule";
  }, [classObj, mode, monthRange.label]);

  const getWeekSlot = (dow: number, start: string) =>
    templateSlots.find((s) => s.day_of_week === dow && s.start_time === start);

  // Month mode: render one weekly grid per ISO week present
  const monthWeeks = useMemo(() => {
    if (mode !== "month") return [];
    const days = eachDayOfInterval({
      start: new Date(monthRange.start + "T00:00:00"),
      end: new Date(monthRange.end + "T00:00:00"),
    }).filter((d) => getDay(d) !== 0 && getDay(d) !== 6);
    // group by ISO week-of-year
    const groups: Record<string, Date[]> = {};
    for (const d of days) {
      const key = format(d, "RRRR-II"); // ISO year/week
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return Object.entries(groups).map(([key, dates]) => ({ key, dates }));
  }, [mode, monthRange]);

  const getDaySlot = (dateStr: string, start: string) =>
    dailySlots.find((s) => s.slot_date === dateStr && s.start_time === start);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar (hidden on print) */}
      <div className="print:hidden sticky top-0 z-10 border-b bg-white px-4 py-3 flex items-center justify-between shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => window.close()} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Close
        </Button>
        <div className="text-sm text-muted-foreground">
          {mode === "week" ? "Weekly schedule" : `Month: ${monthRange.label}`}
        </div>
        <Button size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="mx-auto max-w-[1100px] p-6 print:p-0 print:max-w-none">
        <div className="bg-white print:bg-transparent rounded-lg shadow-sm print:shadow-none p-8 print:p-6 print-page">
          {/* Header */}
          <header className="flex items-start justify-between border-b-2 border-gray-800 pb-3 mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500">
                {classObj?.branches?.name}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mt-0.5">
                {classObj?.class_name} — Weekly Schedule
              </h1>
              <div className="text-sm text-gray-600 mt-1">
                {classObj?.age_group ? `Age ${classObj.age_group}` : null}
                {classObj?.program_type
                  ? ` · ${classObj.program_type === "taska" ? "Taska" : "Preschool"}`
                  : null}
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Generated {format(new Date(), "d MMM yyyy")}</div>
              {mode === "month" && <div className="font-medium text-gray-700">{monthRange.label}</div>}
            </div>
          </header>

          {mode === "week" && (
            <WeekGrid
              timeRows={timeRows}
              getSlot={getWeekSlot}
              headerDates={null}
            />
          )}

          {mode === "month" &&
            monthWeeks.map((wk, i) => (
              <div key={wk.key} className={i > 0 ? "mt-6 print:break-before-page" : ""}>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">
                  Week of {format(wk.dates[0], "d MMM")} – {format(wk.dates[wk.dates.length - 1], "d MMM yyyy")}
                </h2>
                <WeekGrid
                  timeRows={timeRows}
                  headerDates={wk.dates}
                  getSlot={(dow, start) => {
                    const date = wk.dates.find((d) => getDay(d) === dow);
                    if (!date) return null;
                    return getDaySlot(format(date, "yyyy-MM-dd"), start) ?? null;
                  }}
                />
              </div>
            ))}

          <footer className="mt-4 pt-3 border-t text-[10px] text-gray-400 flex justify-between">
            <span>{classObj?.branches?.phone ?? ""}</span>
            <span>Subject to change. Please check daily updates for confirmation.</span>
          </footer>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; }
          .print-page { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

function WeekGrid({
  timeRows,
  getSlot,
  headerDates,
}: {
  timeRows: { start: string; end: string }[];
  getSlot: (dow: number, start: string) => any | null | undefined;
  headerDates: Date[] | null;
}) {
  if (timeRows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        No schedule set up for this class yet.
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className="border border-gray-300 bg-gray-100 px-2 py-1.5 text-left w-[90px] font-semibold text-gray-700">
            Time
          </th>
          {DAY_NAMES.map((name, idx) => {
            const date = headerDates?.find((d) => getDay(d) === idx + 1);
            return (
              <th
                key={name}
                className="border border-gray-300 bg-gray-100 px-2 py-1.5 text-center font-semibold text-gray-700"
              >
                {name}
                {date && (
                  <div className="text-[10px] font-normal text-gray-500">
                    {format(date, "d MMM")}
                  </div>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {timeRows.map((row) => (
          <tr key={row.start}>
            <td className="border border-gray-300 bg-gray-50 px-2 py-1.5 text-gray-700 font-medium align-top">
              <div>{fmtTime(row.start)}</div>
              <div className="text-[10px] text-gray-400">to {fmtTime(row.end)}</div>
            </td>
            {[1, 2, 3, 4, 5].map((dow) => {
              const slot = getSlot(dow, row.start);
              const subj = slot?.subject_name;
              const bg = subj ? SUBJECT_COLORS[subj] || "#f9fafb" : "transparent";
              return (
                <td
                  key={dow}
                  className="border border-gray-300 px-2 py-1.5 text-center align-middle"
                  style={{ backgroundColor: bg, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as any}
                >
                  {subj ? (
                    <div className="font-medium text-gray-800 leading-tight">{subj}</div>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                  {slot?.event_name && (
                    <div className="text-[10px] text-gray-600 mt-0.5 italic">{slot.event_name}</div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}