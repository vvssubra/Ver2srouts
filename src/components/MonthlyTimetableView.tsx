import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { ChevronLeft, ChevronRight, Copy, Loader2, Pencil, CalendarDays, BookOpen, RotateCcw, Zap, Settings2, Trash2, ChevronDown, Sparkles, MoreHorizontal } from "lucide-react";
import { autoPublishTemplate, fetchHolidayDates } from "@/lib/timetable-auto-publish";

const ENRICHMENT_CUTOFF = "12:30";

const SUBJECT_COLORS: Record<string, string> = {
  Maths: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  Science: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  STEAM: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  English: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  "English - Spelling": "bg-amber-50 border border-dashed border-amber-400 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  "English - Reading": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  Phonics: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  "Bahasa Melayu": "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  "Bahasa Melayu - Ejaan": "bg-red-50 border border-dashed border-red-400 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  "Bahasa Melayu - Bacaan": "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  Mandarin: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  "Islamic Studies": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Moral Education": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
  Assembly: "bg-gray-200 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300",
  Break: "bg-gray-100 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400",
  "Event / Activity": "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const TIME_SLOTS = Array.from({ length: 20 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2);
  const min = (i % 2) * 30;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
});

interface MonthlyTimetableViewProps {
  classId: string;
  branchId: string;
  subjects: any[];
  isReadOnly?: boolean;
  onOpenTemplate?: () => void;
}

