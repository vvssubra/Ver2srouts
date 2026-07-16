import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  BookOpen, Layers, Target, ClipboardList, CalendarDays, CalendarRange,
  GraduationCap, Palette, Microscope, CheckCircle2, AlertCircle, ArrowRight,
  Sparkles, BarChart3, FileText, Music, Library, Lightbulb, Rocket, ShieldCheck,
  HeartHandshake, ChevronLeft, ChevronRight, Home, Clock, CalendarCheck,
  Activity, TrendingUp, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  COMMAND_CENTER_GROUPED_TABS,
  canViewCurriculumModule,
} from "@/lib/curriculum-access";

type RoleKey = "super_admin" | "franchisee" | "admin" | "principal" | "curriculum_admin" | "teacher" | "other";

function resolveRoleKey(role: string | null | undefined): RoleKey {
  switch (role) {
    case "super_admin":
    case "franchisee":
    case "admin":
    case "teacher":
      return role;
    default:
      return "other";
  }
}

const ROLE_GUIDANCE: Record<RoleKey, { title: string; body: string }> = {
  super_admin: {
    title: "Super Admin view",
    body: "Manage master curriculum, domains, templates and monitor every branch's readiness.",
  },
  franchisee: {
    title: "Franchisee view",
    body: "Oversee curriculum setup across your branches and ensure readiness before each term.",
  },
  admin: {
    title: "Admin / Principal view",
    body: "Build, approve and monitor curriculum quality for your branch from one production-ready workspace.",
  },
  principal: {
    title: "Principal view",
    body: "Review pending plans, approve quality work and monitor coverage across classes.",
  },
  curriculum_admin: {
    title: "Curriculum Admin view",
    body: "Set up objectives, vocabulary, themes and resources that feed AI lesson generation.",
  },
  teacher: {
    title: "Teacher view",
    body: "Use approved plans, generate lessons and capture evidence. Admin setup tools are hidden.",
  },
  other: {
    title: "Curriculum Command Center",
    body: "Plan, guide, approve and monitor curriculum quality from one place.",
  },
};

