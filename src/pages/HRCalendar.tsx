import { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Plus, Search, Trash2, CalendarIcon, PartyPopper, Gift, Flag, RefreshCw, ChevronLeft, ChevronRight, Loader2, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths,
  isSameMonth, isSameDay, parseISO, isWithinInterval,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const EVENT_TYPE_LABELS: Record<string, string> = {
  holiday: "Public Holiday",
  reward_holiday: "Reward Holiday",
  term_holiday: "Term Holiday",
  assessment: "Assessment",
  ptm: "Parent-Teacher Meeting",
  event: "School Event",
  training: "Staff Training",
  custom: "Custom",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  holiday: "bg-destructive/15 text-destructive border-destructive/30",
  reward_holiday: "bg-warning/10 text-warning border-warning/30",
  term_holiday: "bg-muted/10 text-muted border-muted/30",
  assessment: "bg-warning/10 text-warning border-warning/30",
  ptm: "bg-info/10 text-info border-info/30",
  event: "bg-primary/15 text-primary border-primary/30",
  training: "bg-info/10 text-info border-info/30",
  custom: "bg-secondary text-secondary-foreground border-secondary",
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  holiday: "🏛",
  reward_holiday: "🎁",
  term_holiday: "🏖",
  assessment: "📝",
  ptm: "👨‍👩‍👧",
  event: "📌",
  training: "📚",
  custom: "⚙️",
};

const LEAVE_COLORS = "bg-info/10 text-info border-info/30";

export default function HRCalendar() {
  const { user, role, canManage } = useAuth();
  const canEditCalendar = canManage("/hr-calendar");
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const canFilterMultipleBranches = role === "super_admin" || role === "admin";
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [generatedHolidays, setGeneratedHolidays] = useState<Array<{ name: string; date: string; is_regional: boolean; importToCalendar: boolean; setAsPublic: boolean }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingHolidays, setIsSavingHolidays] = useState(false);
  const [generatePage, setGeneratePage] = useState(1);
  const HOLIDAYS_PER_PAGE = 10;

  // Holiday form state
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState<Date | undefined>();
  const [holidayEndDate, setHolidayEndDate] = useState<Date | undefined>();
  const [holidayIsPaid, setHolidayIsPaid] = useState(true);
  const [holidayAffectsAttendance, setHolidayAffectsAttendance] = useState(true);
  const [holidayIsPublic, setHolidayIsPublic] = useState(true);

  // Event form state
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState<Date | undefined>();
  const [eventEndDate, setEventEndDate] = useState<Date | undefined>();
  const [eventType, setEventType] = useState("event");
  const [eventIsPaid, setEventIsPaid] = useState(true);
  const [eventAffectsAttendance, setEventAffectsAttendance] = useState(false);

  // Edit event state
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editEndDate, setEditEndDate] = useState<Date | undefined>();
  const [editType, setEditType] = useState("event");
  const [editIsPaid, setEditIsPaid] = useState(true);
  const [editAffectsAttendance, setEditAffectsAttendance] = useState(false);

  const openEditDialog = (evt: any) => {
    setEditingEvent(evt);
    setEditName(evt.event_name);
    setEditDate(parseISO(evt.event_date));
    setEditEndDate(evt.end_date ? parseISO(evt.end_date) : undefined);
    const evtType = evt.event_type || (evt.is_public_holiday ? "holiday" : "event");
    setEditType(evtType);
    // Auto-set toggles based on type
    if (["holiday", "reward_holiday"].includes(evtType)) {
      setEditIsPaid(evt.is_paid !== false);
      setEditAffectsAttendance(true);
    } else if (evtType === "term_holiday") {
      setEditIsPaid(true);
      setEditAffectsAttendance(false); // staff still work during term holidays
    } else {
      setEditIsPaid(true);
      setEditAffectsAttendance(false);
    }
    setShowEditDialog(true);
  };

  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: branches = [] } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data, error } = await supabase.from("branches").select("id, name").order("name");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((m: any) => m.branches).filter(Boolean);
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;

  // HR / Superadmin can view events from multiple branches simultaneously.
  // Other roles are limited to the currently-selected branch (existing behaviour).
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);

  // Initialise multi-branch selection to the currently active branch when it changes.
  useEffect(() => {
    if (!canFilterMultipleBranches) return;
    if (branchId && selectedBranchIds.length === 0) {
      setSelectedBranchIds([branchId]);
    }
  }, [branchId, canFilterMultipleBranches, selectedBranchIds.length]);

  const viewBranchIds = useMemo(() => {
    if (canFilterMultipleBranches) return selectedBranchIds;
    return branchId ? [branchId] : [];
  }, [canFilterMultipleBranches, selectedBranchIds, branchId]);

  const toggleBranchFilter = (id: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  // Fetch school holidays (include events that START before month end and END after month start for range overlap)
  const { data: schoolHolidays = [] } = useQuery({
    queryKey: ["hr-school-holidays", monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_holidays")
        .select("*")
        .or(`and(event_date.lte.${monthEnd},end_date.gte.${monthStart}),and(event_date.gte.${monthStart},event_date.lte.${monthEnd})`);
      if (error) throw error;
      return data;
    },
  });

  // Fetch branch events (same range overlap logic)
  const { data: branchEvents = [] } = useQuery({
    queryKey: ["hr-branch-events", viewBranchIds, monthStart, monthEnd],
    queryFn: async () => {
      if (viewBranchIds.length === 0) return [];
      const { data, error } = await supabase
        .from("branch_events")
        .select("*")
        .in("branch_id", viewBranchIds)
        .or(`and(event_date.lte.${monthEnd},end_date.gte.${monthStart}),and(event_date.gte.${monthStart},event_date.lte.${monthEnd})`);
      if (error) throw error;
      return data;
    },
    enabled: viewBranchIds.length > 0,
  });

  // Fetch approved leave requests for this month
  const { data: approvedLeave = [] } = useQuery({
    queryKey: ["hr-approved-leave", viewBranchIds, monthStart, monthEnd],
    queryFn: async () => {
      if (viewBranchIds.length === 0) return [];
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", viewBranchIds);
      const userIds = (memberships ?? []).map((m: any) => m.user_id);
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .in("user_id", userIds)
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart)
        .or("level1_status.eq.approved,level2_status.eq.approved");
      if (error) throw error;
      return data;
    },
    enabled: viewBranchIds.length > 0,
  });

  // Staff profiles for leave display
  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["hr-staff-profiles", viewBranchIds],
    queryFn: async () => {
      if (viewBranchIds.length === 0) return [];
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", viewBranchIds);
      const userIds = (memberships ?? []).map((m: any) => m.user_id);
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
    enabled: viewBranchIds.length > 0,
  });

  const staffMap = useMemo(() => {
    const m = new Map<string, string>();
    staffProfiles.forEach((s: any) => m.set(s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim()));
    return m;
  }, [staffProfiles]);

  // Add holiday mutation
  const addHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!holidayName || !holidayDate) throw new Error("Missing fields");
      const { error } = await supabase.from("branch_events").insert({
        branch_id: branchId,
        event_date: format(holidayDate, "yyyy-MM-dd"),
        end_date: holidayEndDate ? format(holidayEndDate, "yyyy-MM-dd") : null,
        event_name: holidayName,
        event_type: "holiday",
        is_paid: holidayIsPaid,
        affects_attendance: holidayAffectsAttendance,
        created_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-branch-events"] });
      toast({ title: "Holiday added" });
      setShowHolidayDialog(false);
      setHolidayName(""); setHolidayDate(undefined); setHolidayEndDate(undefined);
      setHolidayIsPaid(true); setHolidayAffectsAttendance(true);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add event mutation
  const addEventMutation = useMutation({
    mutationFn: async () => {
      if (!eventName || !eventDate) throw new Error("Missing fields");
      const finalAffectsAttendance = ["holiday", "reward_holiday"].includes(eventType)
        ? true
        : ["term_holiday"].includes(eventType) ? eventAffectsAttendance : false;
      const finalIsPaid = ["holiday", "reward_holiday", "term_holiday"].includes(eventType) ? eventIsPaid : true;
      const { error } = await supabase.from("branch_events").insert({
        branch_id: branchId,
        event_date: format(eventDate, "yyyy-MM-dd"),
        end_date: eventEndDate ? format(eventEndDate, "yyyy-MM-dd") : null,
        event_name: eventName,
        event_type: eventType,
        is_paid: finalIsPaid,
        affects_attendance: finalAffectsAttendance,
        created_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-branch-events"] });
      toast({ title: "Event added" });
      setShowEventDialog(false);
      setEventName(""); setEventDate(undefined); setEventEndDate(undefined);
      setEventType("event"); setEventIsPaid(true); setEventAffectsAttendance(false);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branch_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-branch-events"] });
      toast({ title: "Event deleted" });
    },
  });

  // Delete school holiday mutation
  const deleteSchoolHolidayMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-school-holidays"] });
      toast({ title: "Holiday deleted" });
    },
  });
  const deleteSchoolHoliday = (id: string) => deleteSchoolHolidayMutation.mutate(id);

  const editEventMutation = useMutation({
    mutationFn: async () => {
      if (!editingEvent || !editName || !editDate) throw new Error("Missing fields");
      // Auto-sync affects_attendance based on event type for non-holiday types
      const finalAffectsAttendance = ["holiday", "reward_holiday"].includes(editType)
        ? true
        : ["term_holiday"].includes(editType) ? editAffectsAttendance : false;
      const finalIsPaid = ["holiday", "reward_holiday", "term_holiday"].includes(editType) ? editIsPaid : true;
      const updateData = {
        event_name: editName,
        event_date: format(editDate, "yyyy-MM-dd"),
        end_date: editEndDate ? format(editEndDate, "yyyy-MM-dd") : null,
        event_type: editType,
        is_paid: finalIsPaid,
        affects_attendance: finalAffectsAttendance,
      };
      if (editingEvent.source === "school") {
        const { error } = await supabase.from("school_holidays").update({
          ...updateData,
          is_public_holiday: editType === "holiday",
        } as any).eq("id", editingEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branch_events").update(updateData as any).eq("id", editingEvent.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-branch-events"] });
      queryClient.invalidateQueries({ queryKey: ["hr-school-holidays"] });
      toast({ title: "Event updated" });
      setShowEditDialog(false);
      setEditingEvent(null);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleGenerateHolidays = async () => {
    setIsGenerating(true);
    setGeneratedHolidays([]);
    setGeneratePage(1);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-holiday-calendar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ year: generateYear, country: "Malaysia" }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const holidays = (result.holidays || []).map((h: any) => ({
        ...h,
        importToCalendar: true,
        setAsPublic: !h.is_regional,
      }));
      setGeneratedHolidays(holidays);
    } catch (e: any) {
      toast({ title: "Error generating holidays", description: e.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Save generated holidays to school_holidays
  const handleSaveGeneratedHolidays = async () => {
    const toImport = generatedHolidays.filter((h) => h.importToCalendar);
    if (toImport.length === 0) {
      toast({ title: "No holidays selected", description: "Toggle 'Import to Calendar' for holidays you want to add.", variant: "destructive" });
      return;
    }
    setIsSavingHolidays(true);
    try {
      // Find or get academic year for the branch
      const { data: academicYears } = await supabase
        .from("academic_years")
        .select("id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .limit(1);
      
      let academicYearId = academicYears?.[0]?.id;
      
      if (!academicYearId) {
        // Create a default academic year
        const { data: newYear, error: yearError } = await supabase
          .from("academic_years")
          .insert({
            branch_id: branchId,
            year_name: `${generateYear}`,
            start_date: `${generateYear}-01-01`,
            end_date: `${generateYear}-12-31`,
            is_active: true,
            created_by: user!.id,
          })
          .select("id")
          .single();
        if (yearError) throw yearError;
        academicYearId = newYear.id;
      }

      // Delete existing holidays for this year to avoid duplicates
      const { error: deleteError } = await supabase
        .from("school_holidays")
        .delete()
        .eq("academic_year_id", academicYearId)
        .gte("event_date", `${generateYear}-01-01`)
        .lte("event_date", `${generateYear}-12-31`);
      if (deleteError) throw deleteError;

      // Insert new holidays
      const inserts = toImport.map((h) => ({
        academic_year_id: academicYearId!,
        event_date: h.date,
        event_name: h.name,
        is_public_holiday: h.setAsPublic,
        is_paid: true,
        affects_attendance: true,
      }));

      const { error } = await supabase.from("school_holidays").insert(inserts);
      if (error) throw error;

      toast({ title: "Holiday calendar updated", description: `${toImport.length} holidays saved for ${generateYear}.` });
      setShowGenerateDialog(false);
      setGeneratedHolidays([]);
      queryClient.invalidateQueries({ queryKey: ["hr-school-holidays"] });
    } catch (e: any) {
      toast({ title: "Error saving holidays", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingHolidays(false);
    }
  };

  const toggleHolidayImport = (index: number) => {
    setGeneratedHolidays((prev) => prev.map((h, i) => i === index ? { ...h, importToCalendar: !h.importToCalendar } : h));
  };

  const toggleHolidayPublic = (index: number) => {
    setGeneratedHolidays((prev) => prev.map((h, i) => i === index ? { ...h, setAsPublic: !h.setAsPublic } : h));
  };

  const paginatedHolidays = generatedHolidays.slice((generatePage - 1) * HOLIDAYS_PER_PAGE, generatePage * HOLIDAYS_PER_PAGE);
  const totalPages = Math.ceil(generatedHolidays.length / HOLIDAYS_PER_PAGE);

  // Calendar grid data
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOffset = getDay(startOfMonth(currentMonth)); // 0=Sun

  // Helper to expand a date-range row into individual date keys
  const expandDateRange = (eventDate: string, endDate: string | null): string[] => {
    if (!endDate) return [eventDate];
    const start = parseISO(eventDate);
    const end = parseISO(endDate);
    if (end < start) return [eventDate];
    return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"));
  };

  // Build day data map
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { holidays: any[]; events: any[]; leave: any[] }>();
    daysInMonth.forEach((d) => {
      const key = format(d, "yyyy-MM-dd");
      map.set(key, { holidays: [], events: [], leave: [] });
    });
    schoolHolidays.forEach((h: any) => {
      const dates = expandDateRange(h.event_date, h.end_date);
      dates.forEach(dateStr => {
        const entry = map.get(dateStr);
        if (entry) entry.holidays.push(h);
      });
    });
    branchEvents.forEach((e: any) => {
      const dates = expandDateRange(e.event_date, e.end_date);
      dates.forEach(dateStr => {
        const entry = map.get(dateStr);
        if (entry) entry.events.push(e);
      });
    });
    approvedLeave.forEach((l: any) => {
      const start = parseISO(l.start_date);
      const end = parseISO(l.end_date);
      daysInMonth.forEach((d) => {
        if (isWithinInterval(d, { start, end })) {
          const key = format(d, "yyyy-MM-dd");
          const entry = map.get(key);
          if (entry) entry.leave.push(l);
        }
      });
    });
    return map;
  }, [daysInMonth, schoolHolidays, branchEvents, approvedLeave]);

  // Sidebar data
  // Only holiday/reward_holiday go to Holidays tab; everything else goes to Events
  const STAFF_HOLIDAY_TYPES = ["holiday", "reward_holiday"];
  const getEffectiveType = (h: any) => h.event_type || (h.is_public_holiday ? "holiday" : "event");

  const allHolidays = [
    ...schoolHolidays.filter((h: any) => STAFF_HOLIDAY_TYPES.includes(getEffectiveType(h))).map((h: any) => ({ ...h, source: "school" })),
    ...branchEvents.filter((e: any) => STAFF_HOLIDAY_TYPES.includes(e.event_type)).map((e: any) => ({ ...e, source: "branch" })),
  ].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));

  const allEvents = [
    ...schoolHolidays.filter((h: any) => !STAFF_HOLIDAY_TYPES.includes(getEffectiveType(h))).map((h: any) => ({ ...h, source: "school" })),
    ...branchEvents.filter((e: any) => !STAFF_HOLIDAY_TYPES.includes(e.event_type)).map((e: any) => ({ ...e, source: "branch" })),
  ].sort((a: any, b: any) => (a.event_date || "").localeCompare(b.event_date || ""));

  const filteredHolidays = allHolidays.filter((h) =>
    h.event_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredEvents = allEvents.filter((e: any) =>
    e.event_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const leaveTypeAbbrev: Record<string, string> = {
    annual: "AL", medical: "MC", unpaid: "UL", emergency: "EL",
    maternity: "ML", paternity: "PL", hospitalization: "HL",
    compassionate: "CL", replacement: "RL",
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">HR Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">Staff lens: leave, training and HR-impacting flags on holidays. Public holidays and term breaks are owned by the <a href="/yearly-planner" className="text-primary underline">Annual Planner</a>.</p>
          </div>
          <div className="flex items-center gap-2">
            {canEditCalendar && (
              <>
                <Button variant="secondary" onClick={() => setShowGenerateDialog(true)}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Generate Holiday {new Date().getFullYear()}
                </Button>
                <Button variant="outline" onClick={() => setShowHolidayDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Holiday
                </Button>
                <Button onClick={() => setShowEventDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Event
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Branch filter — HR / Superadmin only. Single horizontal row, scrolls on small screens. */}
        {canFilterMultipleBranches && branches.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
                <span className="text-xs font-medium text-muted-foreground shrink-0">Branches:</span>
                <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
                  <Checkbox
                    checked={branches.length > 0 && selectedBranchIds.length === branches.length}
                    onCheckedChange={(checked) =>
                      setSelectedBranchIds(checked ? branches.map((b: any) => b.id) : [])
                    }
                  />
                  <span>All Branches</span>
                </label>
                {branches.map((b: any) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
                    <Checkbox
                      checked={selectedBranchIds.includes(b.id)}
                      onCheckedChange={() => toggleBranchFilter(b.id)}
                    />
                    <span>{b.name}</span>
                  </label>
                ))}
                {selectedBranchIds.length === 0 && (
                  <span className="text-[11px] text-muted-foreground shrink-0">Select at least one branch to view events.</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>←</Button>
                  <CardTitle className="text-lg">{format(currentMonth, "MMMM yyyy")}</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>→</Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-px mb-1">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                  ))}
                </div>
                {/* Calendar cells */}
                <div className="grid grid-cols-7 gap-px">
                  {/* Empty offset cells */}
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[100px] bg-muted/30 rounded-sm" />
                  ))}
                  {daysInMonth.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const data = dayDataMap.get(key);
                    const isToday = isSameDay(day, new Date());
                    const isWeekend = getDay(day) === 0 || getDay(day) === 6;
                    const hasHoliday = data?.holidays.some((h: any) => (h.event_type || (h.is_public_holiday ? "holiday" : "")) === "holiday") || data?.events.some((e: any) => e.event_type === "holiday");

                    return (
                      <div
                        key={key}
                        className={cn(
                          "min-h-[100px] border rounded-sm p-1 cursor-pointer transition-colors hover:bg-accent/30",
                          isToday && "ring-2 ring-primary",
                          isWeekend && "bg-muted/20",
                          hasHoliday && "bg-destructive/5",
                        )}
                        onClick={() => setSelectedDay(day)}
                      >
                        <div className={cn(
                          "text-sm font-medium mb-1",
                          isToday ? "text-primary font-bold" : "text-foreground",
                        )}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          {data?.holidays.map((h: any, i: number) => {
                            const hType = h.event_type || (h.is_public_holiday ? "holiday" : "event");
                            return (
                              <div key={`h-${i}`} className={cn("text-[10px] px-1 py-0.5 rounded truncate", EVENT_TYPE_COLORS[hType] || EVENT_TYPE_COLORS.holiday)} title={h.event_name}>
                                {EVENT_TYPE_ICONS[hType] || "🏛"} {h.event_name}
                              </div>
                            );
                          })}
                          {data?.events.map((e: any, i: number) => (
                            <div key={`e-${i}`} className={cn("text-[10px] px-1 py-0.5 rounded truncate", EVENT_TYPE_COLORS[e.event_type] || "bg-muted")} title={e.event_name}>
                              {EVENT_TYPE_ICONS[e.event_type] || "📌"} {e.event_name}
                            </div>
                          ))}
                          {data?.leave.slice(0, 3).map((l: any, i: number) => (
                            <div key={`l-${i}`} className={cn("text-[10px] px-1 py-0.5 rounded truncate", LEAVE_COLORS)}>
                              {staffMap.get(l.user_id)?.split(" ")[0] ?? "Staff"} ({leaveTypeAbbrev[l.leave_type] || l.leave_type})
                            </div>
                          ))}
                          {(data?.leave.length ?? 0) > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">+{(data?.leave.length ?? 0) - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t">
                  {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
                    <div key={type} className="flex items-center gap-1.5 text-xs">
                      <div className={cn("w-3 h-3 rounded border", EVENT_TYPE_COLORS[type])} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded bg-info/10 border border-info/30" />
                    <span className="text-muted-foreground">Staff Leave</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search holidays & events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Activity Panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Activity — {format(currentMonth, "MMM yyyy")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="holidays">
                  <TabsList className="w-full rounded-none border-b bg-transparent">
                    <TabsTrigger value="holidays" className="flex-1 text-xs">Holidays ({filteredHolidays.length})</TabsTrigger>
                    <TabsTrigger value="events" className="flex-1 text-xs">Events ({filteredEvents.length})</TabsTrigger>
                    <TabsTrigger value="leave" className="flex-1 text-xs">Leave ({approvedLeave.length})</TabsTrigger>
                  </TabsList>
                  <ScrollArea className="h-[400px]">
                    <TabsContent value="holidays" className="p-3 space-y-2 mt-0">
                      {filteredHolidays.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No holidays this month</p>
                      ) : filteredHolidays.map((h: any, i: number) => (
                        <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{h.event_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(h.event_date), "EEE, dd MMM")}
                              {h.end_date && h.end_date !== h.event_date && ` — ${format(parseISO(h.end_date), "EEE, dd MMM")}`}
                            </p>
                            <div className="flex gap-1 mt-1">
                              {h.is_paid !== false && <Badge variant="outline" className="text-[10px] py-0">Paid</Badge>}
                              {h.is_paid === false && <Badge variant="outline" className="text-[10px] py-0 border-destructive text-destructive">Unpaid</Badge>}
                              {h.source === "school" && (() => {
                                const hType = h.event_type || (h.is_public_holiday ? "holiday" : "event");
                                return <Badge variant="outline" className={cn("text-[10px] py-0", EVENT_TYPE_COLORS[hType])}>{EVENT_TYPE_LABELS[hType] || "Public"}</Badge>;
                              })()}
                            </div>
                          </div>
                          {canEditCalendar && (
                            <div className="flex gap-0.5 shrink-0">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditDialog(h)}><Pencil className="h-3 w-3" /></Button>
                              {h.source === "branch" ? (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteEventMutation.mutate(h.id)}><Trash2 className="h-3 w-3" /></Button>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteSchoolHoliday(h.id)}><Trash2 className="h-3 w-3" /></Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="events" className="p-3 space-y-2 mt-0">
                      {filteredEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No events this month</p>
                      ) : filteredEvents.map((e: any) => {
                        const eType = e.event_type || getEffectiveType(e);
                        return (
                        <div key={e.id || `evt-${e.event_date}-${e.event_name}`} className="flex items-start justify-between gap-2 rounded-md border p-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.event_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(e.event_date), "EEE, dd MMM")}
                              {e.end_date && e.end_date !== e.event_date && ` — ${format(parseISO(e.end_date), "EEE, dd MMM")}`}
                            </p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className={cn("text-[10px] py-0", EVENT_TYPE_COLORS[eType])}>{EVENT_TYPE_LABELS[eType] || eType}</Badge>
                              {e.affects_attendance && <Badge variant="outline" className="text-[10px] py-0">No Clock-in</Badge>}
                            </div>
                          </div>
                          {canEditCalendar && (
                            <div className="flex gap-0.5 shrink-0">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditDialog({ ...e, source: e.source || (e.academic_year_id ? "school" : "branch") })}><Pencil className="h-3 w-3" /></Button>
                              {e.source === "school" || e.academic_year_id ? (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteSchoolHoliday(e.id)}><Trash2 className="h-3 w-3" /></Button>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteEventMutation.mutate(e.id)}><Trash2 className="h-3 w-3" /></Button>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </TabsContent>
                    <TabsContent value="leave" className="p-3 space-y-2 mt-0">
                      {approvedLeave.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No approved leave this month</p>
                      ) : approvedLeave.map((l: any) => (
                        <div key={l.id} className="rounded-md border p-2">
                          <p className="text-sm font-medium">{staffMap.get(l.user_id) || "Staff"}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(l.start_date), "dd MMM")} — {format(parseISO(l.end_date), "dd MMM")} · {l.days}d
                          </p>
                          <Badge variant="outline" className="text-[10px] py-0 mt-1">{leaveTypeAbbrev[l.leave_type] || l.leave_type}</Badge>
                        </div>
                      ))}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </CardContent>
            </Card>

            {/* Selected Day Detail */}
            {selectedDay && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{format(selectedDay, "EEEE, dd MMM yyyy")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(() => {
                    const data = dayDataMap.get(format(selectedDay, "yyyy-MM-dd"));
                    if (!data || (data.holidays.length === 0 && data.events.length === 0 && data.leave.length === 0)) {
                      return <p className="text-sm text-muted-foreground">No activity</p>;
                    }
                    return (
                      <>
                        {data.holidays.map((h: any, i: number) => {
                          const hType = h.event_type || (h.is_public_holiday ? "holiday" : "event");
                          return (
                            <div key={`sd-h-${i}`} className="text-sm flex items-center gap-2">
                              <span>{EVENT_TYPE_ICONS[hType] || "🏛"}</span>
                              <span>{h.event_name}</span>
                              <Badge variant="outline" className={cn("text-[10px] py-0", EVENT_TYPE_COLORS[hType])}>{EVENT_TYPE_LABELS[hType]}</Badge>
                            </div>
                          );
                        })}
                        {data.events.map((e: any, i: number) => (
                          <div key={`sd-e-${i}`} className="text-sm flex items-center gap-2">
                            {e.event_type === "reward_holiday" ? <Gift className="h-3.5 w-3.5 text-warning" /> : <PartyPopper className="h-3.5 w-3.5 text-primary" />}
                            <span>{e.event_name}</span>
                            {!e.is_paid && <Badge variant="outline" className="text-[10px] py-0 border-destructive text-destructive">Unpaid</Badge>}
                          </div>
                        ))}
                        {data.leave.map((l: any, i: number) => (
                          <div key={`sd-l-${i}`} className="text-sm flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 text-info" />
                            <span>{staffMap.get(l.user_id) || "Staff"} — {leaveTypeAbbrev[l.leave_type] || l.leave_type}</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add Holiday Dialog */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Holiday</DialogTitle>
            <DialogDescription>Add a public or branch-specific holiday to the calendar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Holiday Name</Label>
              <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="e.g. Hari Raya Aidilfitri" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !holidayDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {holidayDate ? format(holidayDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={holidayDate} onSelect={setHolidayDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !holidayEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {holidayEndDate ? format(holidayEndDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={holidayEndDate} onSelect={setHolidayEndDate} disabled={(date) => holidayDate ? date < holidayDate : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="holiday-paid">Paid Holiday</Label>
              <Switch id="holiday-paid" checked={holidayIsPaid} onCheckedChange={setHolidayIsPaid} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="holiday-attendance">No Clock-in Required</Label>
              <Switch id="holiday-attendance" checked={holidayAffectsAttendance} onCheckedChange={setHolidayAffectsAttendance} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHolidayDialog(false)}>Cancel</Button>
            <Button onClick={() => addHolidayMutation.mutate()} disabled={!holidayName || !holidayDate || addHolidayMutation.isPending}>
              {addHolidayMutation.isPending ? "Adding..." : "Add Holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Event Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
            <DialogDescription>Add a branch event, reward holiday, or custom entry</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Event Name</Label>
              <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Staff Appreciation Day" />
            </div>
            <div>
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="term_holiday">🏖 Term Holiday / School Break</SelectItem>
                  <SelectItem value="reward_holiday">🎁 Reward Holiday</SelectItem>
                  <SelectItem value="assessment">📝 Assessment Week</SelectItem>
                  <SelectItem value="ptm">👨‍👩‍👧 Parent-Teacher Meeting</SelectItem>
                  <SelectItem value="event">📌 School Event</SelectItem>
                  <SelectItem value="training">📚 Staff Training</SelectItem>
                  <SelectItem value="custom">⚙️ Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !eventDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {eventDate ? format(eventDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={eventDate} onSelect={setEventDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !eventEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {eventEndDate ? format(eventEndDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={eventEndDate} onSelect={setEventEndDate} disabled={(date) => eventDate ? date < eventDate : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {["holiday", "reward_holiday", "term_holiday"].includes(eventType) && (
              <>
                <div className="flex items-center justify-between">
                  <Label htmlFor="event-paid">Paid Holiday</Label>
                  <Switch id="event-paid" checked={eventIsPaid} onCheckedChange={setEventIsPaid} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="event-attendance">No Clock-in Required</Label>
                  <Switch id="event-attendance" checked={eventAffectsAttendance} onCheckedChange={setEventAffectsAttendance} />
                </div>
              </>
            )}
            {!["holiday", "reward_holiday", "term_holiday"].includes(eventType) && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                This event type is a normal working day — staff clock-in is required as usual.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEventDialog(false)}>Cancel</Button>
            <Button onClick={() => addEventMutation.mutate()} disabled={!eventName || !eventDate || addEventMutation.isPending}>
              {addEventMutation.isPending ? "Adding..." : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Holiday Calendar Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Update Holiday {generateYear}</DialogTitle>
            <DialogDescription>Generate and manage public holidays for a specific year. Toggle which holidays to import and set as public.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 mb-4">
            <Label>Year</Label>
            <Select value={String(generateYear)} onValueChange={(v) => setGenerateYear(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGenerateHolidays} disabled={isGenerating}>
              {isGenerating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</> : <><RefreshCw className="h-4 w-4 mr-1" /> Generate</>}
            </Button>
          </div>

          {generatedHolidays.length > 0 && (
            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[130px] text-center">Import to Calendar</TableHead>
                    <TableHead className="w-[130px] text-center">Set as Public Holiday</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHolidays.map((h, i) => {
                    const globalIndex = (generatePage - 1) * HOLIDAYS_PER_PAGE + i;
                    return (
                      <TableRow key={globalIndex}>
                        <TableCell className="text-muted-foreground">{globalIndex + 1}</TableCell>
                        <TableCell className="font-medium">{h.name}</TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={h.date}
                            className="h-8 w-[140px] text-sm"
                            onChange={(e) => {
                              const updated = [...generatedHolidays];
                              updated[globalIndex] = { ...updated[globalIndex], date: e.target.value };
                              setGeneratedHolidays(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={h.importToCalendar} onCheckedChange={() => toggleHolidayImport(globalIndex)} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={h.setAsPublic} onCheckedChange={() => toggleHolidayPublic(globalIndex)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {generatedHolidays.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={generatePage <= 1} onClick={() => setGeneratePage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button key={i} variant={generatePage === i + 1 ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setGeneratePage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={generatePage >= totalPages} onClick={() => setGeneratePage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isGenerating && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Generating holiday calendar...
            </div>
          )}

          {!isGenerating && generatedHolidays.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Click "Generate" to fetch holidays for {generateYear}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveGeneratedHolidays} disabled={isSavingHolidays || generatedHolidays.length === 0}>
              {isSavingHolidays ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>Update event details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Event Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Event Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">🏛 Public Holiday</SelectItem>
                  <SelectItem value="reward_holiday">🎁 Reward Holiday</SelectItem>
                  <SelectItem value="term_holiday">🏖 Term Holiday</SelectItem>
                  <SelectItem value="assessment">📝 Assessment</SelectItem>
                  <SelectItem value="ptm">👨‍👩‍👧 Parent-Teacher Meeting</SelectItem>
                  <SelectItem value="event">📌 School Event</SelectItem>
                  <SelectItem value="training">📚 Staff Training</SelectItem>
                  <SelectItem value="custom">⚙️ Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editDate ? format(editDate, "PPP") : "Start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editDate} onSelect={setEditDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editEndDate ? format(editEndDate, "PPP") : "End date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editEndDate} onSelect={setEditEndDate} disabled={(date) => editDate ? date < editDate : false} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {["holiday", "reward_holiday", "term_holiday"].includes(editType) && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Paid Holiday</Label>
                  <Switch checked={editIsPaid} onCheckedChange={setEditIsPaid} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>No Clock-in Required</Label>
                  <Switch checked={editAffectsAttendance} onCheckedChange={setEditAffectsAttendance} />
                </div>
              </>
            )}
            {!["holiday", "reward_holiday", "term_holiday"].includes(editType) && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                This event type is a normal working day — staff clock-in is required as usual.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={() => editEventMutation.mutate()} disabled={!editName || !editDate || editEventMutation.isPending}>
              {editEventMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