export default function MonthlyTimetableView({ classId, branchId, subjects, isReadOnly = false, onOpenTemplate }: MonthlyTimetableViewProps) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeWeek, setActiveWeek] = useState(0);
  const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null);
  const [editDialog, setEditDialog] = useState<{ date: string; startTime: string; slots: any[] } | null>(null);
  const [editSlotSubjects, setEditSlotSubjects] = useState<Record<string, string>>({});
  const [copyDialog, setCopyDialog] = useState(false);
  const [copyTargetMonth, setCopyTargetMonth] = useState("");
  const [clearConfirm, setClearConfirm] = useState<{ type: "week" | "month" | "subject"; subject?: string } | null>(null);
  const [clearSubjectDialog, setClearSubjectDialog] = useState(false);
  const [clearSubjectName, setClearSubjectName] = useState("");
  const autoPublishAttempted = useRef<Set<string>>(new Set());
  const [autoPublishError, setAutoPublishError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const canDelete = role === "super_admin" || role === "admin";

  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");
  const monthLabel = format(currentMonth, "MMMM yyyy");

  // Reset selected mobile day when week changes
  useEffect(() => { setActiveDayIdx(null); }, [activeWeek, classId]);

  const allDays = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const weekdays = allDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6);

  const { data: dailySlots = [], isLoading } = useQuery({
    queryKey: ["daily-timetable", classId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_timetable_slots")
        .select("*")
        .eq("class_id", classId)
        .gte("slot_date", monthStart)
        .lte("slot_date", monthEnd)
        .order("slot_date")
        .order("start_time");
      return data ?? [];
    },
    enabled: !!classId,
    staleTime: 60_000,
  });

  const { data: templateSlots = [] } = useQuery({
    queryKey: ["timetable-slots", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time");
      return data ?? [];
    },
    enabled: !!classId,
    staleTime: 60_000,
  });

  const { data: schoolHolidays = [] } = useQuery({
    queryKey: ["holidays-month", branchId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_holidays")
        .select("event_date, end_date, event_name, event_type, is_public_holiday")
        .or(`and(event_date.lte.${monthEnd},end_date.gte.${monthStart}),and(event_date.gte.${monthStart},event_date.lte.${monthEnd})`);
      // Only school-closed types affect timetable display
      return (data ?? []).filter((h: any) => {
        const et = h.event_type || (h.is_public_holiday ? "holiday" : "event");
        return ["holiday", "reward_holiday", "term_holiday"].includes(et);
      });
    },
    staleTime: 5 * 60_000,
  });

  const { data: branchEvents = [] } = useQuery({
    queryKey: ["branch-events-month", branchId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_events")
        .select("event_date, end_date, event_name, event_type, affects_attendance")
        .eq("branch_id", branchId)
        .eq("affects_attendance", true)
        .or(`and(event_date.lte.${monthEnd},end_date.gte.${monthStart}),and(event_date.gte.${monthStart},event_date.lte.${monthEnd})`);
      return data ?? [];
    },
    enabled: !!branchId,
    staleTime: 5 * 60_000,
  });

  // Helper to expand date ranges
  const expandRange = (eventDate: string, endDate?: string | null): string[] => {
    if (!endDate) return [eventDate];
    const s = new Date(eventDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    if (e < s) return [eventDate];
    return eachDayOfInterval({ start: s, end: e }).map(d => format(d, "yyyy-MM-dd"));
  };

  const allHolidays = [
    ...schoolHolidays.map((h: any) => ({ ...h, source: "holiday" })),
    ...branchEvents.map((e: any) => ({ event_date: e.event_date, end_date: e.end_date, event_name: e.event_name, source: "branch_event" })),
  ];
  const holidayDates = new Set<string>();
  allHolidays.forEach((h: any) => {
    expandRange(h.event_date, h.end_date).forEach(d => holidayDates.add(d));
  });

  const { data: slotLessonPlans = [] } = useQuery({
    queryKey: ["daily-slot-lessons", classId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("slot_lesson_plans")
        .select("daily_slot_id, lesson_date, timetable_slot_id")
        .eq("class_id", classId)
        .gte("lesson_date", monthStart)
        .lte("lesson_date", monthEnd);
      return (data ?? []) as any[];
    },
    enabled: !!classId,
  });

  const { data: directLessonPlans = [] } = useQuery({
    queryKey: ["daily-direct-lessons", classId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_plans")
        .select("id, daily_slot_id, start_date, title, plan_mode")
        .eq("class_id", classId)
        .gte("start_date", monthStart)
        .lte("start_date", monthEnd);
      return (data ?? []) as any[];
    },
    enabled: !!classId,
  });

  // Auto-publish when navigating to an empty month that has a template
  useEffect(() => {
    const monthKey = `${classId}_${monthStart}`;
    if (
      !isLoading &&
      dailySlots.length === 0 &&
      templateSlots.length > 0 &&
      classId &&
      branchId &&
      !autoPublishAttempted.current.has(monthKey)
    ) {
      autoPublishAttempted.current.add(monthKey);
      setAutoPublishError(null);
      setIsGenerating(true);
      autoPublishTemplate({
        classId,
        branchId,
        templateSlots,
        targetMonths: [currentMonth],
      }).then((count) => {
        if (count > 0) {
          queryClient.invalidateQueries({ queryKey: ["daily-timetable", classId, monthStart] });
          toast({
            title: "Schedule ready ✅",
            description: `${count} lessons added for ${monthLabel}.`,
          });
        }
      }).catch((e) => {
        console.error("Auto-publish on navigate failed:", e);
        const msg = e?.message || "Unknown error";
        const isPerm = /permission|rls|policy/i.test(msg);
        setAutoPublishError(
          isPerm
            ? "You don't have permission to generate the timetable. Ask an admin to grant you the Timetable module."
            : `Couldn't generate timetable: ${msg}`
        );
        toast({
          title: "Couldn't auto-generate timetable",
          description: isPerm
            ? "Permission denied. Ask an admin to grant you the Timetable module."
            : msg,
          variant: "destructive",
        });
      }).finally(() => {
        setIsGenerating(false);
      });
    }
  }, [isLoading, dailySlots.length, templateSlots.length, classId, branchId, monthStart]);

  // Reset active week when month changes
  useEffect(() => {
    setActiveWeek(0);
  }, [monthStart]);

  const getSlotsForDateAndTime = (date: string, time: string) =>
    dailySlots.filter((s: any) => s.slot_date === date && s.start_time === time + ":00");

  const hasLessonPlan = (slotId: string, dateStr?: string) => {
    if (slotLessonPlans.some((lp: any) => lp.daily_slot_id === slotId)) return true;
    if (directLessonPlans.some((lp: any) => lp.daily_slot_id === slotId)) return true;
    if (dateStr && directLessonPlans.some((lp: any) => lp.start_date === dateStr)) return true;
    return false;
  };

  // Get unique time slots actually used
  const usedTimes = [...new Set(dailySlots.map((s: any) => s.start_time.slice(0, 5)))].sort();
  const displayTimes = usedTimes.length > 0 ? usedTimes : TIME_SLOTS.slice(0, 10);

  // Split into Kindergarten / Extended Care zones
  const kindergartenTimes = displayTimes.filter(t => t < ENRICHMENT_CUTOFF);
  const extendedCareTimes = displayTimes.filter(t => t >= ENRICHMENT_CUTOFF);

  // Get unique subjects in current month for "delete by subject"
  const uniqueSubjects = [...new Set(dailySlots.map((s: any) => s.subject_name))].sort();

  // Recently used subjects (top 8 by frequency in current month) — quick-pick row in edit dialog
  const recentSubjects = (() => {
    const counts: Record<string, number> = {};
    for (const s of dailySlots) counts[s.subject_name] = (counts[s.subject_name] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  })();

  // Copy month mutation
  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!copyTargetMonth) throw new Error("Select a target month");
      const targetDate = new Date(copyTargetMonth + "-01");
      const targetStart = format(startOfMonth(targetDate), "yyyy-MM-dd");
      const targetEnd = format(endOfMonth(targetDate), "yyyy-MM-dd");
      const targetDays = eachDayOfInterval({ start: startOfMonth(targetDate), end: endOfMonth(targetDate) })
        .filter(d => getDay(d) !== 0 && getDay(d) !== 6);

      const slotsByDow: Record<number, any[]> = {};
      for (const slot of dailySlots) {
        const dow = getDay(new Date(slot.slot_date + "T00:00:00"));
        if (!slotsByDow[dow]) slotsByDow[dow] = [];
        if (!slotsByDow[dow].find((s: any) => s.start_time === slot.start_time && s.subject_name === slot.subject_name)) {
          slotsByDow[dow].push(slot);
        }
      }

      const rows: any[] = [];
      for (const day of targetDays) {
        const dateStr = format(day, "yyyy-MM-dd");
        const dow = getDay(day);
        const templates = slotsByDow[dow] || [];
        for (const t of templates) {
          rows.push({
            class_id: classId,
            branch_id: branchId,
            slot_date: dateStr,
            start_time: t.start_time,
            end_time: t.end_time,
            subject_name: t.subject_name,
            source_slot_id: t.source_slot_id || null,
            is_modified: false,
            event_name: t.event_name || null,
            event_description: t.event_description || null,
            event_agenda: t.event_agenda || [],
            is_parallel_group: t.is_parallel_group || false,
            parallel_group_label: t.parallel_group_label || null,
          });
        }
      }

      if (rows.length === 0) throw new Error("No slots to copy.");

      await supabase
        .from("daily_timetable_slots")
        .delete()
        .eq("class_id", classId)
        .gte("slot_date", targetStart)
        .lte("slot_date", targetEnd);

      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("daily_timetable_slots").insert(rows.slice(i, i + 100));
        if (error) throw error;
      }

      return { count: rows.length, month: format(targetDate, "MMMM yyyy") };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
      setCopyDialog(false);
      setCopyTargetMonth("");
      toast({ title: "Copied! ✅", description: `${result.count} slots copied to ${result.month}.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Edit single slot
  const editMutation = useMutation({
    mutationFn: async (updates: { id: string; subject: string }[]) => {
      for (const { id, subject } of updates) {
        const { error } = await supabase
          .from("daily_timetable_slots")
          .update({ subject_name: subject, is_modified: true })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
      setEditDialog(null);
      toast({ title: "Slot(s) updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete single slot
  const deleteSingleSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase.from("daily_timetable_slots").delete().eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
      setEditDialog(null);
      toast({ title: "Slot deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Reset slot to template
  const resetMutation = useMutation({
    mutationFn: async ({ id, sourceSlotId }: { id: string; sourceSlotId?: string }) => {
      if (!sourceSlotId) throw new Error("No template link found for this slot.");
      const { data: templateSlot } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("id", sourceSlotId)
        .single();
      if (!templateSlot) throw new Error("Original template slot not found.");
      const { error } = await supabase
        .from("daily_timetable_slots")
        .update({
          subject_name: templateSlot.subject_name,
          is_modified: false,
          event_name: templateSlot.event_name || null,
          event_description: templateSlot.event_description || null,
          event_agenda: templateSlot.event_agenda || [],
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
      setEditDialog(null);
      toast({ title: "Slot reset to template" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Clear timetable mutation
  const clearMutation = useMutation({
    mutationFn: async ({ type, subject }: { type: "week" | "month" | "subject"; subject?: string }) => {
      if (type === "month") {
        const { error } = await supabase
          .from("daily_timetable_slots")
          .delete()
          .eq("class_id", classId)
          .gte("slot_date", monthStart)
          .lte("slot_date", monthEnd);
        if (error) throw error;
        return { label: monthLabel };
      } else if (type === "week" && selectedWeek) {
        const weekStart = format(selectedWeek[0], "yyyy-MM-dd");
        const weekEnd = format(selectedWeek[selectedWeek.length - 1], "yyyy-MM-dd");
        const { error } = await supabase
          .from("daily_timetable_slots")
          .delete()
          .eq("class_id", classId)
          .gte("slot_date", weekStart)
          .lte("slot_date", weekEnd);
        if (error) throw error;
        return { label: `Week ${activeWeek + 1}` };
      } else if (type === "subject" && subject) {
        const { error } = await supabase
          .from("daily_timetable_slots")
          .delete()
          .eq("class_id", classId)
          .eq("subject_name", subject)
          .gte("slot_date", monthStart)
          .lte("slot_date", monthEnd);
        if (error) throw error;
        return { label: `all "${subject}" slots` };
      }
      throw new Error("Invalid clear type");
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
      setClearConfirm(null);
      toast({ title: "Cleared ✅", description: `Successfully cleared ${result.label}.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Group weekdays by week
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  for (const day of weekdays) {
    if (currentWeek.length > 0 && getDay(day) <= getDay(currentWeek[currentWeek.length - 1])) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(day);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const modifiedCount = dailySlots.filter((s: any) => s.is_modified).length;

  // Helper to check if a week has any extended care slots
  const weekHasExtendedCare = (week: Date[]) => {
    return week.some(day => {
      const dateStr = format(day, "yyyy-MM-dd");
      return extendedCareTimes.some(time => getSlotsForDateAndTime(dateStr, time).length > 0);
    });
  };

  const renderTimeRows = (times: string[], week: Date[]) => (
    <>
      {times.map(time => (
        <div
          key={time}
          className="grid gap-1 border-t border-border/30"
          style={{ gridTemplateColumns: `60px repeat(${week.length}, 1fr)` }}
        >
          <div className="text-[10px] text-muted-foreground font-mono py-1.5 text-center">{time}</div>
          {week.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isHoliday = holidayDates.has(dateStr);
            const cellSlots = getSlotsForDateAndTime(dateStr, time);
            const isSingleSubject = cellSlots.length === 1 && !cellSlots[0].is_parallel_group;

            if (isHoliday) {
              return <div key={dateStr} className="py-1 bg-destructive/5 rounded" />;
            }

            return (
              <div
                key={dateStr}
                className={`py-0.5 px-0.5 min-h-[34px] ${!isReadOnly && cellSlots.length > 0 ? "cursor-pointer hover:bg-muted/30" : ""} transition-colors rounded flex items-stretch`}
                onClick={() => {
                  if (isReadOnly || cellSlots.length === 0) return;
                  // Pass ALL slots for this cell to the edit dialog
                  setEditDialog({ date: dateStr, startTime: time, slots: cellSlots });
                  const subjectMap: Record<string, string> = {};
                  cellSlots.forEach((s: any) => { subjectMap[s.id] = s.subject_name; });
                  setEditSlotSubjects(subjectMap);
                }}
              >
                {isSingleSubject ? (
                  /* Single subject — fill entire cell */
                  <div className="relative w-full flex items-center">
                    <div className={`rounded w-full px-2 py-1.5 text-[11px] font-semibold text-center truncate ${SUBJECT_COLORS[cellSlots[0].subject_name] || "bg-muted text-foreground"} ${cellSlots[0].is_modified ? "ring-1 ring-primary/40" : ""}`}>
                      {cellSlots[0].is_modified && <Pencil className="inline h-2.5 w-2.5 mr-0.5 opacity-60" />}
                      {cellSlots[0].subject_name === "Event / Activity" && cellSlots[0].event_name
                        ? `🎉 ${cellSlots[0].event_name}`
                        : cellSlots[0].subject_name}
                    </div>
                    {hasLessonPlan(cellSlots[0].id, dateStr) && (
                      <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" title="Lesson plan linked" />
                    )}
                  </div>
                ) : cellSlots.length > 0 ? (
                  /* Multiple / parallel subjects — compact single chip so rows stay aligned.
                     Click opens the edit dialog which lists every parallel subject. */
                  <div className="relative w-full flex items-center">
                    <div
                      className="rounded w-full px-1.5 py-1.5 text-[10px] font-semibold text-center bg-gradient-to-r from-violet-100 to-blue-100 text-violet-900 dark:from-violet-900/30 dark:to-blue-900/30 dark:text-violet-200 border border-violet-300/60 dark:border-violet-700/40 truncate"
                      title={cellSlots.map((s: any) => s.subject_name).join(" • ")}
                    >
                      <span className="opacity-70 mr-1">⇶</span>
                      {cellSlots.length} parallel
                    </div>
                    {cellSlots.some((s: any) => hasLessonPlan(s.id, dateStr)) && (
                      <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" title="Lesson plan linked" />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );

  const renderDayHeaders = (week: Date[]) => (
    <div className="grid gap-1" style={{ gridTemplateColumns: `60px repeat(${week.length}, 1fr)` }}>
      <div />
      {week.map(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        const isHoliday = holidayDates.has(dateStr);
        const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
        const holidayInfo = allHolidays.find((h: any) => h.event_date === dateStr);
        return (
          <div
            key={dateStr}
            className={`text-center py-1.5 rounded-t text-xs font-semibold ${
              isHoliday ? "bg-destructive/10 text-destructive" :
              isToday ? "bg-primary/10 text-primary" :
              "bg-muted/50 text-muted-foreground"
            }`}
          >
            <div>{format(day, "EEE")}</div>
            <div className="text-[10px] font-normal">
              {format(day, "d/M")}
              {isHoliday && (
                <span className="block text-destructive truncate max-w-[80px] mx-auto" title={holidayInfo?.event_name}>
                  {holidayInfo?.source === "branch_event" ? "🎯 " : ""}{holidayInfo?.event_name}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const selectedWeek = weeks[activeWeek] ?? weeks[0];

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-foreground">{monthLabel}</h2>
          {dailySlots.length > 0 && !isReadOnly && (
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Zap className="h-2.5 w-2.5" /> Auto-synced from template
              </Badge>
              {modifiedCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Pencil className="h-2.5 w-2.5" /> {modifiedCount} modified
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary inline-block" /> Has lesson plan</span>
        <span className="flex items-center gap-1"><Pencil className="h-2.5 w-2.5" /> Changed for this day</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/30 inline-block" /> Holiday</span>
        <span className="flex items-center gap-1">🎯 School event</span>
      </div>

      {/* Action buttons */}
      {!isReadOnly && dailySlots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <MoreHorizontal className="h-3.5 w-3.5" /> More actions <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setCopyDialog(true)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copy this month to another month
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setClearConfirm({ type: "week" })}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear this week (Week {activeWeek + 1})
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setClearConfirm({ type: "month" })}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear entire month
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setClearSubjectDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Clear by subject…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isLoading ? (
        <Card className="border-dashed">
          <CardContent className="py-10">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {monthLabel}'s schedule…
            </div>
            <div className="mt-4 space-y-2 max-w-xl mx-auto opacity-50">
              <div className="h-6 rounded bg-muted/60 animate-pulse" />
              <div className="h-6 rounded bg-muted/60 animate-pulse" />
              <div className="h-6 rounded bg-muted/60 animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ) : dailySlots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="font-medium text-muted-foreground">No schedule for {monthLabel} yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {autoPublishError
                ? autoPublishError
                : templateSlots.length > 0
                ? "Tap below to fill in this month from the class's weekly schedule."
                : "This class doesn't have a weekly schedule yet — set one up first."}
            </p>
            {templateSlots.length > 0 && !isReadOnly && (
              <Button
                size="sm"
                onClick={() => {
                  setAutoPublishError(null);
                  setIsGenerating(true);
                  autoPublishTemplate({ classId, branchId, templateSlots, targetMonths: [currentMonth] })
                    .then((count) => {
                      queryClient.invalidateQueries({ queryKey: ["daily-timetable", classId, monthStart] });
                      toast({ title: "Schedule ready ✅", description: `${count} lessons added for ${monthLabel}.` });
                    })
                    .catch((e: any) => {
                      const msg = e?.message || "Unknown error";
                      const isPerm = /permission|rls|policy/i.test(msg);
                      setAutoPublishError(
                        isPerm
                          ? "Permission denied. Ask an admin to grant you the Timetable module."
                          : msg
                      );
                      toast({ title: "Couldn't fill schedule", description: msg, variant: "destructive" });
                    })
                    .finally(() => setIsGenerating(false));
                }}
                disabled={isGenerating}
                className="gap-1.5"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Fill in {monthLabel}
              </Button>
            )}
            {templateSlots.length === 0 && onOpenTemplate && (
              <Button size="sm" onClick={onOpenTemplate} className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Set Up Weekly Schedule
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Week Tabs */}
          {weeks.length > 1 && (
            <Tabs value={String(activeWeek)} onValueChange={(v) => setActiveWeek(Number(v))}>
              <TabsList className="w-full justify-start">
                {weeks.map((week, idx) => (
                  <TabsTrigger key={idx} value={String(idx)} className="text-xs">
                    Week {idx + 1}
                    <span className="hidden sm:inline text-muted-foreground ml-1.5 font-normal">
                      {format(week[0], "d MMM")} – {format(week[week.length - 1], "d MMM")}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Single week card */}
          {selectedWeek && (
            <>
            {/* Mobile day-list view */}
            <Card className="md:hidden">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Week {activeWeek + 1} · {format(selectedWeek[0], "d MMM")} – {format(selectedWeek[selectedWeek.length - 1], "d MMM")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3 space-y-3">
                {(() => {
                  const todayStr = format(new Date(), "yyyy-MM-dd");
                  const todayIdx = selectedWeek.findIndex(d => format(d, "yyyy-MM-dd") === todayStr);
                  const dayIdx =
                    activeDayIdx !== null && activeDayIdx < selectedWeek.length
                      ? activeDayIdx
                      : todayIdx >= 0 ? todayIdx : 0;
                  const day = selectedWeek[dayIdx];
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isHoliday = holidayDates.has(dateStr);
                  const holidayInfo = allHolidays.find((h: any) => h.event_date === dateStr);
                  // Collect all slots for this day, grouped by start time, in chronological order
                  const daySlotMap = new Map<string, any[]>();
                  [...kindergartenTimes, ...extendedCareTimes].forEach(t => {
                    const list = getSlotsForDateAndTime(dateStr, t);
                    if (list.length > 0) daySlotMap.set(t, list);
                  });
                  const orderedTimes = Array.from(daySlotMap.keys()).sort();

                  return (
                    <>
                      {/* Day pills */}
                      <ScrollArea className="w-full">
                        <div className="flex gap-2 px-3 pt-1 pb-2">
                          {selectedWeek.map((d, i) => {
                            const ds = format(d, "yyyy-MM-dd");
                            const isToday = ds === todayStr;
                            const isActive = i === dayIdx;
                            const dHoliday = holidayDates.has(ds);
                            return (
                              <button
                                key={ds}
                                type="button"
                                onClick={() => setActiveDayIdx(i)}
                                className={`shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[56px] border transition-colors ${
                                  isActive
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : dHoliday
                                      ? "bg-destructive/5 text-destructive border-destructive/30"
                                      : isToday
                                        ? "bg-primary/10 text-primary border-primary/30"
                                        : "bg-card border-border text-foreground"
                                }`}
                              >
                                <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                                  {format(d, "EEE")}
                                </span>
                                <span className="text-base font-bold leading-none mt-0.5">
                                  {format(d, "d")}
                                </span>
                                {isToday && !isActive && (
                                  <span className="text-[9px] mt-0.5 opacity-70">Today</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>

                      <div className="px-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold">
                            {format(day, "EEEE, d MMM")}
                          </p>
                          {orderedTimes.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">{orderedTimes.length} slot{orderedTimes.length === 1 ? "" : "s"}</span>
                          )}
                        </div>

                        {isHoliday ? (
                          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                            <p className="text-sm font-semibold text-destructive">School closed</p>
                            {holidayInfo?.event_name && (
                              <p className="text-xs text-muted-foreground mt-1">{holidayInfo.event_name}</p>
                            )}
                          </div>
                        ) : orderedTimes.length === 0 ? (
                          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No lessons scheduled
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {orderedTimes.map((time) => {
                              const cellSlots = daySlotMap.get(time)!;
                              const isParallel = cellSlots.length > 1;
                              const first = cellSlots[0];
                              const subjectName = first.subject_name;
                              const colorClass = SUBJECT_COLORS[subjectName] || "bg-muted text-foreground";
                              return (
                                <button
                                  key={time}
                                  type="button"
                                  onClick={() => {
                                    if (isReadOnly) return;
                                    setEditDialog({ date: dateStr, startTime: time, slots: cellSlots });
                                    const subjectMap: Record<string, string> = {};
                                    cellSlots.forEach((s: any) => { subjectMap[s.id] = s.subject_name; });
                                    setEditSlotSubjects(subjectMap);
                                  }}
                                  className={`w-full text-left rounded-xl border bg-card p-3 flex items-stretch gap-3 transition-colors ${!isReadOnly ? "active:bg-muted/60" : ""}`}
                                >
                                  <div className="flex flex-col items-center justify-center w-14 shrink-0 border-r pr-3">
                                    <span className="text-sm font-bold tabular-nums">{time}</span>
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    {isParallel ? (
                                      <div className="flex flex-wrap gap-1">
                                        {cellSlots.map((s: any) => (
                                          <span
                                            key={s.id}
                                            className={`text-xs font-semibold rounded px-2 py-1 ${SUBJECT_COLORS[s.subject_name] || "bg-muted text-foreground"}`}
                                          >
                                            {s.subject_name}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className={`text-sm font-semibold rounded px-2 py-1 inline-block ${colorClass}`}>
                                        {subjectName === "Event / Activity" && first.event_name
                                          ? `🎉 ${first.event_name}`
                                          : subjectName}
                                      </div>
                                    )}
                                    {cellSlots.some((s: any) => hasLessonPlan(s.id, dateStr)) && (
                                      <p className="text-[11px] text-primary flex items-center gap-1">
                                        <BookOpen className="h-3 w-3" /> Lesson plan ready
                                      </p>
                                    )}
                                    {isParallel && (
                                      <p className="text-[10px] text-muted-foreground">{cellSlots.length} parallel groups</p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Desktop week-grid view */}
            <Card className="hidden md:block">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Week {activeWeek + 1} · {format(selectedWeek[0], "d MMM")} – {format(selectedWeek[selectedWeek.length - 1], "d MMM")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-2">
                <ScrollArea className="w-full">
                  <div className="min-w-[600px] px-3">
                    {/* Day headers */}
                    {renderDayHeaders(selectedWeek)}

                    {/* Kindergarten Zone */}
                    {kindergartenTimes.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 py-2 px-1 mt-1">
                          <div className="h-1.5 w-4 rounded-full bg-primary" />
                          <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Kindergarten · 8:00 – 12:30</span>
                        </div>
                        {renderTimeRows(kindergartenTimes, selectedWeek)}
                      </>
                    )}

                    {/* Extended Care / Enrichment Zone */}
                    {extendedCareTimes.length > 0 && weekHasExtendedCare(selectedWeek) && (
                      <>
                        <div className="flex items-center gap-2 py-2 px-1 mt-3 border-t-2 border-emerald-300 dark:border-emerald-700">
                          <div className="h-1.5 w-4 rounded-full bg-emerald-500" />
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Afternoon Program · 12:30 – 6:00 PM</span>
                        </div>
                        {renderTimeRows(extendedCareTimes, selectedWeek)}
                      </>
                    )}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>
            </>
          )}
        </div>
      )}

      {/* Edit Slot Dialog — shows ALL parallel subjects */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit Slot
            </DialogTitle>
            <DialogDescription>
              {editDialog?.date} · {editDialog?.startTime}
              {editDialog?.slots?.length && editDialog.slots.length > 1 && (
                <Badge variant="outline" className="ml-2 text-[10px]">{editDialog.slots.length} parallel subjects</Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[40vh] overflow-y-auto">
            {editDialog?.slots?.map((slot: any, idx: number) => (
              <div key={slot.id} className="space-y-1.5">
                {(editDialog.slots.length > 1) && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      {slot.parallel_group_label || `Subject ${idx + 1}`}
                      {slot.is_modified && <Badge variant="outline" className="ml-1.5 text-[9px]">Modified</Badge>}
                    </Label>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-destructive hover:text-destructive"
                        onClick={() => deleteSingleSlotMutation.mutate(slot.id)}
                        disabled={deleteSingleSlotMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
                <Select
                  value={editSlotSubjects[slot.id] || slot.subject_name}
                  onValueChange={(v) => setEditSlotSubjects(prev => ({ ...prev, [slot.id]: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s: any) => (
                      <SelectItem key={s.subject_name} value={s.subject_name}>{s.subject_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recentSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">Quick:</span>
                    {recentSubjects.map((name) => {
                      const current = editSlotSubjects[slot.id] || slot.subject_name;
                      const active = current === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setEditSlotSubjects(prev => ({ ...prev, [slot.id]: name }))}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted hover:bg-muted/70 border-transparent"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex gap-2 mr-auto">
              {editDialog?.slots?.length === 1 && editDialog.slots[0].is_modified && editDialog.slots[0].source_slot_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => resetMutation.mutate({
                    id: editDialog.slots[0].id,
                    sourceSlotId: editDialog.slots[0].source_slot_id,
                  })}
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset to template
                </Button>
              )}
              {canDelete && editDialog?.slots?.length === 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => deleteSingleSlotMutation.mutate(editDialog.slots[0].id)}
                  disabled={deleteSingleSlotMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Slot
                </Button>
              )}
            </div>
            <Button
              onClick={() => {
                if (!editDialog) return;
                const updates = editDialog.slots
                  .filter((s: any) => editSlotSubjects[s.id] && editSlotSubjects[s.id] !== s.subject_name)
                  .map((s: any) => ({ id: s.id, subject: editSlotSubjects[s.id] }));
                if (updates.length === 0) {
                  setEditDialog(null);
                  return;
                }
                editMutation.mutate(updates);
              }}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear by Subject Dialog */}
      <Dialog open={clearSubjectDialog} onOpenChange={setClearSubjectDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear by Subject</DialogTitle>
            <DialogDescription>
              Remove all slots of a specific subject from {monthLabel}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Subject to remove</Label>
            <Select value={clearSubjectName} onValueChange={setClearSubjectName}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {uniqueSubjects.map((subj) => (
                  <SelectItem key={subj} value={subj}>{subj}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClearSubjectDialog(false); setClearSubjectName(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!clearSubjectName || clearMutation.isPending}
              onClick={() => {
                setClearSubjectDialog(false);
                setClearConfirm({ type: "subject", subject: clearSubjectName });
              }}
            >
              Clear Subject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation */}
      <AlertDialog open={!!clearConfirm} onOpenChange={() => setClearConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Clear Timetable</AlertDialogTitle>
            <AlertDialogDescription>
              {clearConfirm?.type === "month" && `This will permanently delete ALL timetable slots for ${monthLabel}. This cannot be undone.`}
              {clearConfirm?.type === "week" && `This will permanently delete all timetable slots for Week ${activeWeek + 1}. This cannot be undone.`}
              {clearConfirm?.type === "subject" && `This will permanently delete all "${clearConfirm.subject}" slots from ${monthLabel}. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearConfirm && clearMutation.mutate({ type: clearConfirm.type, subject: clearConfirm.subject })}
              disabled={clearMutation.isPending}
            >
              {clearMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Yes, Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy Month Dialog */}
      <Dialog open={copyDialog} onOpenChange={setCopyDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Copy Month</DialogTitle>
            <DialogDescription>
              Copy all daily timetable slots from {monthLabel} to another month. Existing slots in the target month will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Target Month</Label>
            <Input
              type="month"
              value={copyTargetMonth}
              onChange={(e) => setCopyTargetMonth(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialog(false)}>Cancel</Button>
            <Button onClick={() => copyMutation.mutate()} disabled={!copyTargetMonth || copyMutation.isPending}>
              {copyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
