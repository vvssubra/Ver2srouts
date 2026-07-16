import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import ComplianceTracker from "@/components/ComplianceTracker";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Clock, Loader2, Plus, Eye, ArrowLeft, BookOpen, PartyPopper, Copy, Settings2, MoreHorizontal, Search, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { autoPublishTemplate } from "@/lib/timetable-auto-publish";
import { SCHEDULE_PRESETS, type SchedulePreset } from "@/lib/timetable-presets";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIME_SLOTS = Array.from({ length: 20 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2);
  const min = (i % 2) * 30;
  const start = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const endHour = min === 30 ? hour + 1 : hour;
  const endMin = min === 30 ? 0 : 30;
  const end = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
  return { start, end, label: `${start} - ${end}` };
});

const ENRICHMENT_CUTOFF = "12:30";
const NON_TEACHING_SUBJECTS = ["Assembly", "Break", "Event / Activity"];
const ENRICHMENT_SUBJECTS = [
  "Arts & Craft", "Science Explorer", "Public Speaking & Leadership",
  "Practical Life Skills", "Cooking & Nutrition", "Outdoor Adventure & Nature",
  "Music & Movement", "Drama & Storytelling", "STEM Robotics", "Gardening",
];

const SUBJECT_COLORS: Record<string, string> = {
  Maths: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300",
  Science: "bg-green-100 border-green-300 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300",
  STEAM: "bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300",
  English: "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300",
  "English - Spelling": "bg-amber-50 border-amber-400 border-dashed text-amber-700 dark:bg-amber-950/30 dark:border-amber-600 dark:text-amber-400",
  "English - Reading": "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-950/40 dark:border-yellow-800 dark:text-yellow-300",
  Phonics: "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-300",
  "Bahasa Melayu": "bg-red-100 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300",
  "Bahasa Melayu - Ejaan": "bg-red-50 border-red-400 border-dashed text-red-700 dark:bg-red-950/30 dark:border-red-600 dark:text-red-400",
  "Bahasa Melayu - Bacaan": "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300",
  "Art & Craft": "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-950/40 dark:border-pink-800 dark:text-pink-300",
  Music: "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300",
  "Physical Education": "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-300",
  "Islamic Studies": "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300",
  "Moral Education": "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-300",
  Mandarin: "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300",
  "Bahasa Tamil": "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300",
  "Social Skills": "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300",
  "Circle Time": "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300",
  "Free Play": "bg-lime-100 border-lime-300 text-lime-800 dark:bg-lime-950/40 dark:border-lime-800 dark:text-lime-300",
  Assembly: "bg-gray-200 border-gray-400 text-gray-700 dark:bg-gray-800/40 dark:border-gray-600 dark:text-gray-300",
  Break: "bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-900/40 dark:border-gray-700 dark:text-gray-400",
  "Event / Activity": "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300",
  "Arts & Craft": "bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800 dark:bg-fuchsia-950/40 dark:border-fuchsia-800 dark:text-fuchsia-300",
  "Science Explorer": "bg-sky-100 border-sky-300 text-sky-800 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300",
  "Public Speaking & Leadership": "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-950/40 dark:border-yellow-800 dark:text-yellow-300",
  "Practical Life Skills": "bg-stone-100 border-stone-300 text-stone-800 dark:bg-stone-950/40 dark:border-stone-800 dark:text-stone-300",
  "Cooking & Nutrition": "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-300",
  "Outdoor Adventure & Nature": "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300",
  "Music & Movement": "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300",
  "Drama & Storytelling": "bg-pink-100 border-pink-300 text-pink-800 dark:bg-pink-950/40 dark:border-pink-800 dark:text-pink-300",
  "STEM Robotics": "bg-cyan-100 border-cyan-300 text-cyan-800 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-300",
  "Gardening": "bg-lime-100 border-lime-300 text-lime-800 dark:bg-lime-950/40 dark:border-lime-800 dark:text-lime-300",
};

interface Props {
  embedded?: boolean;
  classIdProp?: string;
  branchIdProp?: string;
  onClose?: () => void;
}

