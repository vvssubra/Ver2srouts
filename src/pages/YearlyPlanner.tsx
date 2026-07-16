import { useState, useEffect, useCallback, useRef } from "react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { format, addDays } from "date-fns";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, Sparkles, Plus, Trash2, Loader2, CalendarDays, GraduationCap,
  Save, Flag, Pencil, Users, CheckCircle2, ArrowRight, Download,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import YearlyThemesPrintView from "@/components/YearlyThemesPrintView";

const MALAYSIAN_HOLIDAYS_2026 = [
  { event_date: "2026-01-01", event_name: "New Year's Day", is_public_holiday: true },
  { event_date: "2026-01-29", event_name: "Thaipusam", is_public_holiday: true },
  { event_date: "2026-02-17", event_name: "Chinese New Year", is_public_holiday: true },
  { event_date: "2026-02-18", event_name: "Chinese New Year (Day 2)", is_public_holiday: true },
  { event_date: "2026-03-20", event_name: "Hari Raya Aidilfitri", is_public_holiday: true },
  { event_date: "2026-03-21", event_name: "Hari Raya Aidilfitri (Day 2)", is_public_holiday: true },
  { event_date: "2026-04-03", event_name: "Nuzul Al-Quran", is_public_holiday: true },
  { event_date: "2026-05-01", event_name: "Labour Day", is_public_holiday: true },
  { event_date: "2026-05-10", event_name: "Vesak Day", is_public_holiday: true },
  { event_date: "2026-05-27", event_name: "Hari Raya Haji", is_public_holiday: true },
  { event_date: "2026-06-01", event_name: "Agong's Birthday", is_public_holiday: true },
  { event_date: "2026-06-17", event_name: "Awal Muharram", is_public_holiday: true },
  { event_date: "2026-08-26", event_name: "Maulidur Rasul", is_public_holiday: true },
  { event_date: "2026-08-31", event_name: "Merdeka Day", is_public_holiday: true },
  { event_date: "2026-09-16", event_name: "Malaysia Day", is_public_holiday: true },
  { event_date: "2026-10-20", event_name: "Deepavali", is_public_holiday: true },
  { event_date: "2026-12-25", event_name: "Christmas Day", is_public_holiday: true },
];

