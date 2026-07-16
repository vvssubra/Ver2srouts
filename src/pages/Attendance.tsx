import { useState, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, isWeekend, parseISO } from "date-fns";
import { CalendarIcon, Check, X, Clock, ShieldCheck, Save, Printer, History, Stethoscope, Camera, Thermometer, AlertTriangle, Search, ArrowLeft, Users, GraduationCap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { sendParentEmailForStudent } from "@/lib/parent-email";
import { buildAppUrl } from "@/lib/app-url";
import { getBranchAcademicYearIds } from "@/lib/school-holidays-scope";
import StudentCheckOut from "@/components/attendance/StudentCheckOut";

type AttendanceStatus = "present" | "absent" | "late" | "excused";
type HealthStatus = "healthy" | "unwell" | "fever" | "needs_monitoring";
type Mood = "happy" | "calm" | "upset" | "tired" | "anxious";

const statusConfig: Record<AttendanceStatus, { label: string; icon: React.ElementType; className: string; short: string }> = {
  present: { label: "Present", short: "P", icon: Check, className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  absent: { label: "Absent", short: "A", icon: X, className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  late: { label: "Late", short: "L", icon: Clock, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  excused: { label: "Excused", short: "E", icon: ShieldCheck, className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

const moodOptions: { value: Mood; emoji: string; label: string }[] = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "calm", emoji: "😐", label: "Calm" },
  { value: "upset", emoji: "😢", label: "Upset" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "anxious", emoji: "😰", label: "Anxious" },
];

const healthOptions: { value: HealthStatus; label: string; className: string }[] = [
  { value: "healthy", label: "Healthy", className: "text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400" },
  { value: "unwell", label: "Unwell", className: "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400" },
  { value: "fever", label: "Fever", className: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400" },
  { value: "needs_monitoring", label: "Monitor", className: "text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400" },
];

interface CheckInData {
  status: AttendanceStatus;
  notes: string;
  temperature: string;
  health_status: HealthStatus;
  health_notes: string;
  body_marks: string;
  has_medication: boolean;
  medication_notes: string;
  mood: Mood;
  arrival_photo_url: string;
  photoFile: File | null;
  expanded: boolean;
  saved: boolean;
}

const defaultCheckIn: CheckInData = {
  status: "present",
  notes: "",
  temperature: "",
  health_status: "healthy",
  health_notes: "",
  body_marks: "",
  has_medication: false,
  medication_notes: "",
  mood: "happy",
  arrival_photo_url: "",
  photoFile: null,
  expanded: false,
  saved: false,
};

function getTempColor(temp: number): string {
  if (temp < 37.5) return "text-green-600";
  if (temp < 38) return "text-yellow-600";
  return "text-red-600";
}

interface AttendanceProps {
  embedded?: boolean;
  /** When provided, locks the view to a single class (skips the class-cards grid). */
  lockedClassName?: string;
  /** Default inner tab; defaults to 'checkin'. */
  defaultTab?: "checkin" | "checkout" | "history";
  /** Hide the inner Check-In/History tab switcher (used when parent provides its own nav). */
  hideInnerTabs?: boolean;
}
export default function Attendance({
  embedded = false,
  lockedClassName,
  defaultTab = "checkin",
  hideInnerTabs = false,
}: AttendanceProps = {}) {
  const { user, role } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedClass, setSelectedClass] = useState<string | null>(lockedClassName ?? null); // null = class cards view
  const [searchTerm, setSearchTerm] = useState("");
  const [localAttendance, setLocalAttendance] = useState<Record<string, CheckInData>>({});
  const [historyMonth, setHistoryMonth] = useState<Date>(new Date());
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: branches } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return memberships?.map((m: any) => m.branches).filter(Boolean) ?? [];
    },
    enabled: !!user,
  });

  const branchId = selectedBranch || branches?.[0]?.id || "";
  const branchName = branches?.find((b: any) => b.id === branchId)?.name ?? "Branch";

  // Teacher class scoping
  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);

  // Fetch classes for class-first cards
  const { data: classesData = [] } = useQuery({
    queryKey: ["branch-classes-att", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Filter classes by teacher assignment
  const availableClasses = useMemo(() => {
    if (!teacherClassIds) return classesData;
    return classesData.filter((c: any) => teacherClassIds.includes(c.id));
  }, [classesData, teacherClassIds]);

  const { data: students } = useQuery({
    queryKey: ["branch-students", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_name, class_id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("class_name")
        .order("first_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Scope students by teacher class assignment
  const scopedStudents = useMemo(() => {
    if (!students) return [];
    if (!teacherClassIds) return students;
    return students.filter((s: any) => s.class_id && teacherClassIds.includes(s.class_id));
  }, [students, teacherClassIds]);

  // Students for the currently selected class
  const classStudents = useMemo(() => {
    if (!selectedClass || !scopedStudents) return [];
    let list = selectedClass === "all"
      ? scopedStudents
      : scopedStudents.filter((s: any) => s.class_name === selectedClass);
    if (searchTerm) {
      list = list.filter((s: any) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list;
  }, [scopedStudents, selectedClass, searchTerm]);

  // Build class card data with today's check-in progress
  const { data: existingAttendance } = useQuery({
    queryKey: ["attendance", branchId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("branch_id", branchId)
        .eq("date", dateStr);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const classCardData = useMemo(() => {
    return availableClasses.map((cls: any) => {
      const clsStudents = scopedStudents.filter((s: any) => s.class_name === cls.class_name);
      const checkedIn = clsStudents.filter((s: any) =>
        existingAttendance?.some((a: any) => a.student_id === s.id)
      ).length;
      return {
        ...cls,
        studentCount: clsStudents.length,
        checkedIn,
      };
    });
  }, [availableClasses, scopedStudents, existingAttendance]);

  // Holiday / school break awareness for student attendance
  const STUDENT_CLOSED_TYPES = ["holiday", "reward_holiday", "term_holiday"];
  const { data: studentHolidayInfo } = useQuery({
    queryKey: ["student-holidays", branchId, dateStr],
    queryFn: async () => {
      const results: { name: string; type: string }[] = [];
      const yearIds = await getBranchAcademicYearIds(branchId);
      // school_holidays
      const { data: sh } = await supabase.from("school_holidays")
        .select("event_name, event_date, end_date, event_type, is_public_holiday")
        .in("academic_year_id", yearIds)
        .lte("event_date", dateStr)
        .or(`end_date.gte.${dateStr},end_date.is.null`);
      (sh ?? []).forEach((h: any) => {
        const et = h.event_type || (h.is_public_holiday ? "holiday" : "event");
        if (!STUDENT_CLOSED_TYPES.includes(et)) return;
        if (!h.end_date) return; // handled by exact match below
        results.push({ name: h.event_name, type: et });
      });
      const { data: shExact } = await supabase.from("school_holidays")
        .select("event_name, event_type, is_public_holiday")
        .in("academic_year_id", yearIds)
        .eq("event_date", dateStr).is("end_date", null);
      (shExact ?? []).forEach((h: any) => {
        const et = h.event_type || (h.is_public_holiday ? "holiday" : "event");
        if (STUDENT_CLOSED_TYPES.includes(et) && !results.some(r => r.name === h.event_name)) {
          results.push({ name: h.event_name, type: et });
        }
      });
      // branch_events
      if (branchId) {
        const { data: be } = await supabase.from("branch_events")
          .select("event_name, event_date, end_date, event_type")
          .eq("branch_id", branchId)
          .lte("event_date", dateStr)
          .or(`end_date.gte.${dateStr},end_date.is.null`);
        (be ?? []).forEach((e: any) => {
          if (!STUDENT_CLOSED_TYPES.includes(e.event_type)) return;
          if (!e.end_date) return;
          if (!results.some(r => r.name === e.event_name)) results.push({ name: e.event_name, type: e.event_type });
        });
        const { data: beExact } = await supabase.from("branch_events")
          .select("event_name, event_type")
          .eq("branch_id", branchId)
          .eq("event_date", dateStr).is("end_date", null);
        (beExact ?? []).forEach((e: any) => {
          if (STUDENT_CLOSED_TYPES.includes(e.event_type) && !results.some(r => r.name === e.event_name)) {
            results.push({ name: e.event_name, type: e.event_type });
          }
        });
      }
      return results;
    },
    enabled: !!dateStr,
  });

  const isSchoolClosed = (studentHolidayInfo?.length ?? 0) > 0;

  // History: holiday dates for the month (uses historyMonth inline)
  const hMonthStart = format(startOfMonth(historyMonth), "yyyy-MM-dd");
  const hMonthEnd = format(endOfMonth(historyMonth), "yyyy-MM-dd");
  const { data: historyHolidays = [] } = useQuery({
    queryKey: ["student-history-holidays", branchId, hMonthStart, hMonthEnd],
    queryFn: async () => {
      const results: { date: string; name: string }[] = [];
      const yearIds = await getBranchAcademicYearIds(branchId);
      const { data: sh } = await supabase.from("school_holidays")
        .select("event_date, end_date, event_name, event_type, is_public_holiday")
        .in("academic_year_id", yearIds)
        .or(`and(event_date.lte.${hMonthEnd},end_date.gte.${hMonthStart}),and(event_date.gte.${hMonthStart},event_date.lte.${hMonthEnd})`);
      (sh ?? []).forEach((h: any) => {
        const et = h.event_type || (h.is_public_holiday ? "holiday" : "event");
        if (!STUDENT_CLOSED_TYPES.includes(et)) return;
        const dates = h.end_date
          ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd"))
          : [h.event_date];
        dates.forEach(ds => { if (!results.some(r => r.date === ds)) results.push({ date: ds, name: h.event_name }); });
      });
      if (branchId) {
        const { data: be } = await supabase.from("branch_events")
          .select("event_date, end_date, event_name, event_type")
          .eq("branch_id", branchId)
          .or(`and(event_date.lte.${hMonthEnd},end_date.gte.${hMonthStart}),and(event_date.gte.${hMonthStart},event_date.lte.${hMonthEnd})`);
        (be ?? []).forEach((e: any) => {
          if (!STUDENT_CLOSED_TYPES.includes(e.event_type)) return;
          const dates = e.end_date
            ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd"))
            : [e.event_date];
          dates.forEach(ds => { if (!results.some(r => r.date === ds)) results.push({ date: ds, name: e.event_name }); });
        });
      }
      return results;
    },
    enabled: !!branchId,
  });
  const historyHolidaySet = useMemo(() => new Set(historyHolidays.map(h => h.date)), [historyHolidays]);

  // History data
  const monthStart = format(startOfMonth(historyMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(historyMonth), "yyyy-MM-dd");

  const { data: monthlyAttendance, isLoading: historyLoading } = useQuery({
    queryKey: ["attendance-history", branchId, monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("student_id, date, status, notes, temperature, health_status")
        .eq("branch_id", branchId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const getStudentCheckIn = (studentId: string): CheckInData => {
    if (localAttendance[studentId]) return localAttendance[studentId];
    const existing = existingAttendance?.find((a: any) => a.student_id === studentId);
    if (existing) {
      return {
        status: existing.status as AttendanceStatus,
        notes: existing.notes ?? "",
        temperature: (existing as any).temperature?.toString() ?? "",
        health_status: ((existing as any).health_status ?? "healthy") as HealthStatus,
        health_notes: (existing as any).health_notes ?? "",
        body_marks: (existing as any).body_marks ?? "",
        has_medication: (existing as any).has_medication ?? false,
        medication_notes: (existing as any).medication_notes ?? "",
        mood: ((existing as any).mood ?? "happy") as Mood,
        arrival_photo_url: (existing as any).arrival_photo_url ?? "",
        photoFile: null,
        expanded: false,
        saved: false,
      };
    }
    return { ...defaultCheckIn };
  };

  const updateCheckIn = (studentId: string, updates: Partial<CheckInData>) => {
    setLocalAttendance((prev) => ({
      ...prev,
      [studentId]: { ...getStudentCheckIn(studentId), ...updates },
    }));
  };

  const handlePhotoCapture = (studentId: string, file: File) => {
    updateCheckIn(studentId, { photoFile: file });
  };

  // Save mutation for all students in view
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!classStudents || !branchId || !user) return;
      // Compulsory arrival photo when marking a student PRESENT or LATE.
      const missingPhoto = classStudents.filter((s) => {
        const ci = getStudentCheckIn(s.id);
        const needsPhoto = ci.status === "present" || ci.status === "late";
        const hasPhoto = !!ci.arrival_photo_url || !!ci.photoFile;
        return needsPhoto && !hasPhoto;
      });
      if (missingPhoto.length > 0) {
        const names = missingPhoto.slice(0, 3).map((s) => s.first_name).join(", ");
        throw new Error(
          `Arrival photo required for ${names}${missingPhoto.length > 3 ? ` and ${missingPhoto.length - 3} more` : ""}. Tap "Take Photo" for each student marked present.`,
        );
      }
      for (const s of classStudents) {
        const checkIn = getStudentCheckIn(s.id);
        if (checkIn.photoFile) {
          const ext = checkIn.photoFile.name.split(".").pop() || "jpg";
          const path = `${user.id}/attendance/${dateStr}/${s.id}-${Date.now()}.${ext}`;
          try {
            const { uploadAndSign } = await import("@/lib/storage/signedUrl");
            const url = await uploadAndSign("observation-evidence", path, checkIn.photoFile, { upsert: true });
            updateCheckIn(s.id, { arrival_photo_url: url, photoFile: null });
            const ci = getStudentCheckIn(s.id);
            ci.arrival_photo_url = url;
          } catch (e) {
            console.error("attendance photo upload failed", e);
            throw new Error("Attendance photo upload failed. Please retry before saving.");
          }
        }
      }
      const records = classStudents.map((s) => {
        const ci = getStudentCheckIn(s.id);
        return {
          student_id: s.id, branch_id: branchId, date: dateStr,
          status: ci.status as "present" | "absent" | "late" | "excused",
          notes: ci.notes || null, marked_by: user.id,
          temperature: ci.temperature ? parseFloat(ci.temperature) : null,
          health_status: ci.health_status, health_notes: ci.health_notes || null,
          body_marks: ci.body_marks || null, has_medication: ci.has_medication,
          medication_notes: ci.medication_notes || null, mood: ci.mood,
          arrival_photo_url: ci.arrival_photo_url || null, checked_by: user.id,
        };
      });
      const { error } = await supabase.from("attendance").upsert(records as any, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", branchId, dateStr] });
      queryClient.invalidateQueries({ queryKey: ["attendance-history"] });

      // Notify parents of absent/late students
      try {
        const toNotify = classStudents.filter((s) => {
          const ci = getStudentCheckIn(s.id);
          return ["present", "absent", "late", "excused"].includes(ci.status as string);
        });
        if (toNotify.length > 0) {
          const studentIds = toNotify.map((s) => s.id);
          const { data: parentLinks } = await supabase
            .from("parent_students")
            .select("student_id, parent_id")
            .in("student_id", studentIds)
            .eq("status", "approved");
          if (parentLinks?.length) {
            const notifs = parentLinks.map((pl: any) => {
              const student = toNotify.find((s) => s.id === pl.student_id);
              const ci = getStudentCheckIn(pl.student_id);
              const titleByStatus: Record<string, string> = {
                present: "✅ Checked In",
                absent: "Child Marked Absent",
                late: "Child Arrived Late",
                excused: "Absence Excused",
              };
              return {
                user_id: pl.parent_id,
                title: titleByStatus[ci.status as string] || "Attendance Update",
                message: `${student?.first_name || "Your child"} has been marked as ${ci.status} on ${format(selectedDate, "PPP")}.`,
                type: "attendance",
                action_url: "/child",
                group_key: `attendance:${pl.student_id}:${dateStr}`,
              };
            });
            await supabase.from("notifications").insert(notifs as any);
          }
        }
        // Parent email — child-absent (only for status === "absent")
        const absentees = toNotify.filter((s) => getStudentCheckIn(s.id).status === "absent");
        for (const s of absentees) {
          const ci = getStudentCheckIn(s.id);
          sendParentEmailForStudent(
            s.id,
            "child-absent",
            (r) => ({
              parentName: r.first_name || undefined,
              childName: (s as any).first_name || "your child",
              date: format(selectedDate, "EEE, d MMM yyyy"),
              reason: ci.notes || "absent",
              contactUrl: buildAppUrl("/parent-chat"),
            }),
            `absent-${s.id}-${dateStr}`
          );
        }
      } catch (e) {
        console.error("Attendance notification error:", e);
      }

      setLocalAttendance({});
      toast({ title: "Check-in saved ✅", description: `Attendance for ${format(selectedDate, "PPP")} has been saved.` });
    },
    onError: (err: any) => {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    },
  });

  // Per-student save
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  const saveStudentAttendance = async (studentId: string) => {
    if (!branchId || !user) return;
    setSavingStudentId(studentId);
    try {
      const ci = getStudentCheckIn(studentId);
      if ((ci.status === "present" || ci.status === "late") && !ci.arrival_photo_url && !ci.photoFile) {
        toast({
          title: "Arrival photo required",
          description: `Please take an arrival photo before marking this student ${ci.status}.`,
          variant: "destructive",
        });
        setSavingStudentId(null);
        return;
      }
      if (ci.photoFile) {
        const ext = ci.photoFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/attendance/${dateStr}/${studentId}-${Date.now()}.${ext}`;
        try {
          const { uploadAndSign } = await import("@/lib/storage/signedUrl");
          const url = await uploadAndSign("observation-evidence", path, ci.photoFile, { upsert: true });
          updateCheckIn(studentId, { arrival_photo_url: url, photoFile: null });
          ci.arrival_photo_url = url;
        } catch (e) {
          console.error("attendance photo upload failed", e);
          throw new Error("Attendance photo upload failed. Please retry before saving.");
        }
      }
      const record = {
        student_id: studentId, branch_id: branchId, date: dateStr,
        status: ci.status as "present" | "absent" | "late" | "excused",
        notes: ci.notes || null, marked_by: user.id,
        temperature: ci.temperature ? parseFloat(ci.temperature) : null,
        health_status: ci.health_status, health_notes: ci.health_notes || null,
        body_marks: ci.body_marks || null, has_medication: ci.has_medication,
        medication_notes: ci.medication_notes || null, mood: ci.mood,
        arrival_photo_url: ci.arrival_photo_url || null, checked_by: user.id,
      };
      const { error } = await supabase.from("attendance").upsert(record as any, { onConflict: "student_id,date" });
      if (error) throw error;
      updateCheckIn(studentId, { saved: true });
      queryClient.invalidateQueries({ queryKey: ["attendance", branchId, dateStr] });
      // Parent email — child-absent (per-student save)
      if (ci.status === "absent") {
        const student = classStudents.find((s) => s.id === studentId);
        sendParentEmailForStudent(
          studentId,
          "child-absent",
          (r) => ({
            parentName: r.first_name || undefined,
            childName: (student as any)?.first_name || "your child",
            date: format(selectedDate, "EEE, d MMM yyyy"),
            reason: ci.notes || "absent",
            contactUrl: buildAppUrl("/parent-chat"),
          }),
          `absent-${studentId}-${dateStr}`
        );
      }
      toast({ title: "Saved ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingStudentId(null);
    }
  };

  // Summary
  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, flagged: 0, checked: 0, total: classStudents?.length ?? 0 };
    classStudents?.forEach((s) => {
      const ci = getStudentCheckIn(s.id);
      counts[ci.status]++;
      const hasExisting = existingAttendance?.find((a: any) => a.student_id === s.id) || localAttendance[s.id];
      if (hasExisting) counts.checked++;
      const temp = ci.temperature ? parseFloat(ci.temperature) : 0;
      if (ci.health_status === "fever" || ci.health_status === "unwell" || temp >= 38) counts.flagged++;
    });
    return counts;
  }, [classStudents, existingAttendance, localAttendance]);

  // History helpers
  const weekdays = useMemo(() => {
    const allDays = eachDayOfInterval({ start: startOfMonth(historyMonth), end: endOfMonth(historyMonth) });
    return allDays.filter((d) => !isWeekend(d));
  }, [historyMonth]);

  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStatus>> = {};
    monthlyAttendance?.forEach((r: any) => {
      if (!map[r.student_id]) map[r.student_id] = {};
      map[r.student_id][r.date] = r.status as AttendanceStatus;
    });
    return map;
  }, [monthlyAttendance]);

  const studentStats = useMemo(() => {
    if (!scopedStudents) return {};
    const stats: Record<string, Record<string, number>> = {};
    scopedStudents.forEach((s) => {
      const counts: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      weekdays.forEach((d) => {
        const ds = format(d, "yyyy-MM-dd");
        const status = attendanceMap[s.id]?.[ds];
        if (status) { counts[status]++; counts.total++; }
      });
      stats[s.id] = counts;
    });
    return stats;
  }, [scopedStudents, weekdays, attendanceMap]);

  const handlePrintReport = () => {
    const monthLabel = format(historyMonth, "MMMM yyyy");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = scopedStudents?.map((s) => {
      const st = studentStats[s.id] || { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      const rate = st.total > 0 ? Math.round(((st.present + st.late) / st.total) * 100) : 0;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd;">${s.first_name} ${s.last_name}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;color:green;">${st.present}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;color:red;">${st.absent}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;color:orange;">${st.late}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;color:blue;">${st.excused}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;">${st.total}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:bold;">${rate}%</td>
      </tr>`;
    }).join("") ?? "";

    const dayHeaders = weekdays.map((d) => `<th style="padding:4px;border:1px solid #ddd;font-size:10px;writing-mode:vertical-lr;text-align:center;">${format(d, "d")}</th>`).join("");
    const dayRows = scopedStudents?.map((s) => {
      const cells = weekdays.map((d) => {
        const ds = format(d, "yyyy-MM-dd");
        const status = attendanceMap[s.id]?.[ds];
        const colors: Record<string, string> = { present: "#22c55e", absent: "#ef4444", late: "#f59e0b", excused: "#3b82f6" };
        const labels: Record<string, string> = { present: "P", absent: "A", late: "L", excused: "E" };
        return `<td style="padding:4px;border:1px solid #ddd;text-align:center;font-size:10px;color:${status ? colors[status] : '#ccc'};font-weight:bold;">${status ? labels[status] : "—"}</td>`;
      }).join("");
      return `<tr><td style="padding:6px;border:1px solid #ddd;font-size:11px;white-space:nowrap;">${s.first_name} ${s.last_name}</td>${cells}</tr>`;
    }).join("") ?? "";

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Attendance Report - ${monthLabel}</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;color:#333}h1{margin-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:16px}@media print{body{padding:15px}}</style></head><body>
      <h1>Attendance Report</h1>
      <p style="color:#666;margin-top:0;">${branchName} — ${monthLabel}</p>
      <h2 style="font-size:16px;margin-top:24px;">Summary</h2>
      <table><thead><tr><th style="padding:8px;border:1px solid #ddd;text-align:left;">Student</th><th style="padding:8px;border:1px solid #ddd;">Present</th><th style="padding:8px;border:1px solid #ddd;">Absent</th><th style="padding:8px;border:1px solid #ddd;">Late</th><th style="padding:8px;border:1px solid #ddd;">Excused</th><th style="padding:8px;border:1px solid #ddd;">Total</th><th style="padding:8px;border:1px solid #ddd;">Rate</th></tr></thead><tbody>${rows}</tbody></table>
      <h2 style="font-size:16px;margin-top:32px;">Daily Attendance</h2>
      <table><thead><tr><th style="padding:6px;border:1px solid #ddd;text-align:left;">Student</th>${dayHeaders}</tr></thead><tbody>${dayRows}</tbody></table>
      <p style="margin-top:24px;font-size:11px;color:#999;">Generated on ${format(new Date(), "PPP 'at' p")}</p>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const isManager = role === "super_admin" || role === "franchisee" || role === "admin";

  const content = (
      <div className="space-y-6">
        {!embedded && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
              <p className="text-muted-foreground">Student check-in & health screening</p>
            </div>
          </div>
        )}

        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className={cn(hideInnerTabs && "hidden")}>
            <TabsTrigger value="checkin"><Stethoscope className="mr-1.5 h-4 w-4" />Check-In</TabsTrigger>
            <TabsTrigger value="checkout"><LogOut className="mr-1.5 h-4 w-4" />Check-Out</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-1.5 h-4 w-4" />History</TabsTrigger>
          </TabsList>

          {/* ── CHECK-IN TAB ── */}
          <TabsContent value="checkin" className="space-y-4">
            {/* School closed banner */}
            {isSchoolClosed && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">School is closed — {studentHolidayInfo?.map(h => h.name).join(", ")}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Student attendance check-in is not required for this date.</p>
                </div>
              </div>
            )}
            {/* CLASS CARDS VIEW — when no class is selected */}
            {!selectedClass && !lockedClassName ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => { if (d) { setSelectedDate(d); setLocalAttendance({}); } }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* All Classes card (managers only) */}
                  {isManager && (
                    <Card
                      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                      onClick={() => { setSelectedClass("all"); setSearchTerm(""); }}
                    >
                      <CardContent className="p-5 text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-primary group-hover:scale-110 transition-transform" />
                        <p className="text-3xl font-bold text-foreground">{scopedStudents.length}</p>
                        <p className="text-sm text-muted-foreground mt-1">All Classes</p>
                        <div className="flex justify-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px]">
                            {existingAttendance?.length ?? 0}/{scopedStudents.length} checked
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {classCardData.map((cls: any) => {
                    const progress = cls.studentCount > 0
                      ? Math.round((cls.checkedIn / cls.studentCount) * 100)
                      : 0;
                    return (
                      <Card
                        key={cls.id}
                        className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group"
                        onClick={() => { setSelectedClass(cls.class_name); setSearchTerm(""); }}
                      >
                        <CardContent className="p-5 text-center">
                          <GraduationCap className="h-8 w-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all" />
                          <p className="text-lg font-semibold text-foreground">{cls.class_name}</p>
                          <p className="text-xs text-muted-foreground">{cls.age_group}</p>
                          <div className="mt-3 space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground px-1">
                              <span>{cls.checkedIn}/{cls.studentCount}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className={cn("h-2 rounded-full transition-all", progress === 100 ? "bg-green-500" : "bg-primary")}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* STUDENT CHECK-IN VIEW — after class selected */
              <>
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex gap-2 items-center flex-wrap">
                    {!lockedClassName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSelectedClass(null); setSearchTerm(""); setLocalAttendance({}); }}
                      >
                        <ArrowLeft className="mr-1.5 h-4 w-4" />
                        Back to Classes
                      </Button>
                    )}
                    <Badge variant="secondary" className="text-sm py-1 px-3">
                      {selectedClass === "all" ? "All Classes" : selectedClass}
                    </Badge>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search student..."
                        className="h-9 w-[180px] pl-8 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(selectedDate, "PPP")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(d) => { if (d) { setSelectedDate(d); setLocalAttendance({}); } }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !classStudents?.length}>
                    <Save className="mr-2 h-4 w-4" />
                    {saveMutation.isPending ? "Saving..." : "Save Check-In"}
                  </Button>
                </div>

                {/* Summary strip */}
                {classStudents && classStudents.length > 0 && (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
                    <Card className="border-border/50">
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <Check className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xl font-bold">{summary.checked}/{summary.total}</p>
                          <p className="text-[10px] text-muted-foreground">Checked In</p>
                        </div>
                      </CardContent>
                    </Card>
                    {(["present", "absent", "late"] as AttendanceStatus[]).map((status) => {
                      const config = statusConfig[status];
                      const Icon = config.icon;
                      return (
                        <Card key={status} className="border-border/50">
                          <CardContent className="flex items-center gap-3 p-3">
                            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", config.className)}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xl font-bold">{summary[status]}</p>
                              <p className="text-[10px] text-muted-foreground">{config.label}</p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    <Card className={cn("border-border/50", summary.flagged > 0 && "border-red-300 dark:border-red-800")}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xl font-bold">{summary.flagged}</p>
                          <p className="text-[10px] text-muted-foreground">Flagged</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Student check-in cards */}
                <Card>
                  <CardContent className="p-4">
                    {!classStudents?.length ? (
                      <p className="text-center text-muted-foreground py-8">
                        {searchTerm ? "No students match your search." : "No active students in this class."}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {classStudents.map((student: any) => {
                          const ci = getStudentCheckIn(student.id);
                          const existing = existingAttendance?.find((a: any) => a.student_id === student.id);
                          const isCheckedIn = !!existing || !!localAttendance[student.id];

                          return (
                            <div
                              key={student.id}
                              className={cn(
                                "rounded-xl border p-4 transition-all",
                                ci.saved ? "border-green-300 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10" :
                                isCheckedIn ? "border-primary/20 bg-primary/5" : "border-border"
                              )}
                            >
                              <div className="flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                                    {student.first_name?.[0]}{student.last_name?.[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-foreground truncate">{student.first_name} {student.last_name}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {student.class_name || "Unassigned"}
                                      {ci.saved && <span className="ml-2 text-green-600">✓ Saved</span>}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 ml-auto">
                                  {/* Quick status buttons */}
                                  {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map((status) => {
                                    const config = statusConfig[status];
                                    return (
                                      <Button
                                        key={status}
                                        size="sm"
                                        variant={ci.status === status ? "default" : "outline"}
                                        className={cn(
                                          "h-10 min-w-[44px] px-2.5 text-sm font-semibold",
                                          ci.status === status && config.className,
                                        )}
                                        title={config.label}
                                        onClick={() => updateCheckIn(student.id, { status })}
                                      >
                                        {config.short}
                                      </Button>
                                    );
                                  })}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => updateCheckIn(student.id, { expanded: !ci.expanded })}
                                    className="text-muted-foreground h-10 px-2"
                                    title="Wellness check"
                                  >
                                    {ci.expanded ? "▲" : "▼"}
                                  </Button>
                                </div>
                              </div>

                              {/* Expanded health screening */}
                              {ci.expanded && (
                                <div className="mt-4 space-y-4 pt-3 border-t">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {/* Temperature */}
                                    <div>
                                      <Label className="text-xs flex items-center gap-1">
                                        <Thermometer className="h-3 w-3" /> Temperature (°C)
                                      </Label>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        placeholder="36.5"
                                        className="mt-1 h-8 text-sm"
                                        value={ci.temperature}
                                        onChange={(e) => updateCheckIn(student.id, { temperature: e.target.value })}
                                      />
                                      {ci.temperature && parseFloat(ci.temperature) >= 37.5 && (
                                        <p className={cn("text-xs mt-0.5 font-medium", getTempColor(parseFloat(ci.temperature)))}>
                                          {parseFloat(ci.temperature) >= 38 ? "⚠️ Fever detected!" : "⚠️ Slightly elevated"}
                                        </p>
                                      )}
                                    </div>

                                    {/* Health Status */}
                                    <div>
                                      <Label className="text-xs">Health Status</Label>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {healthOptions.map((h) => (
                                          <Badge
                                            key={h.value}
                                            variant="outline"
                                            className={cn("cursor-pointer text-xs transition-all", ci.health_status === h.value ? h.className + " ring-1 ring-offset-1" : "opacity-50")}
                                            onClick={() => updateCheckIn(student.id, { health_status: h.value })}
                                          >
                                            {h.label}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Mood */}
                                    <div>
                                      <Label className="text-xs">Mood</Label>
                                      <div className="flex gap-1 mt-1">
                                        {moodOptions.map((m) => (
                                          <button
                                            key={m.value}
                                            className={cn("text-lg p-1 rounded transition-all", ci.mood === m.value ? "bg-primary/20 scale-110" : "opacity-40 hover:opacity-70")}
                                            title={m.label}
                                            onClick={() => updateCheckIn(student.id, { mood: m.value })}
                                          >
                                            {m.emoji}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs">Health Notes</Label>
                                      <Textarea
                                        className="mt-1 text-sm h-16"
                                        placeholder="Any health concerns..."
                                        value={ci.health_notes}
                                        onChange={(e) => updateCheckIn(student.id, { health_notes: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Body Marks</Label>
                                      <Textarea
                                        className="mt-1 text-sm h-16"
                                        placeholder="Note any visible marks..."
                                        value={ci.body_marks}
                                        onChange={(e) => updateCheckIn(student.id, { body_marks: e.target.value })}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={ci.has_medication}
                                        onCheckedChange={(v) => updateCheckIn(student.id, { has_medication: v })}
                                      />
                                      <Label className="text-xs">Has Medication</Label>
                                    </div>
                                    {ci.has_medication && (
                                      <Input
                                        placeholder="Medication details..."
                                        className="flex-1 h-8 text-sm"
                                        value={ci.medication_notes}
                                        onChange={(e) => updateCheckIn(student.id, { medication_notes: e.target.value })}
                                      />
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <div>
                                      <Label className="text-xs flex items-center gap-1">
                                        <Camera className="h-3 w-3" /> Arrival Photo
                                      </Label>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        ref={(el) => { photoRefs.current[student.id] = el; }}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handlePhotoCapture(student.id, file);
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="mt-1 gap-1 text-xs"
                                        onClick={() => photoRefs.current[student.id]?.click()}
                                      >
                                        <Camera className="h-3 w-3" />
                                        {ci.photoFile ? "Replace Photo" : ci.arrival_photo_url ? "Captured ✓" : "Take Photo"}
                                      </Button>
                                    </div>
                                    {(ci.arrival_photo_url || ci.photoFile) && (
                                      <img
                                        src={ci.photoFile ? URL.createObjectURL(ci.photoFile) : ci.arrival_photo_url}
                                        alt="Arrival"
                                        className="h-12 w-12 rounded-lg object-cover border"
                                      />
                                    )}
                                  </div>

                                  <div>
                                    <Label className="text-xs">Notes</Label>
                                    <Textarea
                                      className="mt-1 text-sm h-16"
                                      placeholder="Additional notes..."
                                      value={ci.notes}
                                      onChange={(e) => updateCheckIn(student.id, { notes: e.target.value })}
                                    />
                                  </div>

                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      onClick={() => saveStudentAttendance(student.id)}
                                      disabled={savingStudentId === student.id}
                                    >
                                      {savingStudentId === student.id ? "Saving..." : "Save This Student"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── HISTORY TAB ── */}
          {/* ── CHECK-OUT TAB ── */}
          <TabsContent value="checkout" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) setSelectedDate(d); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {!lockedClassName && (
                <Select value={selectedClass ?? "all"} onValueChange={(v) => setSelectedClass(v)}>
                  <SelectTrigger className="w-[200px] h-10">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {isManager && <SelectItem value="all">All Classes</SelectItem>}
                    {availableClasses.map((c: any) => (
                      <SelectItem key={c.id} value={c.class_name}>{c.class_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search student..."
                  className="h-10 w-[200px] pl-8 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {!branchId || !user ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading...</CardContent></Card>
            ) : !selectedClass ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a class to begin checking out students.</CardContent></Card>
            ) : (
              <StudentCheckOut
                branchId={branchId}
                userId={user.id}
                selectedDate={selectedDate}
                classStudents={classStudents ?? []}
                existingAttendance={existingAttendance ?? []}
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <Button variant="ghost" size="sm" onClick={() => setHistoryMonth(subMonths(historyMonth, 1))}>←</Button>
                <span className="font-medium text-sm">{format(historyMonth, "MMMM yyyy")}</span>
                <Button variant="ghost" size="sm" onClick={() => setHistoryMonth(new Date(historyMonth.getFullYear(), historyMonth.getMonth() + 1, 1))}>→</Button>
              </div>
              <Button variant="outline" size="sm" onClick={handlePrintReport}>
                <Printer className="mr-1.5 h-4 w-4" />
                Print Report
              </Button>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Student</TableHead>
                      {weekdays.map((d) => (
                        <TableHead key={d.toISOString()} className="text-center px-1 min-w-[32px]">
                          <div className="text-[10px]">{format(d, "EEE")}</div>
                          <div className="text-xs font-bold">{format(d, "d")}</div>
                        </TableHead>
                      ))}
                      <TableHead className="text-center">P</TableHead>
                      <TableHead className="text-center">A</TableHead>
                      <TableHead className="text-center">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyLoading ? (
                      <TableRow><TableCell colSpan={weekdays.length + 4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : !scopedStudents?.length ? (
                      <TableRow><TableCell colSpan={weekdays.length + 4} className="text-center py-8 text-muted-foreground">No students found</TableCell></TableRow>
                    ) : scopedStudents.map((s) => {
                      const st = studentStats[s.id] || { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
                      const rate = st.total > 0 ? Math.round(((st.present + st.late) / st.total) * 100) : 0;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="sticky left-0 bg-card z-10 font-medium text-xs whitespace-nowrap">
                            {s.first_name} {s.last_name}
                          </TableCell>
                          {weekdays.map((d) => {
                            const ds = format(d, "yyyy-MM-dd");
                            const isHoliday = historyHolidaySet.has(ds);
                            const status = attendanceMap[s.id]?.[ds] as AttendanceStatus | undefined;
                            return (
                              <TableCell key={ds} className={cn("text-center px-1 py-1", isHoliday && "bg-amber-50 dark:bg-amber-900/10")}>
                                {isHoliday && !status ? (
                                  <Badge variant="outline" className="text-[9px] h-5 w-5 p-0 justify-center rounded-full bg-amber-100 text-amber-700 border-amber-300">
                                    H
                                  </Badge>
                                ) : status ? (
                                  <Badge variant="outline" className={cn("text-[9px] h-5 w-5 p-0 justify-center rounded-full", statusConfig[status].className)}>
                                    {statusConfig[status].short}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground/30 text-xs">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-xs text-green-600 font-medium">{st.present}</TableCell>
                          <TableCell className="text-center text-xs text-red-600 font-medium">{st.absent}</TableCell>
                          <TableCell className="text-center text-xs font-bold">{rate}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
  return embedded ? content : <DashboardLayout>{content}</DashboardLayout>;
}