export default function TimetableTemplateConfig({ embedded = false, classIdProp, branchIdProp, onClose }: Props = {}) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const classId = classIdProp ?? searchParams.get("class") ?? "";
  const branchId = branchIdProp ?? searchParams.get("branch") ?? "";

  const [slotDialog, setSlotDialog] = useState<{ day: number; start: string; end: string; existing?: any; existingParallel?: any[] } | null>(null);
  const [slotSubject, setSlotSubject] = useState("");
  const [isParallel, setIsParallel] = useState(false);
  const [parallelLabel, setParallelLabel] = useState("");
  const [showClearAll, setShowClearAll] = useState(false);
  const [copySourceClass, setCopySourceClass] = useState("");
  const [lessonDialog, setLessonDialog] = useState<any>(null);
  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventAgenda, setEventAgenda] = useState<{ time: string; activity: string }[]>([]);
  const [eventDuration, setEventDuration] = useState("1");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [extendedOpen, setExtendedOpen] = useState(false);
  const [copySectionOpen, setCopySectionOpen] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);

  // ─── Paint / drag-fill mode ───────────────────────────────────────────
  const [paintSubject, setPaintSubject] = useState<string | null>(null);
  const [paintedCells, setPaintedCells] = useState<Set<string>>(new Set());
  const isPaintingRef = useRef(false);
  const cellKey = (day: number, start: string) => `${day}__${start}`;

  const isSuperAdmin = role === "super_admin";

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subject-map"],
    queryFn: async () => {
      const { data } = await supabase.from("subject_standard_map").select("*").order("subject_name");
      return data ?? [];
    },
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["timetable-slots", classId],
    queryFn: async () => {
      const { data } = await supabase.from("timetable_slots").select("*").eq("class_id", classId).order("day_of_week").order("start_time");
      return data ?? [];
    },
    enabled: !!classId,
  });

  const { data: slotLessons = [] } = useQuery({
    queryKey: ["slot-lessons-template", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("slot_lesson_plans")
        .select("*")
        .eq("class_id", classId);
      return data ?? [];
    },
    enabled: !!classId,
  });

  const className = classes.find((c: any) => c.id === classId)?.class_name ?? "Class";

  const allSubjectOptions = [
    ...subjects.map((s: any) => ({ name: s.subject_name, area: s.kp2026_learning_area, isTeaching: true, isEnrichment: false, parentSubject: s.parent_subject || null })),
    ...NON_TEACHING_SUBJECTS.map((name) => ({ name, area: null, isTeaching: false, isEnrichment: false, parentSubject: null })),
    ...ENRICHMENT_SUBJECTS.map((name) => ({ name, area: null, isTeaching: true, isEnrichment: true, parentSubject: null })),
  ];

  const upsertSlotMutation = useMutation({
    mutationFn: async ({ day, start, end, subject, existingId, isParallelGroup, parallelGroupLabel, eventData, durationSlots }: any) => {
      const basePayload: any = {
        subject_name: subject,
        is_parallel_group: isParallelGroup || false,
        parallel_group_label: parallelGroupLabel || null,
        event_name: eventData?.event_name || null,
        event_description: eventData?.event_description || null,
        event_agenda: eventData?.event_agenda || [],
      };
      if (existingId) {
        const { error } = await supabase.from("timetable_slots").update(basePayload).eq("id", existingId);
        if (error) throw error;
      } else {
        const slotsToInsert = durationSlots || 1;
        const startIdx = TIME_SLOTS.findIndex((t) => t.start === start);
        for (let i = 0; i < slotsToInsert; i++) {
          const slotTime = TIME_SLOTS[startIdx + i];
          if (!slotTime) break;
          const { error } = await supabase.from("timetable_slots").insert({
            class_id: classId,
            day_of_week: day,
            start_time: slotTime.start,
            end_time: slotTime.end,
            ...basePayload,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      setSlotDialog(null);
      resetSlotForm();
      toast({ title: "Timetable updated" });
      await triggerAutoPublish();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      setSlotDialog(null);
      toast({ title: "Slot removed" });
      await triggerAutoPublish();
    },
  });

  const clearAllSlotsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("timetable_slots").delete().eq("class_id", classId);
      if (error) throw error;
      await supabase.from("audit_logs" as any).insert({
        actor_id: user!.id,
        action: "clear_timetable_slots",
        target_type: "class",
        target_id: classId,
        target_label: className,
        metadata: { slot_count: slots.length },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      setShowClearAll(false);
      toast({ title: "All slots cleared" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyTemplateMutation = useMutation({
    mutationFn: async (sourceClassId: string) => {
      const { data: sourceSlots } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("class_id", sourceClassId)
        .order("day_of_week")
        .order("start_time");
      if (!sourceSlots || sourceSlots.length === 0) throw new Error("Source class has no template slots.");
      await supabase.from("timetable_slots").delete().eq("class_id", classId);
      const rows = sourceSlots.map((s: any) => ({
        class_id: classId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subject_name: s.subject_name,
        is_parallel_group: s.is_parallel_group,
        parallel_group_label: s.parallel_group_label,
        event_name: s.event_name,
        event_description: s.event_description,
        event_agenda: s.event_agenda || [],
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("timetable_slots").insert(rows.slice(i, i + 50));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      setCopySourceClass("");
      toast({ title: "Template copied ✅", description: `${count} slots copied.` });
      await triggerAutoPublish();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const applyPresetMutation = useMutation({
    mutationFn: async (preset: SchedulePreset) => {
      // Replace any existing rows, then insert preset
      await supabase.from("timetable_slots").delete().eq("class_id", classId);
      const rows = preset.slots.map((s) => ({
        class_id: classId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subject_name: s.subject_name,
        is_parallel_group: false,
        parallel_group_label: null,
        event_name: null,
        event_description: null,
        event_agenda: [],
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("timetable_slots").insert(rows.slice(i, i + 50));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      setApplyingPresetId(null);
      toast({ title: "Schedule ready ✅", description: `${count} lessons added — tap any cell to change a subject.` });
      await triggerAutoPublish();
    },
    onError: (e: any) => {
      setApplyingPresetId(null);
      toast({ title: "Couldn't apply preset", description: e.message, variant: "destructive" });
    },
  });

  const copyDayMutation = useMutation({
    mutationFn: async ({ sourceDay, targetDays }: { sourceDay: number; targetDays: number[] }) => {
      const source = slots.filter((s: any) => s.day_of_week === sourceDay);
      if (source.length === 0) throw new Error("That day is empty — nothing to copy.");
      // remove existing target-day slots, then clone
      await supabase.from("timetable_slots").delete().eq("class_id", classId).in("day_of_week", targetDays);
      const rows = targetDays.flatMap((d) =>
        source.map((s: any) => ({
          class_id: classId,
          day_of_week: d,
          start_time: s.start_time,
          end_time: s.end_time,
          subject_name: s.subject_name,
          is_parallel_group: s.is_parallel_group,
          parallel_group_label: s.parallel_group_label,
          event_name: s.event_name,
          event_description: s.event_description,
          event_agenda: s.event_agenda || [],
        }))
      );
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("timetable_slots").insert(rows.slice(i, i + 50));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      toast({ title: "Day copied ✅", description: `${count} slots applied.` });
      await triggerAutoPublish();
    },
    onError: (e: any) => toast({ title: "Couldn't copy day", description: e.message, variant: "destructive" }),
  });

  const clearDayMutation = useMutation({
    mutationFn: async (day: number) => {
      const { error } = await supabase.from("timetable_slots").delete().eq("class_id", classId).eq("day_of_week", day);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      toast({ title: "Day cleared" });
      await triggerAutoPublish();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Bulk paint mutation — applies one subject to many (day,start) cells at once
  const paintFillMutation = useMutation({
    mutationFn: async ({ subject, cells }: { subject: string; cells: { day: number; start: string; end: string }[] }) => {
      if (cells.length === 0) return 0;
      // Delete any existing slots at those exact (day, start_time) positions, then insert fresh
      for (const c of cells) {
        await supabase
          .from("timetable_slots")
          .delete()
          .eq("class_id", classId)
          .eq("day_of_week", c.day)
          .eq("start_time", c.start + ":00");
      }
      const rows = cells.map((c) => ({
        class_id: classId,
        day_of_week: c.day,
        start_time: c.start,
        end_time: c.end,
        subject_name: subject,
        is_parallel_group: false,
        parallel_group_label: null,
        event_name: null,
        event_description: null,
        event_agenda: [],
      }));
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from("timetable_slots").insert(rows.slice(i, i + 50));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots"] });
      toast({ title: `Painted ${count} slot${count === 1 ? "" : "s"} ✅` });
      await triggerAutoPublish();
    },
    onError: (e: any) => toast({ title: "Couldn't paint slots", description: e.message, variant: "destructive" }),
  });

  // Commit paint on global mouseup; exit paint mode on Esc
  useEffect(() => {
    const onUp = () => {
      if (!isPaintingRef.current) return;
      isPaintingRef.current = false;
      const cellsToPaint = Array.from(paintedCells).map((k) => {
        const [d, s] = k.split("__");
        const ts = TIME_SLOTS.find((t) => t.start === s);
        return { day: Number(d), start: s, end: ts?.end ?? s };
      });
      if (paintSubject && cellsToPaint.length > 0) {
        paintFillMutation.mutate({ subject: paintSubject, cells: cellsToPaint });
      }
      setPaintedCells(new Set());
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPaintSubject(null);
        setPaintedCells(new Set());
        isPaintingRef.current = false;
      }
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [paintSubject, paintedCells, paintFillMutation]);

  // Cell handlers used by both grids in paint mode
  const handleCellMouseDown = (day: number, start: string) => {
    if (!paintSubject) return;
    isPaintingRef.current = true;
    setPaintedCells(new Set([cellKey(day, start)]));
  };
  const handleCellMouseEnter = (day: number, start: string) => {
    if (!paintSubject || !isPaintingRef.current) return;
    setPaintedCells((prev) => {
      const next = new Set(prev);
      next.add(cellKey(day, start));
      return next;
    });
  };

  // Top palette for paint mode — recently used + a curated quick row
  const paintPalette = useMemo(() => {
    const recent = Array.from(new Set(slots.map((s: any) => s.subject_name))) as string[];
    const defaults = ["Maths", "English", "Bahasa Melayu", "Phonics", "Circle Time", "Free Play", "Break", "Assembly"];
    return Array.from(new Set([...recent, ...defaults])).slice(0, 14);
  }, [slots]);

  const triggerAutoPublish = async () => {
    try {
      const { data: freshSlots } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("class_id", classId)
        .order("day_of_week")
        .order("start_time");
      if (freshSlots && freshSlots.length > 0) {
        const count = await autoPublishTemplate({ classId, branchId, templateSlots: freshSlots });
        queryClient.invalidateQueries({ queryKey: ["daily-timetable"] });
        if (count > 0) {
          toast({ title: "Auto-published ✅", description: `Monthly calendar updated with ${count} slots.` });
        }
      }
    } catch (e: any) {
      console.error("Auto-publish failed:", e);
    }
  };

  const resetSlotForm = () => {
    setIsParallel(false);
    setParallelLabel("");
    setEventName("");
    setEventDescription("");
    setEventAgenda([]);
    setEventDuration("1");
    setSubjectSearch("");
  };

  const getSlotsForCell = (day: number, start: string) =>
    slots.filter((s: any) => s.day_of_week === day && s.start_time === start + ":00");

  const getLessonForSlot = (slotId: string) =>
    slotLessons.find((l: any) => l.timetable_slot_id === slotId);

  const handleCellClick = (day: number, start: string, end: string) => {
    const cellSlots = getSlotsForCell(day, start);
    if (cellSlots.length === 1) {
      setSlotDialog({ day, start, end, existing: cellSlots[0], existingParallel: cellSlots });
      setSlotSubject(cellSlots[0].subject_name);
      setIsParallel(cellSlots[0].is_parallel_group || false);
      setParallelLabel(cellSlots[0].parallel_group_label || "");
      if (cellSlots[0].subject_name === "Event / Activity") {
        setEventName((cellSlots[0] as any).event_name || "");
        setEventDescription((cellSlots[0] as any).event_description || "");
        setEventAgenda((cellSlots[0] as any).event_agenda || []);
      } else {
        resetSlotForm();
      }
    } else if (cellSlots.length > 1) {
      setSlotDialog({ day, start, end, existing: cellSlots[0], existingParallel: cellSlots });
      setSlotSubject("");
      setIsParallel(true);
      setParallelLabel(cellSlots[0].parallel_group_label || "");
    } else {
      setSlotDialog({ day, start, end });
      setSlotSubject("");
      resetSlotForm();
    }
  };

  const uniqueSubjectsCount = new Set(slots.map((s: any) => s.subject_name)).size;
  const kindergartenSlots = TIME_SLOTS.filter(t => t.start < ENRICHMENT_CUTOFF);
  const extendedCareSlots = TIME_SLOTS.filter(t => t.start >= ENRICHMENT_CUTOFF);
  const hasExtendedCareSlots = slots.some((s: any) => s.start_time >= ENRICHMENT_CUTOFF + ":00");
  // recent subjects (last 8 distinct used in this template)
  const recentSubjects = Array.from(new Set(slots.map((s: any) => s.subject_name))).slice(0, 8);

  const Wrapper = ({ children }: { children: ReactNode }) =>
    embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>;

  return (
    <Wrapper>
      <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            {!embedded && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/timetables")} className="gap-1.5 -ml-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Weekly Schedule <span className="text-muted-foreground font-normal">·</span> <span className="text-primary">{className}</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tap a time slot to choose what {className} is learning. Updates show up in the monthly view right away.
              </p>
              {slots.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge variant="secondary" className="text-[10px]">{slots.length} slots</Badge>
                  <Badge variant="secondary" className="text-[10px]">{uniqueSubjectsCount} subjects</Badge>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <MoreHorizontal className="h-4 w-4" /> More actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs">Bulk tools</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setCopySectionOpen((v) => !v)}>
                  <Copy className="h-4 w-4 mr-2" /> Copy schedule from another class
                </DropdownMenuItem>
                {isSuperAdmin && slots.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setShowClearAll(true)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Clear entire schedule
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Optional: Copy from another class — collapsed by default */}
        {copySectionOpen && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-top-1">
            <Copy className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground">Copy from</span>
            <Select value={copySourceClass} onValueChange={setCopySourceClass}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Choose a class…" /></SelectTrigger>
              <SelectContent>
                {classes.filter((c: any) => c.id !== classId).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!copySourceClass || copyTemplateMutation.isPending} onClick={() => copyTemplateMutation.mutate(copySourceClass)}>
              {copyTemplateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setCopySourceClass(""); setCopySectionOpen(false); }}>Cancel</Button>
          </div>
        )}

        {/* Empty state */}
        {slots.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 sm:p-6">
            <div className="text-center mb-4">
              <Sparkles className="h-7 w-7 mx-auto text-primary mb-2" />
              <p className="font-semibold text-base">{className} doesn't have a schedule yet</p>
              <p className="text-sm text-muted-foreground mt-1">Pick a starting point — you can tap any time slot to change a subject afterwards.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SCHEDULE_PRESETS.map((preset) => {
                const isApplying = applyingPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!!applyingPresetId}
                    onClick={() => {
                      setApplyingPresetId(preset.id);
                      applyPresetMutation.mutate(preset);
                    }}
                    className="text-left rounded-lg border border-border bg-card p-4 hover:border-primary hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="text-2xl mb-2">{preset.emoji}</div>
                    <div className="font-semibold text-sm leading-tight">{preset.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{preset.hours}</div>
                    <div className="text-xs text-muted-foreground mt-2 leading-snug">{preset.tagline}</div>
                    <div className="mt-3 text-[11px] font-medium text-primary flex items-center gap-1">
                      {isApplying ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Applying…</>
                      ) : (
                        <>Use this template →</>
                      )}
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!!applyingPresetId}
                onClick={() => setCopySectionOpen(true)}
                className="text-left rounded-lg border border-dashed border-border bg-card p-4 hover:border-primary hover:shadow-md transition-all disabled:opacity-60"
              >
                <div className="text-2xl mb-2">📑</div>
                <div className="font-semibold text-sm leading-tight">Copy from another class</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Reuse a sibling class's setup</div>
                <div className="text-xs text-muted-foreground mt-2 leading-snug">Best if K1 / K3 is already set up — clone it here.</div>
                <div className="mt-3 text-[11px] font-medium text-primary">Choose a class →</div>
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Prefer to build from scratch? Just tap any empty time slot below.
            </p>
          </div>
        )}

        {/* Kindergarten Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-1.5 w-5 rounded-full bg-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Kindergarten · 8:00 – 12:30</span>
          </div>

          {/* Paint / Drag-Fill Toolbar */}
          <div className="mb-3 rounded-lg border bg-card p-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {paintSubject ? (
                  <span>
                    Painting <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${SUBJECT_COLORS[paintSubject] || "bg-muted border border-border"}`}>{paintSubject}</span>
                    <span className="ml-1 hidden sm:inline">— click or drag across cells</span>
                  </span>
                ) : (
                  <span>Quick-fill: tap a subject, then click or drag across cells</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 flex-1">
                {paintPalette.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPaintSubject((curr) => (curr === name ? null : name))}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium border transition-all hover:scale-[1.02] ${SUBJECT_COLORS[name] || "bg-muted border-border text-foreground"} ${paintSubject === name ? "ring-2 ring-primary ring-offset-1" : "opacity-80 hover:opacity-100"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {paintSubject && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setPaintSubject(null); setPaintedCells(new Set()); }}>
                  Done (Esc)
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="w-[100px] border-b border-r p-2 text-muted-foreground bg-muted/30 font-medium">Time</th>
                      {DAYS.map((d, dIdx) => {
                        const dayNum = dIdx + 1;
                        const dayHasSlots = slots.some((s: any) => s.day_of_week === dayNum);
                        return (
                          <th key={d} className="border-b p-1.5 bg-muted/30 font-medium min-w-[120px]">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-muted-foreground">{d}</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-60 hover:opacity-100">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel className="text-xs">{d} actions</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    disabled={!dayHasSlots}
                                    onClick={() => copyDayMutation.mutate({ sourceDay: dayNum, targetDays: [1,2,3,4,5].filter(n => n !== dayNum) })}
                                  >
                                    <Copy className="h-4 w-4 mr-2" /> Copy to all other weekdays
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">Copy to specific day</DropdownMenuLabel>
                                  {DAYS.map((td, tdIdx) => {
                                    const targetNum = tdIdx + 1;
                                    if (targetNum === dayNum) return null;
                                    return (
                                      <DropdownMenuItem
                                        key={td}
                                        disabled={!dayHasSlots}
                                        onClick={() => copyDayMutation.mutate({ sourceDay: dayNum, targetDays: [targetNum] })}
                                      >
                                        → {td}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                  {dayHasSlots && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => clearDayMutation.mutate(dayNum)}>
                                        <Trash2 className="h-4 w-4 mr-2" /> Clear {d}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {kindergartenSlots.map((ts) => (
                      <tr key={ts.start}>
                        <td className="border-r p-1.5 text-muted-foreground whitespace-nowrap font-mono text-[11px]">{ts.label}</td>
                        {DAYS.map((_, dayIdx) => {
                          const cellSlots = getSlotsForCell(dayIdx + 1, ts.start);
                          const dayNum = dayIdx + 1;
                          const isQueued = paintSubject && paintedCells.has(cellKey(dayNum, ts.start));
                          return (
                            <td
                              key={dayIdx}
                              className={`border p-1 transition-colors h-10 group/cell relative select-none ${paintSubject ? "cursor-crosshair" : "cursor-pointer hover:bg-primary/5"} ${isQueued ? "ring-2 ring-primary ring-inset bg-primary/10" : ""}`}
                              onMouseDown={() => paintSubject ? handleCellMouseDown(dayNum, ts.start) : undefined}
                              onMouseEnter={() => paintSubject ? handleCellMouseEnter(dayNum, ts.start) : undefined}
                              onClick={() => { if (!paintSubject) handleCellClick(dayNum, ts.start, ts.end); }}
                            >
                              {isQueued && paintSubject ? (
                                <div className={`rounded px-1.5 py-1 text-[10px] font-semibold text-center truncate opacity-90 ${SUBJECT_COLORS[paintSubject] || "bg-muted border-border text-foreground"}`}>
                                  {paintSubject}
                                </div>
                              ) : cellSlots.map((slot: any) => (
                                <div key={slot.id} className={`rounded px-1.5 py-1 text-[10px] font-medium text-center truncate ${SUBJECT_COLORS[slot.subject_name] || "bg-muted border-border text-foreground"}`}>
                                  {slot.subject_name === "Event / Activity" && slot.event_name ? `🎉 ${slot.event_name}` : slot.subject_name}
                                </div>
                              ))}
                              {cellSlots.length === 0 && !isQueued && (
                                <div className="flex items-center justify-center h-full text-muted-foreground/30 group-hover/cell:text-primary/70 transition-colors">
                                  <Plus className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Extended Care Section */}
        <Collapsible open={extendedOpen || hasExtendedCareSlots} onOpenChange={setExtendedOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 mb-3 w-full text-left hover:opacity-80 transition-opacity">
              {(extendedOpen || hasExtendedCareSlots) ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-emerald-600" />}
              <div className="h-1.5 w-5 rounded-full bg-emerald-500" />
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Afternoon Program · 12:30 – 6:00 PM</span>
              {!hasExtendedCareSlots && <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">(optional — click to add afternoon slots)</span>}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="w-[100px] border-b border-r p-2 text-muted-foreground bg-emerald-50/50 dark:bg-emerald-950/20 font-medium">Time</th>
                      {DAYS.map((d) => (
                        <th key={d} className="border-b p-2 text-muted-foreground bg-emerald-50/50 dark:bg-emerald-950/20 font-medium min-w-[120px]">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extendedCareSlots.map((ts) => (
                      <tr key={ts.start} className="bg-emerald-50/20 dark:bg-emerald-950/10">
                        <td className="border-r p-1.5 text-muted-foreground whitespace-nowrap font-mono text-[11px]">{ts.label}</td>
                        {DAYS.map((_, dayIdx) => {
                          const cellSlots = getSlotsForCell(dayIdx + 1, ts.start);
                          const dayNum = dayIdx + 1;
                          const isQueued = paintSubject && paintedCells.has(cellKey(dayNum, ts.start));
                          return (
                            <td
                              key={dayIdx}
                              className={`border p-1 transition-colors h-10 group/cell select-none ${paintSubject ? "cursor-crosshair" : "cursor-pointer hover:bg-emerald-100/40"} ${isQueued ? "ring-2 ring-emerald-500 ring-inset bg-emerald-100/30" : ""}`}
                              onMouseDown={() => paintSubject ? handleCellMouseDown(dayNum, ts.start) : undefined}
                              onMouseEnter={() => paintSubject ? handleCellMouseEnter(dayNum, ts.start) : undefined}
                              onClick={() => { if (!paintSubject) handleCellClick(dayNum, ts.start, ts.end); }}
                            >
                              {isQueued && paintSubject ? (
                                <div className={`rounded px-1.5 py-1 text-[10px] font-semibold text-center truncate opacity-90 ${SUBJECT_COLORS[paintSubject] || "bg-muted border-border text-foreground"}`}>
                                  {paintSubject}
                                </div>
                              ) : cellSlots.map((slot: any) => (
                                <div key={slot.id} className={`rounded px-1.5 py-1 text-[10px] font-medium text-center truncate ${SUBJECT_COLORS[slot.subject_name] || "bg-muted border-border text-foreground"}`}>
                                  {slot.subject_name === "Event / Activity" && slot.event_name ? `🎉 ${slot.event_name}` : slot.subject_name}
                                </div>
                              ))}
                              {cellSlots.length === 0 && !isQueued && (
                                <div className="flex items-center justify-center h-full text-muted-foreground/30 group-hover/cell:text-emerald-600 transition-colors">
                                  <Plus className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Compliance Tracker */}
        <ComplianceTracker slots={slots} />

        {/* Subject Legend */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Subject Legend</Label>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((s: any) => (
              <Badge key={s.id} variant="outline" className={`text-[9px] ${SUBJECT_COLORS[s.subject_name] || ""}`}>
                {s.subject_name}
              </Badge>
            ))}
            {NON_TEACHING_SUBJECTS.map((name) => (
              <Badge key={name} variant="outline" className={`text-[9px] ${SUBJECT_COLORS[name]}`}>
                {name}
              </Badge>
            ))}
            {ENRICHMENT_SUBJECTS.map((name) => (
              <Badge key={name} variant="outline" className={`text-[9px] ${SUBJECT_COLORS[name] || ""}`}>
                🌟 {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Slot Dialog */}
      <Dialog open={!!slotDialog} onOpenChange={() => { setSlotDialog(null); resetSlotForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{slotDialog?.existing ? "Edit" : "Add"} Time Slot</DialogTitle>
            <DialogDescription>
              {slotDialog && `${DAYS[slotDialog.day - 1]} · ${slotDialog.start} - ${slotDialog.end}`}
            </DialogDescription>
          </DialogHeader>

          {slotDialog?.existingParallel && slotDialog.existingParallel.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Parallel Subjects in this slot:</Label>
              {slotDialog.existingParallel.map((ps: any) => (
                <div key={ps.id} className="flex items-center justify-between rounded border p-2">
                  <Badge variant="outline" className={`text-xs ${SUBJECT_COLORS[ps.subject_name] || ""}`}>
                    {ps.subject_name}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => deleteSlotMutation.mutate(ps.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Subject</Label>
                {slotSubject && (
                  <Badge variant="outline" className={`text-[10px] ${SUBJECT_COLORS[slotSubject] || ""}`}>
                    Selected: {slotSubject}
                  </Badge>
                )}
              </div>

              {/* Recently used quick chips */}
              {recentSubjects.length > 0 && !slotDialog?.existing && (
                <div className="mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recently used</p>
                  <div className="flex flex-wrap gap-1">
                    {recentSubjects.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setSlotSubject(name)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all hover:scale-[1.02] ${SUBJECT_COLORS[name] || "bg-muted border-border"} ${slotSubject === name ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search subjects…"
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="h-8 pl-7 text-xs"
                />
              </div>

              {/* Chip grid grouped by category */}
              <ScrollArea className="h-[240px] rounded-md border p-2">
                {(() => {
                  const q = subjectSearch.toLowerCase().trim();
                  const match = (n: string) => !q || n.toLowerCase().includes(q);
                  const academic = allSubjectOptions.filter(s => s.isTeaching && !s.isEnrichment && match(s.name));
                  const enrich = allSubjectOptions.filter(s => s.isEnrichment && match(s.name));
                  const nonTeach = allSubjectOptions.filter(s => !s.isTeaching && match(s.name));
                  const Chip = ({ name }: { name: string }) => (
                    <button
                      type="button"
                      onClick={() => setSlotSubject(name)}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-medium border text-left truncate transition-all hover:scale-[1.01] ${SUBJECT_COLORS[name] || "bg-muted border-border text-foreground"} ${slotSubject === name ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    >
                      {name}
                    </button>
                  );
                  return (
                    <div className="space-y-3">
                      {academic.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Academic</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {academic.map((s) => <Chip key={s.name} name={s.name} />)}
                          </div>
                        </div>
                      )}
                      {enrich.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">🌟 Enrichment</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {enrich.map((s) => <Chip key={s.name} name={s.name} />)}
                          </div>
                        </div>
                      )}
                      {nonTeach.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Non-teaching</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {nonTeach.map((s) => <Chip key={s.name} name={s.name} />)}
                          </div>
                        </div>
                      )}
                      {academic.length === 0 && enrich.length === 0 && nonTeach.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">No subjects match "{subjectSearch}"</p>
                      )}
                    </div>
                  );
                })()}
              </ScrollArea>
            </div>

            {(slotSubject === "Event / Activity" || slotDialog?.existing?.subject_name === "Event / Activity") && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                  <PartyPopper className="h-4 w-4" /> Event Details
                </div>
                <div>
                  <Label className="text-xs">Event Name</Label>
                  <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Hari Raya Celebration" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} placeholder="Brief description..." />
                </div>
                {!slotDialog?.existing && (
                  <div>
                    <Label className="text-xs">Duration (slots of 30 min)</Label>
                    <Select value={eventDuration} onValueChange={setEventDuration}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6].map(n => (
                          <SelectItem key={n} value={String(n)}>{n * 30} min ({n} slot{n > 1 ? "s" : ""})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Agenda</Label>
                  <div className="space-y-1.5">
                    {eventAgenda.map((item, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input className="h-8 w-20 text-xs" value={item.time} placeholder="9:00" onChange={(e) => {
                          const updated = [...eventAgenda];
                          updated[i] = { ...updated[i], time: e.target.value };
                          setEventAgenda(updated);
                        }} />
                        <Input className="h-8 flex-1 text-xs" value={item.activity} placeholder="Activity description" onChange={(e) => {
                          const updated = [...eventAgenda];
                          updated[i] = { ...updated[i], activity: e.target.value };
                          setEventAgenda(updated);
                        }} />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEventAgenda(eventAgenda.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setEventAgenda([...eventAgenda, { time: "", activity: "" }])}>
                      <Plus className="h-3 w-3 mr-1" /> Add Agenda Item
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {slotSubject !== "Event / Activity" && (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox id="parallel" checked={isParallel} onCheckedChange={(v) => setIsParallel(!!v)} />
                  <Label htmlFor="parallel" className="text-sm cursor-pointer">
                    Parallel subject (students split into groups)
                  </Label>
                </div>
                {isParallel && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Group Label</Label>
                    <Input value={parallelLabel} onChange={(e) => setParallelLabel(e.target.value)} placeholder="Optional group label" />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            {slotDialog?.existing && slotDialog?.existingParallel?.length === 1 && (
              <Button variant="destructive" size="sm" onClick={() => deleteSlotMutation.mutate(slotDialog.existing.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
            {slotDialog?.existing && getLessonForSlot(slotDialog.existing.id) && (
              <Button variant="outline" size="sm" onClick={() => {
                setLessonDialog(getLessonForSlot(slotDialog.existing.id));
                setSlotDialog(null);
              }}>
                <Eye className="h-4 w-4 mr-1" /> View Lesson
              </Button>
            )}
            <Button
              onClick={() => {
                const subject = slotSubject || (slotDialog?.existingParallel?.length === 1 ? slotDialog?.existing?.subject_name : "");
                if (!subject) return;
                const isEvent = subject === "Event / Activity";
                const evtData = isEvent ? { event_name: eventName, event_description: eventDescription, event_agenda: eventAgenda.filter(a => a.activity) } : {};
                if (isParallel && slotDialog?.existingParallel && slotDialog.existingParallel.length >= 1 && !slotDialog?.existingParallel?.find((s: any) => s.subject_name === subject)) {
                  upsertSlotMutation.mutate({ day: slotDialog!.day, start: slotDialog!.start, end: slotDialog!.end, subject, existingId: null, isParallelGroup: true, parallelGroupLabel: parallelLabel, eventData: evtData });
                  slotDialog.existingParallel.forEach((ps: any) => {
                    if (!ps.is_parallel_group) {
                      supabase.from("timetable_slots").update({ is_parallel_group: true, parallel_group_label: parallelLabel || null }).eq("id", ps.id).then(() => {});
                    }
                  });
                } else {
                  upsertSlotMutation.mutate({ day: slotDialog!.day, start: slotDialog!.start, end: slotDialog!.end, subject, existingId: slotDialog?.existingParallel?.length === 1 ? slotDialog?.existing?.id : null, isParallelGroup: isParallel, parallelGroupLabel: isParallel ? parallelLabel : null, eventData: evtData, durationSlots: isEvent && !slotDialog?.existing ? parseInt(eventDuration) : 1 });
                }
              }}
              disabled={upsertSlotMutation.isPending}
            >
              {upsertSlotMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isParallel && slotDialog?.existingParallel && slotDialog.existingParallel.length >= 1 ? (
                <><Plus className="h-4 w-4 mr-1" /> Add Parallel</>
              ) : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Plan View Dialog */}
      <Dialog open={!!lessonDialog} onOpenChange={() => setLessonDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Lesson Plan
            </DialogTitle>
            <DialogDescription>
              {lessonDialog?.lesson_date} — {lessonDialog?.theme}
            </DialogDescription>
          </DialogHeader>
          {lessonDialog?.generated_activity && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="font-semibold text-sm">{lessonDialog.generated_activity.name}</p>
                <p className="text-xs text-muted-foreground italic">{lessonDialog.generated_activity.name_ms}</p>
              </div>
              <p className="text-sm">{lessonDialog.generated_activity.description}</p>
              {lessonDialog.generated_activity.materials?.length > 0 && (
                <div>
                  <Label className="text-xs">Materials</Label>
                  <p className="text-sm text-muted-foreground">{lessonDialog.generated_activity.materials.join(", ")}</p>
                </div>
              )}
              {lessonDialog.generated_activity.teacher_notes && (
                <div>
                  <Label className="text-xs">Teacher Notes</Label>
                  <p className="text-sm text-muted-foreground">{lessonDialog.generated_activity.teacher_notes}</p>
                </div>
              )}
              {lessonDialog.generated_activity.standards_addressed?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {lessonDialog.generated_activity.standards_addressed.map((s: string) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear All Confirm */}
      <ConfirmDeleteDialog
        open={showClearAll}
        onOpenChange={setShowClearAll}
        title="Clear All Timetable Slots"
        description={`This will permanently remove all ${slots.length} slots from the weekly template for ${className}.`}
        confirmLabel="Clear All Slots"
        confirmText={className}
        affectedItems={[`${slots.length} timetable slot(s)`]}
        isPending={clearAllSlotsMutation.isPending}
        onConfirm={() => clearAllSlotsMutation.mutate()}
      />
      </TooltipProvider>
    </Wrapper>
  );
}