export default function YearlyPlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);

  const activeTab = searchParams.get("tab") || "setup";
  const urlYearId = searchParams.get("year") || "";

  const setActiveTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  const setSelectedAcademicYearId = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("year", id); else next.delete("year");
      return next;
    }, { replace: true });
  };

  const [yearName, setYearName] = useState("2026/2027");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date("2026-01-05"));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date("2026-11-20"));
  const { selectedBranchId } = useGlobalBranch();

  const [newHolidayDate, setNewHolidayDate] = useState<Date | undefined>();
  const [newHolidayEndDate, setNewHolidayEndDate] = useState<Date | undefined>();
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayEventType, setNewHolidayEventType] = useState("holiday");

  const [editTheme, setEditTheme] = useState<any>(null);
  const [editMainTheme, setEditMainTheme] = useState("");
  const [editSubTheme, setEditSubTheme] = useState("");
  const [editRationale, setEditRationale] = useState("");

  const [editYearOpen, setEditYearOpen] = useState(false);
  const [editYearName, setEditYearName] = useState("");
  const [editStartDate, setEditStartDate] = useState<Date | undefined>();
  const [editEndDate, setEditEndDate] = useState<Date | undefined>();

  const [termView, setTermView] = useState("all");

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmType, setDeleteConfirmType] = useState<"single" | "bulk" | "clearAll">("single");
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const branchId = selectedBranchId || memberships?.[0]?.branch_id;

  // School name for PDF
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings-name", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("school_display_name").eq("branch_id", branchId!).maybeSingle();
      if (data) return data as any;
      const { data: branch } = await supabase.from("branches").select("name").eq("id", branchId!).single();
      return { school_display_name: (branch as any)?.name || "" };
    },
    enabled: !!branchId,
  });
  const schoolName = (branchSettings as any)?.school_display_name || "";

  const handleDownloadPDF = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Please allow popups to download PDF", variant: "destructive" });
      return;
    }
    const content = printRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>Yearly Themes - ${activeAcademicYear?.year_name || yearName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-page-break { page-break-before: always; }
          }
        </style>
      </head><body>${content}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  // Age groups
  const { data: ageGroups = [] } = useQuery({
    queryKey: ["age-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("age_groups").select("*").order("sort_order");
      return (data as any[]) ?? [];
    },
  });

  // Academic years
  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("branch_id", branchId!)
        .order("start_date", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!branchId,
  });

  useEffect(() => {
    if (!urlYearId && academicYears.length > 0) {
      setSelectedAcademicYearId(academicYears[0].id);
    }
  }, [academicYears, urlYearId]);

  const activeAcademicYear = academicYears.find((ay: any) => ay.id === urlYearId) || academicYears[0];

  // Holidays
  const { data: holidays = [] } = useQuery({
    queryKey: ["school-holidays", activeAcademicYear?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_holidays")
        .select("*")
        .eq("academic_year_id", activeAcademicYear!.id)
        .order("event_date");
      return (data as any[]) ?? [];
    },
    enabled: !!activeAcademicYear?.id,
  });

  // Themes
  const { data: themes = [] } = useQuery({
    queryKey: ["yearly-themes", activeAcademicYear?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("yearly_themes")
        .select("*")
        .eq("academic_year_id", activeAcademicYear!.id)
        .order("sort_order");
      return (data as any[]) ?? [];
    },
    enabled: !!activeAcademicYear?.id,
  });

  // Curriculum year plans for this branch + year
  const { data: yearPlans = [] } = useQuery({
    queryKey: ["curriculum-year-plans", branchId, activeAcademicYear?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_year_plans")
        .select("*, age_groups(code, label)")
        .eq("branch_id", branchId!)
        .eq("academic_year_id", activeAcademicYear!.id)
        .order("created_at");
      return (data as any[]) ?? [];
    },
    enabled: !!branchId && !!activeAcademicYear?.id,
  });

  // Create academic year
  const createAcademicYear = useMutation({
    mutationFn: async () => {
      if (!branchId || !user || !startDate || !endDate) throw new Error("Missing fields");
      const { data, error } = await supabase
        .from("academic_years")
        .insert({
          branch_id: branchId,
          year_name: yearName,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
          is_active: true,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      setSelectedAcademicYearId(data.id);
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast({ title: "Academic Year Created ✅", description: `${yearName} has been set up.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete academic year
  const deleteAcademicYear = useMutation({
    mutationFn: async (yearId: string) => {
      await supabase.from("yearly_themes").delete().eq("academic_year_id", yearId);
      await supabase.from("school_holidays").delete().eq("academic_year_id", yearId);
      const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedAcademicYearId("");
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["yearly-themes"] });
      queryClient.invalidateQueries({ queryKey: ["school-holidays"] });
      toast({ title: "Academic Year Deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Edit academic year
  const editAcademicYear = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear?.id || !editStartDate || !editEndDate) throw new Error("Missing fields");
      const { error } = await supabase
        .from("academic_years")
        .update({ year_name: editYearName, start_date: format(editStartDate, "yyyy-MM-dd"), end_date: format(editEndDate, "yyyy-MM-dd") } as any)
        .eq("id", activeAcademicYear.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditYearOpen(false);
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast({ title: "Academic Year Updated ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditYear = () => {
    if (!activeAcademicYear) return;
    setEditYearName(activeAcademicYear.year_name);
    setEditStartDate(new Date(activeAcademicYear.start_date));
    setEditEndDate(new Date(activeAcademicYear.end_date));
    setEditYearOpen(true);
  };

  // Holidays
  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear?.id || !newHolidayDate || !newHolidayName) throw new Error("Missing fields");
      const { error } = await supabase.from("school_holidays").insert({
        academic_year_id: activeAcademicYear.id,
        event_date: format(newHolidayDate, "yyyy-MM-dd"),
        end_date: newHolidayEndDate ? format(newHolidayEndDate, "yyyy-MM-dd") : null,
        event_name: newHolidayName,
        event_type: newHolidayEventType,
        is_public_holiday: newHolidayEventType === "holiday",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewHolidayDate(undefined);
      setNewHolidayEndDate(undefined);
      setNewHolidayName("");
      setNewHolidayEventType("holiday");
      queryClient.invalidateQueries({ queryKey: ["school-holidays"] });
      toast({ title: "Holiday Added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["school-holidays"] }),
  });

  const autoPopulateHolidays = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear?.id) throw new Error("No academic year selected");
      const rows = MALAYSIAN_HOLIDAYS_2026.map((h) => ({
        academic_year_id: activeAcademicYear.id,
        event_date: h.event_date,
        event_name: h.event_name,
        is_public_holiday: h.is_public_holiday,
      }));
      const { error } = await supabase.from("school_holidays").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-holidays"] });
      toast({ title: "Malaysian Holidays Added 🇲🇾" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Generate AI yearly plan
  const generatePlan = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear?.id || !branchId) throw new Error("No academic year");
      const { data, error } = await supabase.functions.invoke("generate-yearly-plan", {
        body: { academic_year_id: activeAcademicYear.id, age_group: "3-6", branch_id: branchId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yearly-themes"] });
      toast({ title: "AI Curriculum Generated! 🎓✨" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Update theme
  const updateTheme = useMutation({
    mutationFn: async () => {
      if (!editTheme?.id) throw new Error("No theme selected");
      const { error } = await supabase.from("yearly_themes")
        .update({ main_theme: editMainTheme, sub_theme: editSubTheme, rationale: editRationale } as any)
        .eq("id", editTheme.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditTheme(null);
      queryClient.invalidateQueries({ queryKey: ["yearly-themes"] });
      toast({ title: "Theme Updated ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditTheme = (theme: any) => {
    if (selectMode) {
      toggleThemeSelection(theme.id);
      return;
    }
    setEditTheme(theme);
    setEditMainTheme(theme.main_theme);
    setEditSubTheme(theme.sub_theme || "");
    setEditRationale(theme.rationale || "");
  };

  // Delete single theme
  const deleteSingleTheme = useMutation({
    mutationFn: async (themeId: string) => {
      await supabase.from("lesson_plans").update({ yearly_theme_id: null } as any).eq("yearly_theme_id", themeId);
      const { error } = await supabase.from("yearly_themes").delete().eq("id", themeId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditTheme(null);
      setSingleDeleteId(null);
      setDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["yearly-themes"] });
      toast({ title: "Theme Deleted 🗑️" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete multiple themes (bulk or clear all)
  const deleteMultipleThemes = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("lesson_plans").update({ yearly_theme_id: null } as any).in("yearly_theme_id", ids);
      const { error } = await supabase.from("yearly_themes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedThemeIds(new Set());
      setSelectMode(false);
      setDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["yearly-themes"] });
      toast({ title: "Themes Deleted 🗑️" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleThemeSelection = (id: string) => {
    setSelectedThemeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirmType === "single" && singleDeleteId) {
      deleteSingleTheme.mutate(singleDeleteId);
    } else if (deleteConfirmType === "bulk") {
      deleteMultipleThemes.mutate(Array.from(selectedThemeIds));
    } else if (deleteConfirmType === "clearAll") {
      deleteMultipleThemes.mutate(themes.map((t: any) => t.id));
    }
  };

  // Create curriculum year plan for a specific age group
  const createYearPlan = useMutation({
    mutationFn: async (ageGroupId: string) => {
      if (!branchId || !activeAcademicYear?.id || !user) throw new Error("Missing data");
      const ag = ageGroups.find((a: any) => a.id === ageGroupId);
      const { error } = await supabase.from("curriculum_year_plans").insert({
        branch_id: branchId,
        academic_year_id: activeAcademicYear.id,
        age_group_id: ageGroupId,
        title: `${activeAcademicYear.year_name} — ${ag?.label || ""}`,
        status: "draft",
        created_by: user.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-year-plans"] });
      toast({ title: "Curriculum Year Plan Created ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateYearPlanStatus = useMutation({
    mutationFn: async ({ planId, status }: { planId: string; status: string }) => {
      const { error } = await supabase.from("curriculum_year_plans")
        .update({ status } as any)
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-year-plans"] });
      toast({ title: "Status Updated" });
    },
  });

  // Delete curriculum year plan state
  const [deletePlanConfirmOpen, setDeletePlanConfirmOpen] = useState(false);
  const [deletePlanTarget, setDeletePlanTarget] = useState<{ id: string; label: string } | null>(null);

  const deleteYearPlan = useMutation({
    mutationFn: async (planId: string) => {
      // 1. Unlink lesson plans
      await supabase.from("lesson_plans").update({ year_plan_id: null } as any).eq("year_plan_id", planId);
      // 2. Delete month plans (cascades to week plans)
      await supabase.from("curriculum_month_plans").delete().eq("year_plan_id", planId);
      // 3. Delete the year plan
      const { error } = await supabase.from("curriculum_year_plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeletePlanConfirmOpen(false);
      setDeletePlanTarget(null);
      queryClient.invalidateQueries({ queryKey: ["curriculum-year-plans"] });
      toast({ title: "Curriculum Plan Deleted 🗑️" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getWeekHolidays = (weekStart: string, weekEnd: string) => {
    return holidays.filter((h: any) => {
      const hStart = h.event_date;
      const hEnd = h.end_date || h.event_date;
      return hEnd >= weekStart && hStart <= weekEnd;
    });
  };

  const totalThemeWeeks = themes.length;
  const weeksPerTerm = Math.ceil(totalThemeWeeks / 4);
  const t1End = weeksPerTerm;
  const t2End = weeksPerTerm * 2;
  const t3End = weeksPerTerm * 3;

  const filteredThemes = termView === "all"
    ? themes
    : themes.filter((t: any) => {
        if (termView === "term1") return t.week_number >= 1 && t.week_number <= t1End;
        if (termView === "term2") return t.week_number >= t1End + 1 && t.week_number <= t2End;
        if (termView === "term3") return t.week_number >= t2End + 1 && t.week_number <= t3End;
        if (termView === "term4") return t.week_number >= t3End + 1;
        return true;
      });

  const yearPlansByAge = ageGroups.map((ag: any) => ({
    ageGroup: ag,
    plan: yearPlans.find((yp: any) => yp.age_group_id === ag.id),
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Master Yearly Theme Planner</h1>
            <p className="text-muted-foreground">The master timeline for your academic year — themes, holidays, term breaks and school events. All other calendars read from here. Day-to-day view: <a href="/school-calendar" className="text-primary underline">School Calendar</a>.</p>
          </div>
          {activeAcademicYear && (
            <Badge variant="outline" className="text-sm px-3 py-1">
              <CalendarDays className="h-4 w-4 mr-1" />
              {activeAcademicYear.year_name}
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="setup">📅 Year Setup</TabsTrigger>
            <TabsTrigger value="board">🎓 Themes</TabsTrigger>
            <TabsTrigger value="plans">📋 Curriculum Plans</TabsTrigger>
          </TabsList>

          {/* TAB 1: Academic Year Setup — preserved from original */}
          <TabsContent value="setup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" /> Academic Year Configuration
                </CardTitle>
                <CardDescription>Define the school year dates and select your branch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {academicYears.length > 0 && (
                  <div>
                    <Label>Existing Academic Years</Label>
                    <div className="flex gap-2">
                      <Select value={urlYearId} onValueChange={setSelectedAcademicYearId}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Select existing year" /></SelectTrigger>
                        <SelectContent>
                          {academicYears.map((ay: any) => (
                            <SelectItem key={ay.id} value={ay.id}>
                              {ay.year_name} ({ay.start_date} — {ay.end_date})
                              {ay.is_active && " ✓ Active"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {activeAcademicYear && (
                        <>
                          <Button variant="outline" size="icon" className="shrink-0" onClick={openEditYear}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive" size="icon" className="shrink-0"
                            onClick={() => {
                              if (window.confirm(`Delete "${activeAcademicYear.year_name}"? This will also remove all associated themes and holidays.`)) {
                                deleteAcademicYear.mutate(activeAcademicYear.id);
                              }
                            }}
                            disabled={deleteAcademicYear.isPending}
                          >
                            {deleteAcademicYear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <Separator />
                <p className="text-sm font-medium text-foreground">Or create a new academic year:</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Year Name</Label>
                    <Input value={yearName} onChange={(e) => setYearName(e.target.value)} placeholder="2026/2027" />
                  </div>
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <Button onClick={() => createAcademicYear.mutate()} disabled={createAcademicYear.isPending || !yearName || !startDate || !endDate}>
                  {createAcademicYear.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" /> Create Academic Year
                </Button>
              </CardContent>
            </Card>

            {/* Holiday Manager */}
            {activeAcademicYear && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Flag className="h-5 w-5" /> School Holidays & Events</CardTitle>
                      <CardDescription>Manage holidays for {activeAcademicYear.year_name}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => autoPopulateHolidays.mutate()} disabled={autoPopulateHolidays.isPending}>
                      {autoPopulateHolidays.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      🇲🇾 Auto-Populate Malaysian Holidays
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="min-w-[140px]">
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newHolidayDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newHolidayDate ? format(newHolidayDate, "PPP") : "Start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={newHolidayDate} onSelect={setNewHolidayDate} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="min-w-[140px]">
                      <Label>End Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newHolidayEndDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newHolidayEndDate ? format(newHolidayEndDate, "PPP") : "End date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={newHolidayEndDate} onSelect={setNewHolidayEndDate} disabled={(date) => newHolidayDate ? date < newHolidayDate : false} className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <Label>Event Name</Label>
                      <Input value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="e.g. Hari Raya Aidilfitri" />
                    </div>
                    <div className="min-w-[160px]">
                      <Label>Type</Label>
                      <Select value={newHolidayEventType} onValueChange={setNewHolidayEventType}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="holiday">🏛 Public Holiday</SelectItem>
                          <SelectItem value="term_holiday">🏖 Term Holiday</SelectItem>
                          <SelectItem value="assessment">📝 Assessment</SelectItem>
                          <SelectItem value="ptm">👨‍👩‍👧 PTM</SelectItem>
                          <SelectItem value="event">📌 School Event</SelectItem>
                          <SelectItem value="training">📚 Staff Training</SelectItem>
                          <SelectItem value="custom">⚙️ Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => addHoliday.mutate()} disabled={!newHolidayDate || !newHolidayName} size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                  {holidays.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {holidays.map((h: any) => (
                            <TableRow key={h.id}>
                              <TableCell className="font-mono text-sm">
                                {h.event_date}
                                {h.end_date && h.end_date !== h.event_date && ` — ${h.end_date}`}
                              </TableCell>
                              <TableCell>{h.event_name}</TableCell>
                              <TableCell>
                                <Badge variant={h.event_type === "holiday" || h.is_public_holiday ? "default" : "secondary"}>
                                  {h.event_type === "holiday" ? "🏛 Public" : h.event_type === "term_holiday" ? "🏖 Term" : h.event_type === "assessment" ? "📝 Assessment" : h.event_type === "ptm" ? "👨‍👩‍👧 PTM" : h.event_type === "event" ? "📌 Event" : h.event_type === "training" ? "📚 Training" : h.is_public_holiday ? "🏛 Public" : "📌 Event"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => deleteHoliday.mutate(h.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No holidays added yet.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB 2: Master Curriculum Board — preserved */}
          <TabsContent value="board" className="space-y-6">
            {!activeAcademicYear ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Academic Year Set Up</p>
                  <p className="text-muted-foreground mb-4">Please create an academic year in the Setup tab first.</p>
                  <Button onClick={() => setActiveTab("setup")}>Go to Setup</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => generatePlan.mutate()} disabled={generatePlan.isPending} className="gap-2">
                    {generatePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {generatePlan.isPending ? "Generating..." : "Generate AI Yearly Plan"}
                  </Button>
                  {themes.length > 0 && (
                    <>
                      <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
                        <Download className="h-4 w-4" /> Download PDF
                      </Button>
                      <Button
                        variant={selectMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setSelectMode(!selectMode); setSelectedThemeIds(new Set()); }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {selectMode ? "Cancel Select" : "Select"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => { setDeleteConfirmType("clearAll"); setDeleteConfirmOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Clear All
                      </Button>
                    </>
                  )}
                  <div className="ml-auto flex gap-2 flex-wrap">
                    <Button variant={termView === "all" ? "default" : "outline"} size="sm" onClick={() => setTermView("all")}>All ({totalThemeWeeks})</Button>
                    <Button variant={termView === "term1" ? "default" : "outline"} size="sm" onClick={() => setTermView("term1")}>Term 1 (1-{t1End})</Button>
                    <Button variant={termView === "term2" ? "default" : "outline"} size="sm" onClick={() => setTermView("term2")}>Term 2 ({t1End+1}-{t2End})</Button>
                    <Button variant={termView === "term3" ? "default" : "outline"} size="sm" onClick={() => setTermView("term3")}>Term 3 ({t2End+1}-{t3End})</Button>
                    <Button variant={termView === "term4" ? "default" : "outline"} size="sm" onClick={() => setTermView("term4")}>Term 4 ({t3End+1}-{totalThemeWeeks})</Button>
                  </div>
                </div>

                {/* Bulk action bar */}
                {selectMode && selectedThemeIds.size > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <span className="text-sm font-medium">{selectedThemeIds.size} theme(s) selected</span>
                    <Button size="sm" variant="outline" onClick={() => setSelectedThemeIds(new Set(filteredThemes.map((t: any) => t.id)))}>
                      Select All Visible
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSelectedThemeIds(new Set())}>
                      Deselect All
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { setDeleteConfirmType("bulk"); setDeleteConfirmOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Delete Selected
                    </Button>
                  </div>
                )}

                {themes.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No Curriculum Themes Yet</p>
                      <p className="text-muted-foreground mb-6">Click "Generate AI Yearly Plan" to create a full thematic curriculum.</p>
                      <Button onClick={() => generatePlan.mutate()} disabled={generatePlan.isPending}>
                        {generatePlan.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Generate Now
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredThemes.map((theme: any) => {
                      const weekHolidays = getWeekHolidays(theme.start_date, theme.end_date);
                      const termNum = theme.week_number <= t1End ? 1 : theme.week_number <= t2End ? 2 : theme.week_number <= t3End ? 3 : 4;
                      const termColors: Record<number, string> = {
                        1: "border-l-primary",
                        2: "border-l-secondary",
                        3: "border-l-accent",
                        4: "border-l-[hsl(var(--role-teacher))]",
                      };
                      return (
                        <Card key={theme.id} className={cn("cursor-pointer hover:shadow-md transition-shadow border-l-4 relative", termColors[termNum] || "border-l-primary", selectMode && selectedThemeIds.has(theme.id) && "ring-2 ring-destructive")} onClick={() => openEditTheme(theme)}>
                          {selectMode && (
                            <div className="absolute top-2 right-2 z-10">
                              <Checkbox checked={selectedThemeIds.has(theme.id)} onCheckedChange={() => toggleThemeSelection(theme.id)} onClick={(e) => e.stopPropagation()} />
                            </div>
                          )}
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">Week {theme.week_number}</Badge>
                              <span className="text-xs text-muted-foreground">Term {termNum}</span>
                            </div>
                            <p className="font-semibold text-sm leading-tight">{theme.main_theme}</p>
                            {theme.sub_theme && <p className="text-xs text-muted-foreground">{theme.sub_theme}</p>}
                            <div className="text-xs text-muted-foreground">{theme.start_date} → {theme.end_date}</div>
                            {weekHolidays.length > 0 && (
                              <div className="flex flex-wrap gap-1">{weekHolidays.map((h: any) => (
                                <Badge key={h.id} variant="secondary" className="text-[10px]">🎉 {h.event_name}</Badge>
                              ))}</div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* TAB 3: Curriculum Year Plans per Age Group — NEW */}
          <TabsContent value="plans" className="space-y-6">
            {!activeAcademicYear ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Academic Year Set Up</p>
                  <p className="text-muted-foreground mb-4">Create an academic year first, then set up curriculum plans per age group.</p>
                  <Button onClick={() => setActiveTab("setup")}>Go to Setup</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium">Curriculum Year Plans</span>
                      <span className="text-muted-foreground">— Create one plan per age group for {activeAcademicYear.year_name}. Each plan links to monthly and weekly breakdowns.</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {yearPlansByAge.map(({ ageGroup, plan }: any) => (
                    <Card key={ageGroup.id} className={cn("transition-shadow hover:shadow-md", plan ? "border-primary/30" : "border-dashed")}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            {ageGroup.label}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">{ageGroup.code}</Badge>
                        </div>
                        <CardDescription className="text-xs">
                          {ageGroup.min_age_months}–{ageGroup.max_age_months} months
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {plan ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={plan.status === "active" ? "default" : plan.status === "archived" ? "secondary" : "outline"} className="capitalize">
                                {plan.status}
                              </Badge>
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            </div>
                            <p className="text-sm font-medium">{plan.title}</p>
                            <div className="flex flex-wrap gap-2">
                              {plan.status === "draft" && (
                                <Button size="sm" variant="outline" onClick={() => updateYearPlanStatus.mutate({ planId: plan.id, status: "active" })}>
                                  Activate
                                </Button>
                              )}
                              {plan.status === "active" && (
                                <Button size="sm" variant="outline" onClick={() => updateYearPlanStatus.mutate({ planId: plan.id, status: "archived" })}>
                                  Archive
                                </Button>
                              )}
                              <Button size="sm" variant="default" className="gap-1" onClick={() => {
                                window.location.href = `/curriculum/monthly?yearPlanId=${plan.id}&ageGroup=${ageGroup.code}`;
                              }}>
                                Monthly Plans <ArrowRight className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-1"
                                onClick={() => {
                                  setDeletePlanTarget({ id: plan.id, label: ageGroup.label });
                                  setDeletePlanConfirmOpen(true);
                                }}
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-muted-foreground mb-3">No curriculum plan yet</p>
                            <Button size="sm" onClick={() => createYearPlan.mutate(ageGroup.id)} disabled={createYearPlan.isPending}>
                              {createYearPlan.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                              Create Plan
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Theme Dialog — preserved */}
        <Dialog open={!!editTheme} onOpenChange={(o) => !o && setEditTheme(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Week {editTheme?.week_number} Theme</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Main Theme</Label>
                <Input value={editMainTheme} onChange={(e) => setEditMainTheme(e.target.value)} />
              </div>
              <div>
                <Label>Sub-Theme</Label>
                <Input value={editSubTheme} onChange={(e) => setEditSubTheme(e.target.value)} />
              </div>
              <div>
                <Label>Rationale</Label>
                <Textarea value={editRationale} onChange={(e) => setEditRationale(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setSingleDeleteId(editTheme?.id);
                  setDeleteConfirmType("single");
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete Theme
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditTheme(null)}>Cancel</Button>
                <Button onClick={() => updateTheme.mutate()} disabled={updateTheme.isPending}>
                  {updateTheme.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <ConfirmDeleteDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={
            deleteConfirmType === "single" ? "Delete Theme" :
            deleteConfirmType === "bulk" ? `Delete ${selectedThemeIds.size} Theme(s)` :
            "Clear All Themes"
          }
          description={
            deleteConfirmType === "single" ? "This will permanently delete this theme. Any linked lesson plans will be unlinked." :
            deleteConfirmType === "bulk" ? `This will permanently delete ${selectedThemeIds.size} selected theme(s). Linked lesson plans will be unlinked.` :
            `This will permanently delete ALL ${themes.length} themes for this academic year. Linked lesson plans will be unlinked.`
          }
          confirmLabel={deleteConfirmType === "clearAll" ? "Clear All" : "Delete"}
          confirmText={deleteConfirmType === "clearAll" ? activeAcademicYear?.year_name : undefined}
          isPending={deleteSingleTheme.isPending || deleteMultipleThemes.isPending}
          onConfirm={handleDeleteConfirm}
        />

        {/* Delete Curriculum Plan Confirm Dialog */}
        <ConfirmDeleteDialog
          open={deletePlanConfirmOpen}
          onOpenChange={setDeletePlanConfirmOpen}
          title={`Delete Curriculum Plan — ${deletePlanTarget?.label || ""}`}
          description={`This will permanently delete the curriculum year plan for "${deletePlanTarget?.label || ""}",  including all linked monthly plans, weekly plans, and unlink any lesson plans. Type the age group label to confirm.`}
          confirmLabel="Delete Plan"
          confirmText={deletePlanTarget?.label}
          isPending={deleteYearPlan.isPending}
          onConfirm={() => deletePlanTarget && deleteYearPlan.mutate(deletePlanTarget.id)}
        />

        {/* Edit Academic Year Dialog — preserved */}
        <Dialog open={editYearOpen} onOpenChange={setEditYearOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Academic Year</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Year Name</Label>
                <Input value={editYearName} onChange={(e) => setEditYearName(e.target.value)} />
              </div>
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start", !editStartDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editStartDate ? format(editStartDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editStartDate} onSelect={setEditStartDate} className="p-3 pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start", !editEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editEndDate ? format(editEndDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editEndDate} onSelect={setEditEndDate} className="p-3 pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditYearOpen(false)}>Cancel</Button>
              <Button onClick={() => editAcademicYear.mutate()} disabled={editAcademicYear.isPending}>
                {editAcademicYear.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Hidden print view */}
      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <YearlyThemesPrintView
          ref={printRef}
          yearName={activeAcademicYear?.year_name || yearName}
          schoolName={schoolName}
          themes={themes}
          holidays={holidays}
          totalWeeks={themes.length}
        />
      </div>
    </DashboardLayout>
  );
}
