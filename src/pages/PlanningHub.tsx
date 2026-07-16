import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Target, BookOpen, CalendarDays, CalendarRange,
  Microscope, GraduationCap, ArrowRight, Layers, CheckCircle2,
  AlertCircle, ClipboardList
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PlanningHub() {
  const { role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const navigate = useNavigate();
  const isTeacher = role === "teacher";

  // Academic years
  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years-hub", selectedBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("branch_id", selectedBranchId!)
        .order("start_date", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId,
  });

  const activeYear = academicYears.find((y: any) => y.is_active) || academicYears[0];
  const [selectedYearId, setSelectedYearId] = useState("");
  const yearId = selectedYearId || activeYear?.id || "";

  // Age groups
  const { data: ageGroups = [] } = useQuery({
    queryKey: ["age-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("age_groups").select("*").order("sort_order");
      return (data as any[]) ?? [];
    },
  });

  // Domains
  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return (data as any[]) ?? [];
    },
  });

  // Year plans for this branch & year
  const { data: yearPlans = [] } = useQuery({
    queryKey: ["hub-year-plans", selectedBranchId, yearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_year_plans")
        .select("*, age_groups(code, label)")
        .eq("branch_id", selectedBranchId!)
        .eq("academic_year_id", yearId);
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId && !!yearId,
  });

  // Month plans across all year plans
  const yearPlanIds = yearPlans.map((yp: any) => yp.id);
  const { data: monthPlans = [] } = useQuery({
    queryKey: ["hub-month-plans", yearPlanIds],
    queryFn: async () => {
      if (yearPlanIds.length === 0) return [];
      const { data } = await supabase
        .from("curriculum_month_plans")
        .select("id, year_plan_id, month_number, theme, status, review_status")
        .in("year_plan_id", yearPlanIds);
      return (data as any[]) ?? [];
    },
    enabled: yearPlanIds.length > 0,
  });

  // Week plans
  const monthPlanIds = monthPlans.map((mp: any) => mp.id);
  const { data: weekPlans = [] } = useQuery({
    queryKey: ["hub-week-plans", monthPlanIds],
    queryFn: async () => {
      if (monthPlanIds.length === 0) return [];
      const { data } = await supabase
        .from("curriculum_week_plans")
        .select("id, month_plan_id, week_number, review_status")
        .in("month_plan_id", monthPlanIds);
      return (data as any[]) ?? [];
    },
    enabled: monthPlanIds.length > 0,
  });

  // Learning goals count
  const { data: goalsCount = 0 } = useQuery({
    queryKey: ["hub-goals-count"],
    queryFn: async () => {
      const { count } = await supabase.from("yearly_outcomes").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  // Objectives count
  const { data: objectivesCount = 0 } = useQuery({
    queryKey: ["hub-objectives-count"],
    queryFn: async () => {
      const { count } = await supabase.from("lesson_objectives").select("id", { count: "exact", head: true }).eq("is_active", true);
      return count ?? 0;
    },
  });

  // Lesson plans count for branch
  const { data: lessonPlansCount = 0 } = useQuery({
    queryKey: ["hub-lesson-plans", selectedBranchId],
    queryFn: async () => {
      const { count } = await supabase.from("lesson_plans").select("id", { count: "exact", head: true }).eq("branch_id", selectedBranchId!);
      return count ?? 0;
    },
    enabled: !!selectedBranchId,
  });

  // Observations count
  const { data: observationsCount = 0 } = useQuery({
    queryKey: ["hub-observations", selectedBranchId],
    queryFn: async () => {
      const { count } = await supabase.from("student_observations" as any).select("id", { count: "exact", head: true }).eq("branch_id", selectedBranchId!);
      return count ?? 0;
    },
    enabled: !!selectedBranchId,
  });

  // Calculate progress
  const totalMonthSlots = yearPlans.length * 12;
  const monthsDone = monthPlans.length;
  const monthsApproved = monthPlans.filter((m: any) => m.review_status === "approved").length;
  const weeksDone = weekPlans.length;
  const weeksApproved = weekPlans.filter((w: any) => w.review_status === "approved").length;

  const monthProgress = totalMonthSlots > 0 ? Math.round((monthsDone / totalMonthSlots) * 100) : 0;

  const currentMonth = new Date().getMonth() + 1;
  const selectedYearObj = academicYears.find((y: any) => y.id === yearId);

  const quickLinks = [
    { label: "Learning Goals", icon: Target, path: "/yearly-outcomes", count: goalsCount, color: "text-primary" },
    { label: "Lesson Objectives", icon: ClipboardList, path: "/objective-bank", count: objectivesCount, color: "text-info" },
    { label: "Yearly Planner", icon: CalendarDays, path: "/yearly-planner", count: yearPlans.length, color: "text-primary-deep" },
    { label: "Monthly Planner", icon: CalendarRange, path: "/curriculum/monthly", count: monthsDone, color: "text-warning" },
    { label: "Weekly Focus", icon: BookOpen, path: "/curriculum/weekly", count: weeksDone, color: "text-primary" },
    { label: "Lesson Plans", icon: GraduationCap, path: "/lesson-planner", count: lessonPlansCount, color: "text-primary-deep" },
    { label: "Observations", icon: Microscope, path: "/curriculum/observations/record", count: observationsCount, color: "text-success" },
  ];

  const teacherQuickLinks = [
    { label: "Lesson Plans", icon: GraduationCap, path: "/lesson-planner", count: lessonPlansCount, color: "text-primary-deep" },
    { label: "Observations", icon: Microscope, path: "/curriculum/observations/record", count: observationsCount, color: "text-success" },
  ];
  const visibleQuickLinks = isTeacher ? teacherQuickLinks : quickLinks;

  // Teacher-focused simplified hub
  if (isTeacher) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Planning
            </h1>
            <p className="text-muted-foreground">
              Plan today's lessons and capture observations for your students.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {teacherQuickLinks.map((link) => (
              <Card
                key={link.path}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => navigate(link.path)}
              >
                <CardContent className="pt-5 pb-5 flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-muted ${link.color}`}>
                    <link.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.count} {link.count === 1 ? "item" : "items"}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Planning Hub
            </h1>
            <p className="text-muted-foreground">
              Your curriculum planning command center — track progress and navigate all planning modules.
            </p>
          </div>
          {academicYears.length > 1 && (
            <Select value={yearId} onValueChange={setSelectedYearId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y: any) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.year_name} {y.is_active && "✦"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Current Context */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Academic Year</p>
                <p className="text-lg font-semibold mt-1">{selectedYearObj?.year_name || "Not set"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Age Groups</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {ageGroups.map((ag: any) => (
                    <Badge key={ag.id} variant="secondary" className="text-xs">{ag.label}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Domains</p>
                <p className="text-lg font-semibold mt-1">{domains.length} domains</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Month</p>
                <p className="text-lg font-semibold mt-1">
                  {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{monthsDone}</span>
                <span className="text-sm text-muted-foreground mb-1">/ {totalMonthSlots} months</span>
              </div>
              <Progress value={monthProgress} className="mt-2 h-2" />
              <div className="flex gap-2 mt-2">
                <Badge variant="default" className="text-xs">{monthsApproved} approved</Badge>
                {monthsDone - monthsApproved > 0 && (
                  <Badge variant="outline" className="text-xs">{monthsDone - monthsApproved} pending</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Weekly Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{weeksDone}</span>
                <span className="text-sm text-muted-foreground mb-1">created</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Badge variant="default" className="text-xs">{weeksApproved} approved</Badge>
                {weeksDone - weeksApproved > 0 && (
                  <Badge variant="outline" className="text-xs">{weeksDone - weeksApproved} pending</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Curriculum Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-success" />
                  <span>{goalsCount} goals</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                  <span>{objectivesCount} objectives</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-primary-deep" />
                  <span>{lessonPlansCount} lessons</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Microscope className="h-3.5 w-3.5 text-teal-600" />
                  <span>{observationsCount} observations</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Navigation</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
              <Card
                key={link.path}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => navigate(link.path)}
              >
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${link.color}`}>
                    <link.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.count} items</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Planning Workflow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Planning Workflow</CardTitle>
            <CardDescription>Follow this sequence to build your curriculum plan from top to bottom</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { step: "1", label: "Framework & Domains", path: "/curriculum-framework", done: domains.length > 0 },
                { step: "2", label: "Learning Goals", path: "/yearly-outcomes", done: goalsCount > 0 },
                { step: "3", label: "Lesson Objectives", path: "/objective-bank", done: objectivesCount > 0 },
                { step: "4", label: "Theme Bank", path: "/theme-bank", done: true },
                { step: "5", label: "Yearly Planner", path: "/yearly-planner", done: yearPlans.length > 0 },
                { step: "6", label: "Monthly Scope", path: "/curriculum/monthly", done: monthsDone > 0 },
                { step: "7", label: "Weekly Plans", path: "/curriculum/weekly", done: weeksDone > 0 },
                { step: "8", label: "Lesson Plans", path: "/lesson-planner", done: lessonPlansCount > 0 },
                { step: "9", label: "Observations", path: "/curriculum/observations/record", done: observationsCount > 0 },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Button
                    variant={item.done ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => navigate(item.path)}
                  >
                    {item.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    <span className="text-xs font-medium">{item.step}. {item.label}</span>
                  </Button>
                  {i < 8 && <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:block" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Per Age Group Breakdown */}
        {yearPlans.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">By Age Group</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {yearPlans.map((yp: any) => {
                const ypMonths = monthPlans.filter((m: any) => m.year_plan_id === yp.id);
                const ypWeeks = weekPlans.filter((w: any) => ypMonths.some((m: any) => m.id === w.month_plan_id));
                const pct = Math.round((ypMonths.length / 12) * 100);
                return (
                  <Card key={yp.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{yp.age_groups?.label}</Badge>
                          <Badge variant={yp.status === "active" ? "default" : "outline"} className="text-xs">
                            {yp.status}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/curriculum/monthly?yearPlanId=${yp.id}&ageGroup=${yp.age_groups?.label}`)}
                        >
                          Open <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Monthly plans: {ypMonths.length}/12</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-muted-foreground">{ypWeeks.length} weekly plans</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