function pct(done: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "outline"} className="gap-1 text-xs">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function ExplainerCard({
  icon: Icon, title, body, impact, action, onAction,
}: {
  icon: any; title: string; body: string; impact?: string;
  action?: string; onAction?: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
          <p className="font-semibold text-sm">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
        {impact && (
          <p className="text-[11px] text-muted-foreground italic">
            <span className="font-medium text-foreground/80">Quality impact:</span> {impact}
          </p>
        )}
        {action && (
          <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={onAction}>
            {action} <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function CurriculumCommandCenter() {
  const navigate = useNavigate();
  const { role, allowedRoutes } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") || "overview";
  const [, setTab] = useState(tab);
  const roleKey = resolveRoleKey(role);
  const isTeacher = roleKey === "teacher";
  const guidance = ROLE_GUIDANCE[roleKey];

  const setActiveTab = (t: string) => {
    setTab(t);
    const next = new URLSearchParams(search);
    next.set("tab", t);
    setSearch(next, { replace: true });
  };

  // ---- Consolidated 6-section tab navigation (Sub-batch 6B-0A.4) ----
  // A grouped tab is visible if the user can view ANY underlying module.
  // Legacy tab ids (setup, yearly, monthly, weekly, lessons, centers,
  // resources, approvals) are aliased into the new sections.
  const LEGACY_TO_NEW: Record<string, string> = {
    setup: "foundation",
    yearly: "planning",
    monthly: "planning",
    weekly: "planning",
    centers: "lessons",
    resources: "lessons",
    approvals: "quality",
  };
  const resolvedTab = LEGACY_TO_NEW[tab] || tab;
  const TAB_FLOW = COMMAND_CENTER_GROUPED_TABS.filter((t) =>
    t.modules.some((m) => canViewCurriculumModule({ role, allowedRoutes, moduleKey: m })),
  );
  const currentTabAllowed = TAB_FLOW.some((t) => t.id === resolvedTab);
  const flowIdx = Math.max(0, TAB_FLOW.findIndex((t) => t.id === resolvedTab));

  // If user landed on a tab their access group doesn't permit, bounce them
  // to the first allowed tab (usually Overview) so they never see a stale
  // panel for a section they can't access.
  useEffect(() => {
    // Migrate legacy tab params to consolidated sections, or redirect when
    // the requested section is not granted to this access group.
    if (tab !== resolvedTab && TAB_FLOW.some((t) => t.id === resolvedTab)) {
      setActiveTab(resolvedTab);
    } else if (!currentTabAllowed && TAB_FLOW.length > 0) {
      setActiveTab(TAB_FLOW[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTabAllowed, tab]);

  const prevTab = flowIdx > 0 ? TAB_FLOW[flowIdx - 1] : null;
  const nextTab = flowIdx < TAB_FLOW.length - 1 ? TAB_FLOW[flowIdx + 1] : null;
  const currentLabel = TAB_FLOW[flowIdx]?.label ?? "Overview";

  // ---- Foundation queries ----
  const { data: domains = [] } = useQuery({
    queryKey: ["cmd-domains"],
    queryFn: async () => (await supabase.from("development_domains").select("id").order("sort_order")).data ?? [],
  });

  const { data: goalsCount = 0 } = useQuery({
    queryKey: ["cmd-goals"],
    queryFn: async () => (await supabase.from("yearly_outcomes").select("id", { count: "exact", head: true })).count ?? 0,
  });

  const { data: objectivesCount = 0 } = useQuery({
    queryKey: ["cmd-objectives"],
    queryFn: async () =>
      (await supabase.from("lesson_objectives").select("id", { count: "exact", head: true }).eq("is_active", true)).count ?? 0,
  });

  const { data: themesCount = 0 } = useQuery({
    queryKey: ["cmd-themes"],
    queryFn: async () => (await supabase.from("theme_bank").select("id", { count: "exact", head: true })).count ?? 0,
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ["cmd-years", selectedBranchId],
    queryFn: async () => {
      if (!selectedBranchId) return [];
      const { data } = await supabase.from("academic_years").select("*")
        .eq("branch_id", selectedBranchId).order("start_date", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId,
  });
  const activeYear = academicYears.find((y: any) => y.is_active) || academicYears[0];

  const { data: yearPlans = [] } = useQuery({
    queryKey: ["cmd-yearplans", selectedBranchId, activeYear?.id],
    queryFn: async () => {
      const { data } = await supabase.from("curriculum_year_plans").select("id, age_group_id")
        .eq("branch_id", selectedBranchId!).eq("academic_year_id", activeYear!.id);
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId && !!activeYear?.id,
  });

  const ypIds = yearPlans.map((y: any) => y.id);
  const { data: monthPlans = [] } = useQuery({
    queryKey: ["cmd-month", ypIds],
    queryFn: async () => {
      if (!ypIds.length) return [];
      const { data } = await supabase.from("curriculum_month_plans")
        .select("id, year_plan_id, status, review_status").in("year_plan_id", ypIds);
      return (data as any[]) ?? [];
    },
    enabled: ypIds.length > 0,
  });

  const mpIds = monthPlans.map((m: any) => m.id);
  const { data: weekPlans = [] } = useQuery({
    queryKey: ["cmd-week", mpIds],
    queryFn: async () => {
      if (!mpIds.length) return [];
      const { data } = await supabase.from("curriculum_week_plans")
        .select("id, observation_focus, review_status").in("month_plan_id", mpIds);
      return (data as any[]) ?? [];
    },
    enabled: mpIds.length > 0,
  });

  const { data: lessonPlansCount = 0 } = useQuery({
    queryKey: ["cmd-lessons", selectedBranchId],
    queryFn: async () =>
      (await supabase.from("lesson_plans").select("id", { count: "exact", head: true })
        .eq("branch_id", selectedBranchId!)).count ?? 0,
    enabled: !!selectedBranchId,
  });

  const { data: centersCount = 0 } = useQuery({
    queryKey: ["cmd-centers", selectedBranchId],
    queryFn: async () =>
      (await supabase.from("learning_center_plans" as any).select("id", { count: "exact", head: true })
        .eq("branch_id", selectedBranchId!)).count ?? 0,
    enabled: !!selectedBranchId,
  });

  const { data: pendingApprovals = 0 } = useQuery({
    queryKey: ["cmd-approvals", selectedBranchId],
    queryFn: async () => {
      const { count } = await supabase.from("lesson_plans").select("id", { count: "exact", head: true })
        .eq("branch_id", selectedBranchId!).eq("status", "pending_review");
      return count ?? 0;
    },
    enabled: !!selectedBranchId,
  });

  // ---- Calendar & Timetable queries ----
  const { data: classesList = [] } = useQuery({
    queryKey: ["cmd-classes", selectedBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes")
        .select("id, class_name").eq("branch_id", selectedBranchId!).eq("is_active", true);
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId,
  });

  const today = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const { data: holidaysThisWeek = 0 } = useQuery({
    queryKey: ["cmd-holidays-week", selectedBranchId, weekStartStr],
    queryFn: async () => {
      const sb = supabase as any;
      const { count } = await sb.from("school_holidays")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", selectedBranchId)
        .gte("event_date", weekStartStr)
        .lte("event_date", weekEndStr);
      return (count as number) ?? 0;
    },
    enabled: !!selectedBranchId,
  });

  const { data: classesWithTimetable = 0 } = useQuery({
    queryKey: ["cmd-classes-with-tt", selectedBranchId, classesList.length],
    queryFn: async () => {
      const ids = (classesList as any[]).map((c: any) => c.id);
      if (!ids.length) return 0;
      const sb = supabase as any;
      const { data } = await sb.from("timetable_slots")
        .select("class_id").in("class_id", ids);
      const have = new Set((data as any[] ?? []).map((r: any) => r.class_id));
      return have.size;
    },
    enabled: !!selectedBranchId && classesList.length > 0,
  });

  // ---- Readiness scoring ----
  const weeksWithObservation = weekPlans.filter((w: any) => {
    const v = w.observation_focus;
    return Array.isArray(v) ? v.length > 0 : (typeof v === "string" ? v.trim().length > 0 : !!v);
  }).length;

  // Use weekly focus objectives as a proxy for vocabulary / objectives coverage
  const wpIds = weekPlans.map((w: any) => w.id);
  const { data: wfObjectives = [] } = useQuery({
    queryKey: ["cmd-wf-obj", wpIds],
    queryFn: async () => {
      if (!wpIds.length) return [];
      const { data } = await supabase.from("weekly_focus_objectives" as any)
        .select("week_plan_id").in("week_plan_id", wpIds);
      return (data as any[]) ?? [];
    },
    enabled: wpIds.length > 0,
  });
  const weeksWithObjectives = new Set((wfObjectives as any[]).map((r: any) => r.week_plan_id)).size;

  const readiness = useMemo(() => {
    const checks = [
      { key: "framework", label: "Curriculum framework & domains", ok: domains.length > 0, action: "Open framework", path: "/curriculum-framework" },
      { key: "goals", label: "Learning goals set", ok: goalsCount > 0, action: "Add learning goals", path: "/yearly-outcomes" },
      { key: "objectives", label: "Term objectives created", ok: objectivesCount > 0, action: "Add objectives", path: "/objective-bank" },
      { key: "themes", label: "Theme bank populated", ok: themesCount > 0, action: "Open theme bank", path: "/theme-bank" },
      { key: "year", label: "Active academic year", ok: !!activeYear, action: "Open yearly planner", path: "/yearly-planner" },
      { key: "yearplan", label: "Yearly plan started", ok: yearPlans.length > 0, action: "Open yearly planner", path: "/yearly-planner" },
      { key: "month", label: "Monthly plans started", ok: monthPlans.length > 0, action: "Open monthly planner", path: "/curriculum/monthly" },
      { key: "week", label: "Weekly plans started", ok: weekPlans.length > 0, action: "Open weekly planner", path: "/curriculum/weekly" },
      { key: "weekobj", label: "Weekly objectives mapped", ok: weeksWithObjectives > 0, action: "Map weekly objectives", path: "/curriculum/weekly" },
      { key: "obsfocus", label: "Observation focus set", ok: weeksWithObservation > 0, action: "Set observation focus", path: "/curriculum/weekly" },
      { key: "lessons", label: "Lesson plans generated", ok: lessonPlansCount > 0, action: "Open lesson builder", path: "/lesson-planner" },
      { key: "centers", label: "Learning centers generated", ok: centersCount > 0, action: "Open learning centers", path: "/curriculum/centers" },
    ];
    const ok = checks.filter((c) => c.ok).length;
    return { checks, ok, total: checks.length, score: pct(ok, checks.length) };
  }, [domains.length, goalsCount, objectivesCount, themesCount, activeYear, yearPlans.length,
      monthPlans.length, weekPlans.length, weeksWithObjectives, weeksWithObservation,
      lessonPlansCount, centersCount]);

  const missing = readiness.checks.filter((c) => !c.ok);
  const nextAction = missing[0];

  // ---- Workflow steps ----
  const workflow = [
    { step: 1, label: "Foundation: framework, goals, objectives, themes", done: domains.length > 0 && goalsCount > 0 && objectivesCount > 0,
      path: "/curriculum-framework", impact: "Defines the developmental backbone every plan inherits." },
    { step: 2, label: "Yearly plan", done: yearPlans.length > 0, path: "/yearly-planner",
      impact: "Sets the big theme map for the year. Monthly and weekly plans should follow this structure." },
    { step: 3, label: "Monthly plan", done: monthPlans.length > 0, path: "/curriculum/monthly",
      impact: "Defines the month's big idea, key concepts, assessment focus and family connection." },
    { step: 4, label: "Weekly plan: focus, objectives & observation cues", done: weekPlans.length > 0 && weeksWithObjectives > 0, path: "/curriculum/weekly",
      impact: "Controls weekly lesson focus, vocabulary, observation cues and parent home reinforcement." },
    { step: 5, label: "Lesson plans", done: lessonPlansCount > 0, path: "/lesson-planner",
      impact: "AI uses approved weekly objectives, vocabulary and child progress to generate higher-quality lessons." },
    { step: 6, label: "Learning centers", done: centersCount > 0, path: "/curriculum/centers",
      impact: "Connects classroom areas to objectives, vocabulary and evidence collection." },
    { step: 7, label: "Principal approval", done: pendingApprovals === 0 && lessonPlansCount > 0, path: "/curriculum/dashboard/all-plans",
      impact: "Ensures teachers only use complete, quality-checked plans." },
    { step: 8, label: "Teacher delivery → evidence → parent reinforcement", done: false, path: "/curriculum/dashboard/review",
      impact: "Learning Journey evidence feeds child progress and powers parent home reinforcement." },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="Curriculum Command Center"
        subtitle="Plan, guide, approve and monitor curriculum quality from one place."
        actions={
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> {guidance.title}
          </Badge>
        }
      />

      {isTeacher ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Teacher view</AlertTitle>
          <AlertDescription>
            The Command Center is mainly for admin and principal setup. As a teacher, use{" "}
            <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/planning-hub")}>Planning Hub</Button>{" "}
            to view approved plans and capture evidence.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={resolvedTab} onValueChange={setActiveTab} className="mt-4">
        {/* Breadcrumb + workbench flow nav */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            <span>Curriculum &amp; Quality</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {tab !== "overview" && (
              <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={() => setActiveTab("overview")}>
                <Home className="h-3 w-3" /> Overview
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-7"
              disabled={!prevTab}
              onClick={() => prevTab && setActiveTab(prevTab.id)}
              title={prevTab ? `Previous: ${prevTab.label}` : undefined}
            >
              <ChevronLeft className="h-3 w-3" /> {prevTab?.label ?? "Previous"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-7"
              disabled={!nextTab}
              onClick={() => nextTab && setActiveTab(nextTab.id)}
              title={nextTab ? `Next: ${nextTab.label}` : undefined}
            >
              {nextTab?.label ?? "Next"} <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <TabsList className="flex flex-wrap h-auto">
          {TAB_FLOW.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {!currentTabAllowed && (
          <Alert className="mt-4">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>No access to this curriculum section</AlertTitle>
            <AlertDescription>
              Your access group does not include permission for this module.
              Ask a Super Admin to grant access via Users → Access Groups.
            </AlertDescription>
          </Alert>
        )}

        {/* OVERVIEW — production dashboard */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Curriculum Health Score */}
          <SectionCard
            title={`Curriculum Health Score — ${readiness.score}%`}
            description="A single health check across foundation, planning, calendar, lessons, resources and approvals."
            actions={
              nextAction ? (
                <Button size="sm" onClick={() => navigate(nextAction.path)} className="gap-1">
                  {nextAction.action} <ArrowRight className="h-3 w-3" />
                </Button>
              ) : (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              )
            }
          >
            <Progress value={readiness.score} className="h-2 mb-3" />
            <div className="flex flex-wrap gap-2">
              {readiness.checks.map((c) => <StatusPill key={c.key} ok={c.ok} label={c.label} />)}
            </div>
          </SectionCard>

          {/* This Week Readiness */}
          <SectionCard title="This Week Readiness" description="What needs to be true for this week to run smoothly.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Weekly plan</p>
                <p className="text-2xl font-semibold">{weekPlans.length}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Drives focus, vocabulary and observation cues.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/curriculum/weekly")}>Open Weekly <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Classes with timetable</p>
                <p className="text-2xl font-semibold">{classesWithTimetable}<span className="text-sm text-muted-foreground"> / {classesList.length}</span></p>
                <p className="text-[11px] text-muted-foreground mt-1">No timetable means no daily routine for teachers.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/timetables")}>Open Timetable <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Lesson plans (branch)</p>
                <p className="text-2xl font-semibold">{lessonPlansCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Approved lesson plans attach to timetable blocks.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/lesson-planner")}>Open Lesson Builder <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Learning centers</p>
                <p className="text-2xl font-semibold">{centersCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Creates natural observation moments.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/curriculum/centers")}>Open Centers <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Observation focus set</p>
                <p className="text-2xl font-semibold">{weeksWithObservation}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Tells teachers what evidence to capture this week.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/curriculum/weekly")}>Set Focus <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Holidays / closures this week</p>
                <p className="text-2xl font-semibold">{holidaysThisWeek}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Lesson plans on these days won't be delivered.</p>
                <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/school-calendar")}>Review Calendar <ArrowRight className="h-3 w-3" /></Button>
              </CardContent></Card>
            </div>
          </SectionCard>

          {/* Pending Principal Actions */}
          <SectionCard title="Pending Principal Actions" description="What needs your decision before teachers deliver.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className={pendingApprovals > 0 ? "border-warning/40 bg-warning/5" : ""}>
                <CardContent className="pt-5 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-warning/15 text-warning"><ShieldCheck className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Lesson plans awaiting review</p>
                    <p className="text-2xl font-semibold mt-1">{pendingApprovals}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Teachers can only deliver approved plans.</p>
                    <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/curriculum/dashboard/all-plans")}>Open Review <ArrowRight className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-info/10 text-info"><Activity className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Academic overview</p>
                    <p className="text-xs text-muted-foreground mt-1">Cross-class snapshot of focus, evidence and child progress.</p>
                    <Button size="sm" variant="outline" className="mt-2 gap-1" onClick={() => navigate("/curriculum/dashboard/review")}>Open Overview <ArrowRight className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </SectionCard>

          {/* Missing Setup Warnings */}
          {missing.length > 0 && (
            <SectionCard
              title="Missing Setup"
              description="These gaps make AI lesson plans generic and weaken parent reinforcement."
            >
              <div className="space-y-2">
                {missing.slice(0, 6).map((m) => (
                  <div key={m.key} className="flex items-center justify-between p-2 rounded border bg-card">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                      <span className="text-sm truncate">{m.label}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={() => navigate(m.path)}>
                      {m.action} <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Quick Actions */}
          <SectionCard title="Quick Actions">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/curriculum/weekly")}><BookOpen className="h-4 w-4" /> Complete Weekly Plan</Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/lesson-planner")}><GraduationCap className="h-4 w-4" /> Generate Lesson Plan</Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/curriculum/centers")}><Palette className="h-4 w-4" /> Generate Learning Centers</Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/curriculum/dashboard/all-plans")}><ShieldCheck className="h-4 w-4" /> Review Approvals</Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/curriculum/dashboard/coverage")}><BarChart3 className="h-4 w-4" /> Check Curriculum Coverage</Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/theme-bank")}><Library className="h-4 w-4" /> Open Theme Bank</Button>
            </div>
          </SectionCard>

          <SectionCard title="Role guidance">
            <p className="text-sm text-muted-foreground">{guidance.body}</p>
          </SectionCard>
        </TabsContent>

        {/* FOUNDATION — sets what the school teaches */}
        <TabsContent value="foundation" className="space-y-4 mt-4">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Foundation sets what the school teaches.</AlertTitle>
            <AlertDescription>
              Domains, the master objective bank, themes and the school methodology anchor every plan that follows.
            </AlertDescription>
          </Alert>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExplainerCard icon={Layers} title="Curriculum Framework & Domains"
              body="Defines the school's learning domains, methodology and curriculum structure."
              impact="Without a framework, AI suggestions lack developmental focus."
              action="Open framework" onAction={() => navigate("/curriculum-framework")} />
            <ExplainerCard icon={Target} title="Objective Catalogue"
              body="Master age-based objective and indicator bank used for progress, planning and parent reporting."
              impact="Single source of truth for what every child should learn at each age."
              action="Open catalogue" onAction={() => navigate("/curriculum/objective-catalogue")} />
            <ExplainerCard icon={BookOpen} title="Theme Bank"
              body="Reusable learning themes that organise monthly and weekly planning."
              impact="Themes give monthly and weekly plans coherence."
              action="Open theme bank" onAction={() => navigate("/theme-bank")} />
            <ExplainerCard icon={HeartHandshake} title="School Methodology"
              body="Guides how AI and teachers design learning experiences."
              impact="Influences activity style and parent communication tone."
              action="Open methodology" onAction={() => navigate("/curriculum/school-methodology")} />
            <ExplainerCard icon={Library} title="Vocabulary Matrix"
              body="Bilingual English / BM vocabulary by age, theme, domain and objective."
              impact="Powers parent home learning and gives teachers ready prompts and example sentences."
              action="Open vocabulary" onAction={() => navigate("/curriculum/vocabulary-matrix")} />
          </div>

          <SectionCard
            title="How objectives flow through the curriculum"
            description="Objective Catalogue is the master bank. Yearly Learning Goals choose broad priorities. Term Objectives narrow the focus. Monthly and Weekly Plans convert them into classroom learning. Lesson Plans turn them into teacher-ready activities and evidence."
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                "Objective Catalogue",
                "Yearly Goals",
                "Term Focus",
                "Monthly Plan",
                "Weekly Plan",
                "Lesson Plan",
                "Learning Journey",
                "Parent Progress",
              ].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <Badge variant={i === 0 ? "default" : "outline"} className="text-[11px] py-1">{step}</Badge>
                  {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Learning Goals and Term Objectives now live under <strong>Planning Cycle</strong> — they select from the Objective Catalogue rather than competing with it.
            </p>
          </SectionCard>

          <SectionCard title="What this affects">
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Every plan inherits domains and objectives from here.</li>
              <li>AI lesson generation uses these as developmental scaffolding.</li>
              <li>Themes drive monthly and weekly planning coherence.</li>
              <li>School methodology shapes activity style and parent tone.</li>
            </ul>
          </SectionCard>
        </TabsContent>

        {/* PLANNING CYCLE — yearly + monthly + weekly together */}
        <TabsContent value="planning" className="space-y-4 mt-4">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Planning Cycle selects priorities from the Objective Catalogue and converts them into yearly, term, monthly and weekly teaching focus.</AlertTitle>
            <AlertDescription>
              Yearly Goals choose the broad priorities. Term Objectives narrow them. Monthly defines the big idea. Weekly sets focus, vocabulary, books, songs and observation cues.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExplainerCard icon={CalendarRange} title="Yearly Curriculum Plan"
              body="Maps the year's learning journey, themes and major priorities."
              impact="A weak yearly plan cascades into shallow monthly and weekly focus."
              action="Open yearly planner" onAction={() => navigate("/yearly-planner")} />
            <ExplainerCard icon={Target} title="Yearly Learning Goals"
              body="Chooses the broad learning priorities for the year from the Objective Catalogue."
              impact="Goals drive term objective selection and AI's lesson direction."
              action="Open learning goals" onAction={() => navigate("/yearly-outcomes")} />
            <ExplainerCard icon={ClipboardList} title="Term Focus / Term Objectives"
              body="Breaks yearly priorities into term-level learning focus teachers and AI use weekly."
              impact="Without term objectives, AI lesson plans become generic."
              action="Open term objectives" onAction={() => navigate("/objective-bank")} />
            <ExplainerCard icon={CalendarDays} title="Monthly Plan"
              body="Turns term focus into monthly big ideas, assessment focus and family connection."
              impact="Drives the monthly newsletter, parent narrative and weekly scope."
              action="Open monthly planner" onAction={() => navigate("/curriculum/monthly")} />
            <ExplainerCard icon={BookOpen} title="Weekly Plan"
              body="Turns monthly direction into weekly objectives, vocabulary and observation focus."
              impact="Weekly objectives guide AI lessons and teacher observation cues."
              action="Open weekly planner" onAction={() => navigate("/curriculum/weekly")} />
          </div>

          <SectionCard title="Planning readiness">
            <div className="flex flex-wrap gap-2">
              <StatusPill ok={!!activeYear} label={`Active year: ${activeYear?.year_name || "Not set"}`} />
              <StatusPill ok={yearPlans.length > 0} label={`Yearly plans: ${yearPlans.length}`} />
              <StatusPill ok={monthPlans.length > 0} label={`Monthly plans: ${monthPlans.length}`} />
              <StatusPill ok={weekPlans.length > 0} label={`Weekly plans: ${weekPlans.length}`} />
              <StatusPill ok={weeksWithObjectives > 0} label={`Weeks with objectives: ${weeksWithObjectives}`} />
              <StatusPill ok={weeksWithObservation > 0} label={`Weeks with observation focus: ${weeksWithObservation}`} />
            </div>
          </SectionCard>

          <SectionCard title="What this affects">
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Yearly Goals and Term Objectives select from the Foundation → Objective Catalogue.</li>
              <li>AI lesson generation uses weekly focus + objectives + vocabulary.</li>
              <li>Parent "This Week at Home" card pulls vocabulary, books and songs from the weekly plan.</li>
              <li>Observation focus tells teachers what evidence to capture in Learning Journey.</li>
            </ul>
          </SectionCard>
        </TabsContent>

        {/* CALENDAR & TIMETABLE — sole home for school calendar + timetable */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Calendar &amp; Timetable connects school dates and daily classroom routine.</AlertTitle>
            <AlertDescription>
              <strong>School Calendar</strong> is the school-wide view of events, holidays, closures and assessment windows.{" "}
              <strong>Class Timetable</strong> is each class's weekly teaching routine.{" "}
              <strong>Lesson Plan Schedule</strong> attaches approved lessons to timetable blocks.
              <span className="block mt-1 text-[11px] italic">Note: yearly term dates live in the Yearly Plan (Planning Cycle) — not duplicated here.</span>
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExplainerCard icon={CalendarDays} title="School Calendar"
              body="Holidays, school events, parent events, celebrations and closures."
              impact="Visible to staff. Drives event awareness and lesson schedule conflicts."
              action="Open School Calendar" onAction={() => navigate("/school-calendar")} />
            <ExplainerCard icon={Clock} title="Class Timetable"
              body="Each class's weekly routine: lesson blocks, learning centers, meals, rest, outdoor."
              impact="Without a timetable, teachers have no daily structure."
              action="Open Class Timetable" onAction={() => navigate("/timetables")} />
            <ExplainerCard icon={CalendarCheck} title="Lesson Plan Schedule"
              body="Approved lesson plans attached to each timetable block for the week."
              impact="Missing attachments = teachers don't know what to deliver that day."
              action="Open Lesson Builder" onAction={() => navigate("/lesson-planner")} />
          </div>

          <SectionCard title="This week's readiness">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Classes with timetable</p>
                <p className="text-2xl font-semibold">{classesWithTimetable}<span className="text-sm text-muted-foreground"> / {classesList.length}</span></p>
                <p className="text-[11px] text-muted-foreground mt-1">{classesWithTimetable < classesList.length ? "Some classes have no weekly routine yet." : "Every class has a weekly routine."}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Holidays / closures this week</p>
                <p className="text-2xl font-semibold">{holidaysThisWeek}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{holidaysThisWeek > 0 ? "Plan around these dates." : "Standard schedule applies."}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Lesson plans (branch)</p>
                <p className="text-2xl font-semibold">{lessonPlansCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Attach approved plans to timetable blocks.</p>
              </CardContent></Card>
            </div>
          </SectionCard>
        </TabsContent>

        {/* LESSON & RESOURCES — sole home for lesson builder, centers and resources */}
        <TabsContent value="lessons" className="space-y-4 mt-4">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Lesson &amp; Resources turns plans into teacher-ready classroom activities.</AlertTitle>
            <AlertDescription>
              Lesson Builder, Learning Centers and Teaching Resources all live here so teachers and AI have one production source.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExplainerCard icon={GraduationCap} title="Lesson Builder"
              body="AI uses approved weekly objectives, vocabulary and child progress to generate lessons."
              impact="Skipping setup turns AI lessons into generic templates."
              action="Open Lesson Builder" onAction={() => navigate("/lesson-planner")} />
            <ExplainerCard icon={Palette} title="Learning Centers"
              body="Connect classroom areas to objectives, vocabulary and evidence collection."
              impact="Centers create natural observation moments aligned to weekly focus."
              action="Open Learning Centers" onAction={() => navigate("/curriculum/centers")} />
            <ExplainerCard icon={FileText} title="Teaching Resources"
              body="Worksheets, printables and AI-indexed teaching documents."
              impact="More relevant resources = stronger lesson activities."
              action="Open Worksheet Library" onAction={() => navigate("/worksheets")} />
          </div>

          <SectionCard title="Coming next">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-dashed"><CardContent className="pt-5 space-y-2">
                <div className="flex items-center gap-2"><div className="p-2 rounded-lg bg-muted text-muted-foreground"><Music className="h-4 w-4" /></div><p className="font-semibold text-sm">Resource Pack</p><Badge variant="outline" className="ml-auto text-[10px]">Coming next</Badge></div>
                <p className="text-xs text-muted-foreground">Curated books, songs, printable cards and teacher scripts bundled per theme.</p>
              </CardContent></Card>
            </div>
          </SectionCard>

          <SectionCard title="Status">
            <div className="flex flex-wrap gap-2">
              <StatusPill ok={lessonPlansCount > 0} label={`Lesson plans: ${lessonPlansCount}`} />
              <StatusPill ok={centersCount > 0} label={`Learning center plans: ${centersCount}`} />
              <StatusPill ok={pendingApprovals === 0} label={`Pending approvals: ${pendingApprovals}`} />
            </div>
          </SectionCard>
        </TabsContent>

        {/* APPROVALS & QUALITY — sole home for review + coverage + quality dashboards */}
        <TabsContent value="quality" className="space-y-4 mt-4">
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Approvals &amp; Quality helps leaders check readiness before teachers deliver.</AlertTitle>
            <AlertDescription>
              Approve plans, monitor coverage and check planning quality from one place.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ExplainerCard icon={ShieldCheck} title="Lesson Plan Review"
              body="Principal approval ensures teachers only use complete, quality-checked plans."
              impact="Unapproved plans never appear in delivery mode."
              action="Open Lesson Plan Review" onAction={() => navigate("/curriculum/dashboard/all-plans")} />
            <ExplainerCard icon={Activity} title="Academic Overview"
              body="Cross-class snapshot of focus, evidence and child progress."
              action="Open Academic Overview" onAction={() => navigate("/curriculum/dashboard/review")} />
            <ExplainerCard icon={BarChart3} title="Curriculum Coverage"
              body="Which objectives and domains are being covered across classes."
              action="Open Coverage Dashboard" onAction={() => navigate("/curriculum/dashboard/coverage")} />
            <ExplainerCard icon={TrendingUp} title="Teacher Planning Quality"
              body="Highlights missing curriculum data before it affects lesson quality."
              action="Open Quality Dashboard" onAction={() => navigate("/curriculum/dashboard/quality")} />
            <ExplainerCard icon={Microscope} title="Next Focus Monitoring"
              body="Review AI-suggested observation focus across classes."
              action="Open Academic Overview" onAction={() => navigate("/curriculum/dashboard/review")} />
            <ExplainerCard icon={HeartHandshake} title="Parent Reinforcement"
              body="Vocabulary, books and weekly focus that flow to parents at home."
              impact="Strong weekly setup directly improves parent home practice."
              action="Open Weekly Plan" onAction={() => navigate("/curriculum/weekly")} />
          </div>

          <SectionCard title="Pending review">
            <div className="text-sm">Lesson plans awaiting review: <strong>{pendingApprovals}</strong></div>
          </SectionCard>

          <SectionCard title="Coming next">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-dashed"><CardContent className="pt-5 space-y-2">
                <div className="flex items-center gap-2"><div className="p-2 rounded-lg bg-muted text-muted-foreground"><GraduationCap className="h-4 w-4" /></div><p className="font-semibold text-sm">Lesson Delivery Tracking</p><Badge variant="outline" className="ml-auto text-[10px]">Coming next</Badge></div>
                <p className="text-xs text-muted-foreground">Daily planned vs delivered tracking with exposure analytics.</p>
              </CardContent></Card>
              <Card className="border-dashed"><CardContent className="pt-5 space-y-2">
                <div className="flex items-center gap-2"><div className="p-2 rounded-lg bg-muted text-muted-foreground"><Rocket className="h-4 w-4" /></div><p className="font-semibold text-sm">AI Improvement Loop</p><Badge variant="outline" className="ml-auto text-[10px]">Coming next</Badge></div>
                <p className="text-xs text-muted-foreground">AI recommends next lesson based on delivery, evidence and assessment.</p>
              </CardContent></Card>
            </div>
          </SectionCard>
        </TabsContent>

      </Tabs>
    </DashboardLayout>
  );
}