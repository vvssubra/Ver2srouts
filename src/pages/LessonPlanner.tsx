import { useState, useCallback, useEffect, useMemo } from "react";
import { format, addDays, isWeekend, startOfWeek, addWeeks } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import SavedPlans from "@/components/SavedPlans";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { InterventionGroup } from "@/components/InterventionGroupsCard";
import PlanDisplay from "@/components/lesson-planner/PlanDisplay";
import SubjectWeeklyPlanner from "@/components/lesson-planner/SubjectWeeklyPlanner";
import SubjectLessonPreparation from "@/components/lesson-planner/SubjectLessonPreparation";
import ManualPlanBuilder, { createEmptyActivity } from "@/components/lesson-planner/ManualPlanBuilder";
import type {
  GeneratedPlan, Worksheet, ViewMode, PlanType,
  LearningArea,
} from "@/components/lesson-planner/types";
import {
  Sparkles, Clock, Users, Palette, CalendarDays,
  CalendarIcon, Loader2, Save, ArrowLeft, Library,
  Pencil, Plus, Trash2, FileText, ExternalLink,
  AlertTriangle, Target, Layers, BookOpen, Lightbulb,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

// Extract a user-friendly error message from a Supabase Edge Function error.
// FunctionsHttpError exposes the original Response in `error.context`, which
// carries the JSON body the function returned (e.g. { error: "AI credits exhausted." }).
async function extractEdgeError(error: any, fallback: string): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
    if (ctx?.body?.error) return String(ctx.body.error);
    if (typeof error?.message === "string" && error.message.trim()) {
      // Hide the generic wrapper if a richer message exists
      if (error.message.includes("non-2xx") && ctx?.status === 402) {
        return "AI credits exhausted. Please top up your AI workspace credits.";
      }
      if (error.message.includes("non-2xx") && ctx?.status === 429) {
        return "Rate limit reached. Please wait a moment and try again.";
      }
      return error.message;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export default function LessonPlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Read URL params for pre-fill from Weekly Planner
  const urlParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      monthPlanId: params.get("monthPlanId") || "",
      weekPlanId: params.get("weekPlanId") || "",
      theme: params.get("theme") || "",
      ageGroup: params.get("ageGroup") || "",
      weekStart: params.get("weekStart") || "",
    };
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("create");
  const [planType, setPlanType] = useState<PlanType>("subject");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [ageGroup, setAgeGroup] = useState(urlParams.ageGroup || "5+");
  const [theme, setTheme] = useState(urlParams.theme || "");
  const [selectedThemeBankId, setSelectedThemeBankId] = useState<string | null>(null);
  const [duration, setDuration] = useState("1 week");
  const [methodology, setMethodology] = useState("Auto-detect from school settings");
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>([]);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [recommendedWorksheets, setRecommendedWorksheets] = useState<Worksheet[]>([]);
  const [activeDay, setActiveDay] = useState("0");
  const [showChat, setShowChat] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [domainFocus, setDomainFocus] = useState("");
  const [weeklyResult, setWeeklyResult] = useState<any>(null);
  const [interventionGroups, setInterventionGroups] = useState<InterventionGroup[]>([]);
  const [teacherNotes, setTeacherNotes] = useState("");
  const [resourceLinks, setResourceLinks] = useState<{ label: string; url: string }[]>([]);
  const [newResourceLabel, setNewResourceLabel] = useState("");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [manualDays, setManualDays] = useState<any[]>([
    { day: 1, theme_focus: "", activities: [createEmptyActivity()] }
  ]);
  // Readiness signal from the SubjectLessonPreparation panel — the Generate
  // Lesson Plan button stays disabled until all sessions have a skill focus.
  const [subjectPrep, setSubjectPrep] = useState<{
    sessionCount: number;
    missingSkillCount: number;
    hasUnsaved: boolean;
    ready: boolean;
  }>({ sessionCount: 0, missingSkillCount: 0, hasUnsaved: false, ready: false });

  const getNextMonday = () => {
    if (urlParams.weekStart) return new Date(urlParams.weekStart);
    const now = new Date();
    return startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  };
  const [startDate, setStartDate] = useState<Date>(getNextMonday());

  const computeDayDate = (dayIndex: number): Date => {
    let date = startDate;
    let count = 0;
    while (count < dayIndex) {
      date = addDays(date, 1);
      if (!isWeekend(date)) count++;
    }
    return date;
  };

  // ─── Queries ───
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
  // Honor the global branch selector so admins/franchisees see classes from
  // the branch they're currently viewing. Fall back to the first membership
  // when "all" is selected or nothing has been chosen yet.
  const { selectedBranchId } = useGlobalBranch();
  const branchId =
    selectedBranchId && selectedBranchId !== "all"
      ? selectedBranchId
      : memberships?.[0]?.branch_id;

  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);

  const { data: branchClassesAll = [] } = useQuery({
    queryKey: ["classes", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group, branch_id")
        .eq("branch_id", branchId!)
        .eq("is_active", true)
        .order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Teachers only see their assigned classes; other roles see every class.
  const branchClasses = useMemo(() => {
    if (!isTeacher || !teacherClassIds) return branchClassesAll;
    return branchClassesAll.filter((c: any) => teacherClassIds.includes(c.id));
  }, [branchClassesAll, isTeacher, teacherClassIds]);

  const selectedClass = branchClasses.find((c: any) => c.id === selectedClassId);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    const cls = branchClasses.find((c: any) => c.id === classId);
    if (cls) setAgeGroup(cls.age_group);
  };

  const { data: subjectMap = [] } = useQuery({
    queryKey: ["subject-map"],
    queryFn: async () => {
      const { data } = await supabase.from("subject_standard_map").select("*").order("subject_name");
      return (data as any[]) ?? [];
    },
  });


  const { data: learningAreas = [] } = useQuery({
    queryKey: ["learning-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_areas")
        .select("id, code, name_ms, name_en")
        .order("sort_order");
      if (error) throw error;
      return data as LearningArea[];
    },
  });

  const { data: developmentDomains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase
        .from("development_domains")
        .select("id, name, description")
        .order("sort_order");
      return (data as any[])?.map(d => ({ ...d, domain_name: d.name })) ?? [];
    },
  });

  const { data: currentYearlyTheme } = useQuery({
    queryKey: ["current-yearly-theme", branchId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("yearly_themes")
        .select("*, academic_years!inner(is_active, branch_id)")
        .eq("academic_years.is_active", true)
        .eq("academic_years.branch_id", branchId!)
        .lte("start_date", today)
        .gte("end_date", today)
        .limit(1)
        .single();
      return data as any;
    },
    enabled: !!branchId,
  });

  const { data: themeBankEntries = [] } = useQuery({
    queryKey: ["theme-bank-entries", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("theme_bank")
        .select("id, theme_name, month_number, age_group")
        .order("month_number");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // ─── Auto-populate theme from Weekly Planner context ───
  const weekStarting = format(startOfWeek(startDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  // Fetch subjects from published timetable (daily_timetable_slots) for selected class + week
  const { data: classSlotSubjects = [] } = useQuery({
    queryKey: ["class-slot-subjects", selectedClassId, weekStarting],
    queryFn: async () => {
      const weekEnd = format(addDays(new Date(weekStarting), 4), "yyyy-MM-dd");
      const { data: dailySlots } = await supabase
        .from("daily_timetable_slots" as any)
        .select("subject_name")
        .eq("class_id", selectedClassId!)
        .gte("slot_date", weekStarting)
        .lte("slot_date", weekEnd);

      if (dailySlots && dailySlots.length > 0) {
        const unique = [...new Set((dailySlots as any[]).map((s: any) => s.subject_name))].filter(
          (n: string) => !["Assembly", "Break"].includes(n)
        );
        return unique.sort();
      }

      // Fallback to template slots
      const { data: templateSlots } = await supabase
        .from("timetable_slots")
        .select("subject_name")
        .eq("class_id", selectedClassId!);
      const unique = [...new Set((templateSlots ?? []).map((s: any) => s.subject_name))].filter(
        (n) => !["Assembly", "Break"].includes(n)
      );
      return unique.sort();
    },
    enabled: !!selectedClassId,
  });

  const hasNoTimetable = !!selectedClassId && classSlotSubjects.length === 0;

  const { data: weeklyPlanContext } = useQuery({
    queryKey: ["weekly-plan-context", selectedClassId, weekStarting, branchId, urlParams.monthPlanId, urlParams.weekPlanId],
    queryFn: async () => {
      const weekDate = new Date(weekStarting);
      const monthNum = weekDate.getMonth() + 1;

      // Primary source: curriculum_month_plans (has focus_outcomes, year_plan_id)
      let curriculumMonthPlanId: string | null = urlParams.monthPlanId || null;
      let curriculumWeekPlanId: string | null = urlParams.weekPlanId || null;
      let monthlyThemeName: string | null = null;
      let monthlyBigIdea: string | null = null;
      let focusOutcomes: string[] = [];
      let themeBankId: string | null = null;

      // If we have a monthPlanId from URL, use it directly
      if (curriculumMonthPlanId) {
        const { data: cmp } = await supabase
          .from("curriculum_month_plans")
          .select("id, theme, big_idea, focus_outcomes, theme_bank_id")
          .eq("id", curriculumMonthPlanId)
          .single();
        if (cmp) {
          monthlyThemeName = (cmp as any).theme || null;
          monthlyBigIdea = (cmp as any).big_idea || null;
          focusOutcomes = Array.isArray((cmp as any).focus_outcomes) ? (cmp as any).focus_outcomes : [];
          themeBankId = (cmp as any).theme_bank_id || null;
        }
      } else if (selectedClassId && branchId) {
        // Auto-detect from class age group
        const { data: cmp } = await supabase
          .from("curriculum_month_plans")
          .select("id, theme, big_idea, focus_outcomes, theme_bank_id")
          .eq("branch_id", branchId)
          .eq("month_number", monthNum)
          .limit(1);
        if ((cmp as any[])?.length > 0) {
          const plan = (cmp as any[])[0];
          curriculumMonthPlanId = plan.id;
          monthlyThemeName = plan.theme || null;
          monthlyBigIdea = plan.big_idea || null;
          focusOutcomes = Array.isArray(plan.focus_outcomes) ? plan.focus_outcomes : [];
          themeBankId = plan.theme_bank_id || null;
        }
      }

      // Find curriculum_week_plan if not passed via URL
      if (!curriculumWeekPlanId && curriculumMonthPlanId) {
        const dayOfMonth = weekDate.getDate();
        const weekNum = Math.min(Math.ceil(dayOfMonth / 7), 5);
        const { data: cwp } = await supabase
          .from("curriculum_week_plans")
          .select("id, title, focus_area, description")
          .eq("month_plan_id", curriculumMonthPlanId)
          .eq("week_number", weekNum)
          .maybeSingle();
        if (cwp) curriculumWeekPlanId = (cwp as any).id;
      }

      // Fetch weekly focus from curriculum_week_plan
      let weeklyFocusTitle: string | null = null;
      let weeklyObjectives: string[] = [];
      let weeklyFocusObjectives: any[] = [];
      if (curriculumWeekPlanId) {
        const { data: wp } = await supabase
          .from("curriculum_week_plans")
          .select("title, focus_area, description, key_questions")
          .eq("id", curriculumWeekPlanId)
          .single();
        if (wp) {
          weeklyFocusTitle = (wp as any).title || (wp as any).focus_area || null;
          if ((wp as any).description) weeklyObjectives = [(wp as any).description];
        }
        // Get linked term objectives
        const { data: wfo } = await supabase
          .from("weekly_focus_objectives")
          .select("priority, lesson_objectives(code, title, development_domains(name))")
          .eq("week_plan_id", curriculumWeekPlanId);
        weeklyFocusObjectives = (wfo as any[]) ?? [];
      }

      // Fallback: also check theme bank weekly focuses
      let provocations: string[] = [];
      if (themeBankId) {
        const dayOfMonth = weekDate.getDate();
        const weekNum = Math.min(Math.ceil(dayOfMonth / 7), 4);
        const { data: wf } = await supabase
          .from("theme_weekly_focuses" as any)
          .select("focus_title, key_questions")
          .eq("theme_bank_id", themeBankId)
          .eq("week_number", weekNum)
          .limit(1);
        const focus = (wf as any[])?.[0];
        if (focus) {
          if (!weeklyFocusTitle) weeklyFocusTitle = focus.focus_title;
          provocations = Array.isArray(focus.key_questions) ? focus.key_questions : [];
        }
      }

      return {
        monthlyTheme: monthlyThemeName || monthlyBigIdea || null,
        weeklyFocusTitle,
        weeklyObjectives,
        provocations,
        observationFocus: null,
        monthPlanId: curriculumMonthPlanId,
        weekPlanId: curriculumWeekPlanId,
        themeBankId,
        weeklyFocusObjectives,
      };
    },
    enabled: !!selectedClassId && !!branchId,
  });

  useEffect(() => {
    if (weeklyPlanContext && !theme && !selectedThemeBankId) {
      if (weeklyPlanContext.monthlyTheme) {
        setTheme(weeklyPlanContext.monthlyTheme);
      }
      if (weeklyPlanContext.themeBankId) {
        setSelectedThemeBankId(weeklyPlanContext.themeBankId);
      }
    }
  }, [weeklyPlanContext, theme, selectedThemeBankId]);

  const selectedMapping = subjectMap.find((s: any) => s.subject_name === selectedSubject);
  const autoTunjang = selectedMapping?.kp2026_learning_area || "";

  const { data: gapAlerts = [] } = useQuery({
    queryKey: ["gap-alerts", selectedClassId, selectedSubject],
    queryFn: async () => {
      if (!selectedClassId) return [];
      let q = supabase
        .from("student_gap_analysis")
        .select("*, students(first_name, last_name)")
        .eq("class_id", selectedClassId)
        .in("remediation_status", ["pending", "in-progress"]);
      const { data } = await q;
      if (!selectedSubject) return data ?? [];
      return (data ?? []).filter((g: any) => !g.gap_subject || g.gap_subject.toLowerCase() === selectedSubject.toLowerCase());
    },
    enabled: !!selectedClassId && planType === "subject",
  });

  const fetchWorksheetsByTags = async (plan: GeneratedPlan) => {
    const allStandards = plan.days.flatMap(d =>
      d.activities.flatMap(a => a.standards_addressed || [])
    );
    const uniqueTags = [...new Set(allStandards)].filter(Boolean);
    if (uniqueTags.length === 0) return;
    try {
      const { data } = await supabase.rpc("search_worksheets_by_tags", {
        search_tags: uniqueTags,
        match_count: 5,
      });
      if (data && data.length > 0) setRecommendedWorksheets(data as Worksheet[]);
    } catch { /* worksheets optional */ }
  };

  // ─── Mutations ───
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-lesson-plan", {
        body: {
          ageGroup, theme, duration,
          learningAreaIds: selectedAreaIds,
          standardIds: selectedStandardIds,
          methodology,
          teacherNotes: teacherNotes.trim() || undefined,
          resourceLinks: resourceLinks.length > 0 ? resourceLinks : undefined,
          planMode: "enrichment",
          classId: selectedClassId || undefined,
          branchId: branchId || undefined,
          monthPlanId: weeklyPlanContext?.monthPlanId || undefined,
          weekPlanId: weeklyPlanContext?.weekPlanId || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedPlan(data.plan);
      setRecommendedWorksheets(data.recommendedWorksheets || []);
      setActiveDay("0");
      if (!data.recommendedWorksheets?.length && data.plan) fetchWorksheetsByTags(data.plan);
      toast({ title: "Rancangan Pelajaran Dijana! ✨", description: "Your lesson plan has been generated successfully." });
    },
    onError: async (error: any) => {
      const msg = await extractEdgeError(error, "Failed to generate lesson plan");
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    },
  });

  const generateWeeklyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-weekly-subject-plan", {
        body: {
          class_id: selectedClassId,
          subject_name: selectedSubject,
          theme,
          week_starting: weekStarting,
          user_id: user?.id,
          domain_focus: domainFocus || undefined,
          teacher_notes: teacherNotes.trim() || undefined,
          weekly_focus_title: weeklyPlanContext?.weeklyFocusTitle || undefined,
          weekly_objectives: weeklyPlanContext?.weeklyObjectives || undefined,
          monthly_theme: weeklyPlanContext?.monthlyTheme || undefined,
          provocations: weeklyPlanContext?.provocations || undefined,
          month_plan_id: weeklyPlanContext?.monthPlanId || undefined,
          week_plan_id: weeklyPlanContext?.weekPlanId || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setWeeklyResult(data);
      setInterventionGroups(data?.interventionGroups || []);
      if (data?.weekPlan?.days) {
        const wsMonday = startOfWeek(startDate, { weekStartsOn: 1 });
        const converted: GeneratedPlan = {
          title: `${selectedSubject} — Week of ${weekStarting}`,
          overview: `Weekly ${selectedSubject} plan for ${selectedClass?.class_name || "class"} (${ageGroup} years) with theme "${theme}"`,
          days: data.weekPlan.days.map((day: any) => {
            const dayOffset = (day.day_of_week || 1) - 1;
            const actualDate = addDays(wsMonday, dayOffset);
            return {
              day: day.day_of_week,
              date: format(actualDate, "yyyy-MM-dd"),
              theme_focus: format(actualDate, "EEE d/M"),
              activities: (day.activities || []).map((act: any) => ({
                name: act.name || "",
                name_ms: act.name_ms || "",
                duration_minutes: act.duration_minutes || 30,
                learning_area: act.learning_area || selectedSubject,
                standards_addressed: act.standards_addressed || [],
                description: act.description || "",
                materials: act.materials || [],
                teacher_notes: act.teacher_notes || "",
                expected_outcomes: act.expected_outcomes || "",
                differentiation_strategies: act.differentiation_strategies,
                provocation_questions: act.provocation_questions,
                observation_cues: act.observation_cues,
                learning_objective: act.learning_objective,
                procedure: act.procedure,
                book_page: act.book_page,
                gap_interventions: day.gap_interventions || [],
              })),
              completed: false,
            };
          }),
          assessment_checklist: [],
        };
        setGeneratedPlan(converted);
        fetchWorksheetsByTags(converted);
      }
      toast({ title: "Weekly plan generated! ✨", description: `${selectedSubject} plan for the week is ready.` });
    },
    onError: async (e: any) => {
      const msg = await extractEdgeError(e, "Failed to generate weekly subject plan");
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedPlan || !user) throw new Error("No plan to save");
      const planWithDates = {
        ...generatedPlan,
        days: generatedPlan.days.map((d, i) => ({
          ...d,
          date: format(computeDayDate(i), "yyyy-MM-dd"),
        })),
      };
      const { data, error } = await supabase.from("lesson_plans").insert({
        user_id: user.id,
        branch_id: branchId || null,
        title: planWithDates.title || theme,
        age_group: ageGroup,
        theme,
        duration,
        methodology,
        learning_area_ids: selectedAreaIds,
        standard_ids: selectedStandardIds,
        generated_plan: planWithDates as any,
        teacher_notes: teacherNotes || null,
        resource_links: resourceLinks.length > 0 ? resourceLinks : [],
        start_date: format(startDate, "yyyy-MM-dd"),
        class_id: selectedClassId || null,
        yearly_theme_id: currentYearlyTheme?.id || null,
        theme_bank_id: selectedThemeBankId || null,
        plan_mode: planType === "enrichment" ? "ai_enrichment" : "ai_subject",
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      setCurrentPlanId(data.id);
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      if (user) {
        supabase.from("notifications").insert({
          user_id: user.id,
          title: "Lesson Plan Saved",
          message: `Your lesson plan "${generatedPlan?.title || theme}" has been saved successfully.`,
          type: "general",
          action_url: "/lesson-planner",
        }).then(() => {});
      }
      toast({ title: "Disimpan! ✅", description: "Lesson plan saved. Edits will now auto-save." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (updatedPlan: GeneratedPlan) => {
      if (!currentPlanId) throw new Error("No plan ID to update");
      const { error } = await supabase
        .from("lesson_plans")
        .update({ generated_plan: updatedPlan as any, title: updatedPlan.title })
        .eq("id", currentPlanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      toast({ title: "Dikemas kini! ✅", description: "Plan updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdatePlan = useCallback((updatedPlan: GeneratedPlan) => {
    setGeneratedPlan(updatedPlan);
    if (currentPlanId) updatePlanMutation.mutate(updatedPlan);
  }, [currentPlanId]);

  const canGenerate = planType === "enrichment"
    ? (theme.trim().length > 0)
    : planType === "manual"
    ? false
    : (
        !!selectedClassId &&
        !!selectedSubject &&
        theme.trim().length > 0 &&
        subjectPrep.ready &&
        !subjectPrep.hasUnsaved
      );

  const isGenerating = planType === "enrichment"
    ? generateMutation.isPending
    : generateWeeklyMutation.isPending;

  const handleGenerate = () => {
    if (planType === "enrichment") generateMutation.mutate();
    else generateWeeklyMutation.mutate();
  };

  const handleSaveManualPlan = async () => {
    if (!user) return;
    const daysWithDates = manualDays.map((d: any, i: number) => ({
      ...d,
      date: format(computeDayDate(i), "yyyy-MM-dd"),
    }));
    const manualPlan: GeneratedPlan = {
      title: theme || "Manual Lesson Plan",
      overview: teacherNotes || "",
      days: daysWithDates,
      assessment_checklist: [],
    };
    try {
      const { data, error } = await supabase.from("lesson_plans").insert({
        user_id: user.id,
        branch_id: branchId || null,
        title: manualPlan.title,
        age_group: ageGroup,
        theme,
        duration,
        methodology: "Manual",
        learning_area_ids: selectedAreaIds,
        standard_ids: selectedStandardIds,
        generated_plan: manualPlan as any,
        plan_mode: "manual",
        teacher_notes: teacherNotes || null,
        resource_links: resourceLinks.length > 0 ? resourceLinks : [],
        start_date: format(startDate, "yyyy-MM-dd"),
        class_id: selectedClassId || null,
        yearly_theme_id: currentYearlyTheme?.id || null,
        theme_bank_id: selectedThemeBankId || null,
      } as any).select().single();
      if (error) throw error;
      setCurrentPlanId((data as any).id);
      setGeneratedPlan(manualPlan);
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      toast({ title: "Manual plan saved! ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleViewSaved = (plan: any) => {
    setGeneratedPlan(plan.generated_plan);
    setTheme(plan.theme);
    setAgeGroup(plan.age_group);
    setDuration(plan.duration);
    setCurrentPlanId(plan.id || null);
    setActiveDay("0");
    setViewMode("view");
  };

  const handlePrintPlan = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !generatedPlan) return;
    const days = generatedPlan.days || [];
    const checklist = generatedPlan.assessment_checklist || [];
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${generatedPlan.title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; font-size: 13px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 16px; background: #f3f3f3; padding: 6px 10px; margin: 18px 0 10px; }
      .meta { display: flex; gap: 12px; font-size: 11px; color: #555; margin: 8px 0 16px; }
      .meta span { border: 1px solid #ccc; padding: 2px 8px; border-radius: 4px; }
      .activity { border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 12px; }
      .activity h3 { font-size: 13px; margin: 0; display: inline; }
      .activity .sub { font-size: 10px; color: #666; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
      th { background: #f9f9f9; }
      .footer { text-align: center; font-size: 9px; color: #aaa; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; }
      @media print { body { padding: 12px; } }
    </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px;">
      <h1>${generatedPlan.title}</h1>
      <p style="font-size:12px;color:#666;">${generatedPlan.overview || ""}</p>
      <div class="meta" style="justify-content:center;">
        <span>Umur: ${ageGroup} tahun</span>
        <span>Tema: ${theme}</span>
        <span>Tempoh: ${duration}</span>
      </div>
    </div>
    ${days.map((day: any) => `
      <h2>${day.date ? new Date(day.date + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Hari ' + day.day}: ${day.theme_focus}</h2>
      ${(day.activities || []).map((act: any) => `
        <div class="activity">
          <h3>${act.name}</h3> <span class="sub">(${act.name_ms}) · ${act.duration_minutes} min · ${act.learning_area}</span>
          <p>${act.description}</p>
          ${act.standards_addressed?.length ? `<p class="sub"><b>Standard:</b> ${act.standards_addressed.join(", ")}</p>` : ""}
          ${act.materials?.length ? `<p class="sub"><b>Bahan:</b> ${act.materials.join(", ")}</p>` : ""}
          ${act.teacher_notes ? `<p class="sub"><em>📝 ${act.teacher_notes}</em></p>` : ""}
          ${act.expected_outcomes ? `<p class="sub">✅ ${act.expected_outcomes}</p>` : ""}
        </div>
      `).join("")}
    `).join("")}
    ${checklist.length ? `
      <h2>📋 Senarai Semak Penilaian</h2>
      <table><thead><tr><th>Kod</th><th>Indikator</th><th>Skala</th></tr></thead>
      <tbody>${checklist.map((item: any) => `<tr><td>${item.standard_code}</td><td>${item.indicator}</td><td>${(item.rating_scale || []).join(" / ")}</td></tr>`).join("")}</tbody></table>
    ` : ""}
    <div class="footer">Dijana oleh AI Lesson Planner · ${new Date().toLocaleDateString("ms-MY")}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const planContext = generatedPlan ? {
    title: generatedPlan.title,
    theme,
    ageGroup,
    duration,
    planSummary: generatedPlan.overview + "\n\nDays: " +
      (generatedPlan.days || []).map((d) =>
        `Day ${d.day} (${d.theme_focus}): ${d.activities.map((a) => a.name).join(", ")}`
      ).join("\n"),
    standard_codes: (generatedPlan.days || []).flatMap((d) =>
      d.activities.flatMap((a) => a.standards_addressed || [])
    ),
  } : { title: "", theme, ageGroup, duration, planSummary: "", standard_codes: [] };

  const hasWeeklyContext = weeklyPlanContext && (weeklyPlanContext.monthlyTheme || weeklyPlanContext.weeklyFocusTitle);

  // ─── RENDER ───
  return (
    <DashboardLayout>
      <BackToCommandCenter tab="lessons" />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Lesson Planner
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create curriculum-aligned lesson plans with AI or manually
            </p>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger value="create" className="text-xs px-3 h-7">
                <Sparkles className="h-3 w-3 mr-1" />Create
              </TabsTrigger>
              <TabsTrigger value="library" className="text-xs px-3 h-7">
                <Library className="h-3 w-3 mr-1" />My Plans
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {viewMode === "library" && <SavedPlans onViewPlan={handleViewSaved} />}

        {viewMode === "view" && generatedPlan && (
          <div>
            <Button variant="ghost" size="sm" className="mb-3" onClick={() => setViewMode("library")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to My Plans
            </Button>
            <PlanDisplay
              plan={generatedPlan} activeDay={activeDay} setActiveDay={setActiveDay}
              ageGroup={ageGroup} theme={theme} duration={duration}
              showChat={showChat} setShowChat={setShowChat} planContext={planContext}
              onPrint={handlePrintPlan} planId={currentPlanId} onUpdatePlan={handleUpdatePlan}
            />
          </div>
        )}

        {/* ─── CREATE VIEW ─── */}
        {viewMode === "create" && (
          <>
            {/* Step-by-step progress guide */}
            <LessonPlannerStepper
              planType={planType}
              steps={[
                { key: "class", label: "Class & Schedule", done: !!selectedClassId },
                { key: "theme", label: "Theme", done: !!theme.trim() },
                { key: "type", label: "Plan Type", done: true },
                ...(planType === "subject"
                  ? [
                      { key: "subject", label: "Subject & Focus", done: !!selectedSubject },
                      {
                        key: "prep",
                        label: "Prepare Sessions",
                        done:
                          !!selectedClassId &&
                          !!selectedSubject &&
                          subjectPrep.ready &&
                          !subjectPrep.hasUnsaved,
                      },
                    ]
                  : planType === "enrichment"
                  ? [{ key: "settings", label: "AI Settings", done: !!theme.trim() }]
                  : [{ key: "duration", label: "Duration", done: !!duration }]),
                { key: "generate", label: planType === "manual" ? "Save Plan" : "Generate Plan", done: !!generatedPlan },
              ]}
            />

            {/* Weekly Context Banner — prominent at top */}
            {hasWeeklyContext && selectedClassId && (
              <WeeklyPlannerContextCard ctx={weeklyPlanContext} />
            )}

            {/* Gap Alerts */}
            {planType === "subject" && gapAlerts.length > 0 && (
              <Alert variant="destructive" className="py-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">Targeted Intervention Needed</AlertTitle>
                <AlertDescription>
                  <div className="mt-1 space-y-0.5">
                    {gapAlerts.slice(0, 3).map((gap: any) => (
                      <div key={gap.id} className="text-xs">
                        <span className="font-medium">{gap.students?.first_name} {gap.students?.last_name}</span>
                        {" — "}{gap.gap_description || "Learning gap identified"}
                      </div>
                    ))}
                    {gapAlerts.length > 3 && <p className="text-[10px] text-muted-foreground">+{gapAlerts.length - 3} more</p>}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* ─── LEFT: Configuration Panel ─── */}
              <div className="lg:col-span-4 xl:col-span-3 space-y-4">
                {/* Step 1: Class & Date */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</div>
                      <CardTitle className="text-sm">Class & Schedule</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Class</Label>
                      <Select value={selectedClassId} onValueChange={handleClassChange}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {branchClasses.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.class_name} ({c.age_group})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-9 text-sm">
                            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            {format(startDate, "EEE, d MMM yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardContent>
                </Card>

                {/* Step 2: Theme */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</div>
                      <CardTitle className="text-sm">Theme</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {themeBankEntries.length > 0 ? (
                      <Select
                        value={selectedThemeBankId || ""}
                        onValueChange={(val) => {
                          if (val === "__custom__") {
                            setSelectedThemeBankId(null);
                            setTheme("");
                          } else {
                            const entry = themeBankEntries.find((t: any) => t.id === val);
                            setSelectedThemeBankId(val);
                            setTheme(entry?.theme_name || "");
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select from Theme Bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {themeBankEntries.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.theme_name} (M{t.month_number})
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom__">✏️ Custom theme...</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input placeholder="e.g., Haiwan, Keluarga Saya" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={100} className="h-9 text-sm" />
                    )}
                    {selectedThemeBankId === null && themeBankEntries.length > 0 && (
                      <Input placeholder="Enter custom theme" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={100} className="h-9 text-sm" />
                    )}
                    {theme && weeklyPlanContext?.monthlyTheme && theme === weeklyPlanContext.monthlyTheme && (
                      <p className="text-[10px] text-primary flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Auto-populated from Weekly Planner
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Step 3: Plan Type */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">3</div>
                      <CardTitle className="text-sm">Plan Type</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { key: "subject" as PlanType, icon: CalendarDays, label: "Subject" },
                        { key: "enrichment" as PlanType, icon: Sparkles, label: "Enrichment" },
                        { key: "manual" as PlanType, icon: Pencil, label: "Manual" },
                      ].map(({ key, icon: Icon, label }) => (
                        <button
                          key={key}
                          onClick={() => setPlanType(key)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-all",
                            planType === key
                              ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                              : "border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                      {planType === "subject" ? "AI weekly lessons tied to timetable"
                        : planType === "enrichment" ? "AI enrichment activities"
                        : "Build your own plan manually"}
                    </p>
                  </CardContent>
                </Card>

                {/* Step 4: Subject & Domain (for AI modes) */}
                {planType !== "manual" && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">4</div>
                        <CardTitle className="text-sm">
                          {planType === "subject" ? "Subject & Focus" : "AI Settings"}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-4">
                      {planType === "subject" && hasNoTimetable && (
                        <Alert className="py-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <AlertDescription className="text-xs">
                            This class has no timetable template set up. Please configure the weekly timetable first at{" "}
                            <a href="/timetables/template" className="underline text-primary font-medium">Timetable Template</a>.
                          </AlertDescription>
                        </Alert>
                      )}
                      {planType === "subject" && !hasNoTimetable && (
                        <SubjectWeeklyPlanner
                          selectedSubject={selectedSubject}
                          onSubjectChange={setSelectedSubject}
                          domainFocus={domainFocus}
                          onDomainFocusChange={setDomainFocus}
                          autoTunjang={autoTunjang}
                          subjectMap={subjectMap}
                          learningAreas={learningAreas}
                          developmentDomains={developmentDomains}
                          availableSubjects={classSlotSubjects}
                        />
                      )}

                      {/* Methodology notice */}
                      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5">
                        <Lightbulb className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Teaching methodology is automatically applied from your school settings and suggested per lesson by AI.
                        </p>
                      </div>

                      {/* Teacher Notes — only for enrichment mode.
                          Subject mode captures notes per-session in the
                          Subject Lesson Preparation panel to avoid duplicates. */}
                      {planType !== "subject" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Teacher Notes (optional)</Label>
                          <Textarea
                            placeholder="e.g., Focus on Letter A this week..."
                            value={teacherNotes}
                            onChange={(e) => setTeacherNotes(e.target.value)}
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </div>
                      )}

                      {/* Resource Links — Collapsible */}
                      {resourceLinks.length > 0 && (
                        <div className="space-y-1">
                          {resourceLinks.map((r, i) => (
                            <div key={i} className="flex items-center gap-1 text-[10px] bg-muted/50 rounded px-2 py-1">
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate flex-1">{r.label || r.url}</span>
                              <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setResourceLinks(prev => prev.filter((_, j) => j !== i))}>
                                <Trash2 className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Input placeholder="Label" value={newResourceLabel} onChange={(e) => setNewResourceLabel(e.target.value)} className="text-[10px] h-7 flex-[2]" />
                        <Input placeholder="URL" value={newResourceUrl} onChange={(e) => setNewResourceUrl(e.target.value)} className="text-[10px] h-7 flex-[3]" />
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0" disabled={!newResourceUrl.trim()} onClick={() => {
                          setResourceLinks(prev => [...prev, { label: newResourceLabel || newResourceUrl, url: newResourceUrl }]);
                          setNewResourceLabel(""); setNewResourceUrl("");
                        }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Manual duration */}
                {planType === "manual" && (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3 pt-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">4</div>
                        <CardTitle className="text-sm">Duration</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1 day">1 Day</SelectItem>
                          <SelectItem value="3 days">3 Days</SelectItem>
                          <SelectItem value="1 week">1 Week</SelectItem>
                          <SelectItem value="2 weeks">2 Weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}

                {/* Generate / Save Button
                    Subject mode renders its Generate button below the Subject
                    Lesson Preparation panel (right column / stacked bottom on
                    tablet & mobile) so teachers can only trigger it after
                    completing every session. */}
                {planType !== "subject" && (
                  <div className="sticky bottom-4">
                    {planType === "manual" ? (
                      <Button className="w-full shadow-lg" size="lg" disabled={!theme.trim()} onClick={handleSaveManualPlan}>
                        <Save className="mr-2 h-4 w-4" />Save Manual Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full shadow-lg"
                        size="lg"
                        disabled={!canGenerate || isGenerating}
                        onClick={handleGenerate}
                      >
                        {isGenerating ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                        ) : (
                          <><Sparkles className="mr-2 h-4 w-4" />Generate Enrichment Plan</>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* ─── RIGHT: Results Panel ─── */}
              <div className="lg:col-span-8 xl:col-span-9">
                {/* Enrichment */}
                {planType === "enrichment" && (
                  <>
                    {!generatedPlan && !generateMutation.isPending && (
                      <EmptyState
                        icon={Sparkles}
                        title="Generate Enrichment Plan"
                        description="Configure your settings on the left and click Generate to create an enrichment activity plan"
                      />
                    )}
                    {generateMutation.isPending && <LoadingState subject="enrichment" />}
                    {generatedPlan && !generateMutation.isPending && (
                      <PlanDisplay
                        plan={generatedPlan} activeDay={activeDay} setActiveDay={setActiveDay}
                        ageGroup={ageGroup} theme={theme} duration={duration} methodology={methodology}
                        onSave={() => saveMutation.mutate()} isSaving={saveMutation.isPending}
                        showChat={showChat} setShowChat={setShowChat} planContext={planContext}
                        onPrint={handlePrintPlan} planId={currentPlanId} onUpdatePlan={handleUpdatePlan}
                        recommendedWorksheets={recommendedWorksheets}
                        onRegenerate={() => { setGeneratedPlan(null); setCurrentPlanId(null); }}
                      />
                    )}
                  </>
                )}

                {/* Manual */}
                {planType === "manual" && !generatedPlan && (
                  <ManualPlanBuilder
                    manualDays={manualDays}
                    setManualDays={setManualDays}
                    computeDayDate={computeDayDate}
                    learningAreas={learningAreas}
                  />
                )}
                {planType === "manual" && generatedPlan && (
                  <PlanDisplay
                    plan={generatedPlan} activeDay={activeDay} setActiveDay={setActiveDay}
                    ageGroup={ageGroup} theme={theme} duration={duration}
                    showChat={showChat} setShowChat={setShowChat} planContext={planContext}
                    onPrint={handlePrintPlan} planId={currentPlanId} onUpdatePlan={handleUpdatePlan}
                  />
                )}

                {/* Subject */}
                {planType === "subject" && (
                  <>
                    {generateWeeklyMutation.isPending && <LoadingState subject={selectedSubject} />}
                    {!generatedPlan && !generateWeeklyMutation.isPending && (
                      selectedClassId && selectedSubject ? (
                        <div className="space-y-4">
                          {hasNoTimetable && (
                            <Alert className="py-2">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <AlertDescription className="text-xs">
                                No timetable found for this class. Default Monday–Friday sessions are shown so you can still prepare — set up your timetable at{" "}
                                <a href="/timetables/template" className="underline text-primary font-medium">Timetable Template</a> when possible.
                              </AlertDescription>
                            </Alert>
                          )}
                          <SubjectLessonPreparation
                            weekPlanId={weeklyPlanContext?.weekPlanId ?? null}
                            classId={selectedClassId}
                            subject={selectedSubject}
                            weekStart={weekStarting}
                            branchId={branchId ?? null}
                            isEditable={true}
                            onReadinessChange={setSubjectPrep}
                            direction={{
                              className: selectedClass?.class_name ?? null,
                              ageGroup,
                              weekStart: weekStarting,
                              theme: theme || weeklyPlanContext?.monthlyTheme || null,
                              weeklyFocusTitle: weeklyPlanContext?.weeklyFocusTitle || null,
                              keyQuestions: weeklyPlanContext?.provocations || [],
                            }}
                          />

                          {/* Generate CTA — placed AFTER Subject Lesson
                              Preparation so tablet & mobile users must scroll
                              through preparation before triggering AI. */}
                          <Card className="shadow-sm border-primary/40 sticky bottom-2 sm:static bg-background/95 backdrop-blur">
                            <CardContent className="p-4 space-y-3">
                              {!canGenerate && (
                                <Alert className="py-2">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <AlertDescription className="text-xs">
                                    {subjectPrep.sessionCount === 0
                                      ? "No sessions loaded yet. Once your timetable sessions appear above, fill in what you're teaching for each one."
                                      : subjectPrep.missingSkillCount > 0
                                      ? `Add a skill focus to ${subjectPrep.missingSkillCount} remaining session${subjectPrep.missingSkillCount > 1 ? "s" : ""} before generating.`
                                      : "Complete each session above before generating the lesson plan."}
                                  </AlertDescription>
                                </Alert>
                              )}
                              {canGenerate && subjectPrep.hasUnsaved && (
                                <Alert className="py-2">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <AlertDescription className="text-xs">
                                    You have unsaved changes above. Tap “Save Teaching Details” before generating so the AI uses your latest input.
                                  </AlertDescription>
                                </Alert>
                              )}
                              <Button
                                className="w-full shadow-lg"
                                size="lg"
                                disabled={!canGenerate || isGenerating}
                                onClick={handleGenerate}
                              >
                                {isGenerating ? (
                                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                                ) : (
                                  <><Sparkles className="mr-2 h-4 w-4" />Generate {selectedSubject || "Subject"} Plan</>
                                )}
                              </Button>
                              <p className="text-[11px] text-muted-foreground text-center">
                                Complete every session (book, page &amp; skill focus) above, then generate.
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                      ) : (
                        <EmptyState
                          icon={CalendarDays}
                          title="Generate Weekly Subject Plan"
                          description="Select a class, subject, and theme to prepare this week's sessions and generate the plan."
                        />
                      )
                    )}
                    {generatedPlan && !generateWeeklyMutation.isPending && (
                      <PlanDisplay
                        plan={generatedPlan} activeDay={activeDay} setActiveDay={setActiveDay}
                        ageGroup={ageGroup} theme={theme} duration={duration}
                        onSave={() => saveMutation.mutate()} isSaving={saveMutation.isPending}
                        showChat={showChat} setShowChat={setShowChat} planContext={planContext}
                        onPrint={handlePrintPlan} planId={currentPlanId} onUpdatePlan={handleUpdatePlan}
                        recommendedWorksheets={recommendedWorksheets}
                        onRegenerate={() => { setGeneratedPlan(null); setWeeklyResult(null); setCurrentPlanId(null); }}
                        interventionGroups={interventionGroups}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ───

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-20 px-6">
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground/70 text-center max-w-sm">{description}</p>
    </div>
  );
}

function LoadingState({ subject }: { subject: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-primary/20 bg-primary/5 py-20 px-6">
      <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
      <p className="text-sm font-medium text-foreground">AI generating {subject} plan...</p>
      <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
    </div>
  );
}

function LessonPlannerStepper({
  steps,
  planType,
}: {
  steps: { key: string; label: string; done: boolean }[];
  planType: PlanType;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);
  // Current step = first not-done, or last if all done
  const currentIdx = steps.findIndex((s) => !s.done);
  const activeIdx = currentIdx === -1 ? steps.length - 1 : currentIdx;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Step {Math.min(activeIdx + 1, total)} of {total}
            <span className="text-muted-foreground font-normal">
              {" "}· {steps[activeIdx]?.label}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {planType === "manual"
              ? "Build your own week — no AI required."
              : planType === "enrichment"
              ? "AI enrichment activities based on your theme."
              : "Prepare each timetabled session, then let AI draft the week."}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium text-primary">{pct}%</p>
          <p className="text-[10px] text-muted-foreground">{doneCount}/{total} ready</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step chips */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((s, i) => {
          const isActive = i === activeIdx;
          const isDone = s.done;
          return (
            <li key={s.key} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  isDone && !isActive && "border-primary/40 bg-primary/5 text-foreground",
                  isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                  !isDone && !isActive && "border-border bg-background text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold",
                    isDone && !isActive && "bg-primary text-primary-foreground",
                    isActive && "bg-primary-foreground text-primary",
                    !isDone && !isActive && "bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span className="font-medium whitespace-nowrap">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="text-muted-foreground/40 text-xs hidden sm:inline">›</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WeeklyPlannerContextCard({ ctx }: { ctx: any }) {
  const objectives: string[] = Array.isArray(ctx?.weeklyObjectives) ? ctx.weeklyObjectives : [];
  // Split a single long "•"-separated string into individual items
  const items = objectives.flatMap((s: string) =>
    typeof s === "string" && s.includes("•")
      ? s.split("•").map((x) => x.trim()).filter(Boolean)
      : [s],
  );
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:flex-col sm:items-start">
          <div className="rounded-full bg-primary/10 p-2">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Weekly Context</span>
            <Badge variant="secondary" className="text-[9px] h-4">Auto-linked</Badge>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          {ctx?.monthlyTheme && (
            <p className="text-sm sm:text-base font-semibold text-foreground leading-snug">
              {ctx.monthlyTheme}
            </p>
          )}
          {ctx?.weeklyFocusTitle && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              Week focus: <span className="text-foreground font-medium">{ctx.weeklyFocusTitle}</span>
            </p>
          )}
          {items.length > 0 && (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1">
                <ChevronDown className={cn("h-3.5 w-3.5 transition", open ? "rotate-180" : "")} />
                {open ? "Hide" : "View"} this week's objectives ({items.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 space-y-1 list-disc pl-4 text-xs sm:text-sm text-muted-foreground">
                  {items.map((it, i) => (
                    <li key={i} className="leading-snug">{it}</li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}
