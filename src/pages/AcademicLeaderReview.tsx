import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, BookOpen, Eye, FileText, Users, TrendingUp, ClipboardCheck, Activity, CheckCircle2, RotateCcw, CalendarDays } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { toast } from "@/hooks/use-toast";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

const statusColors: Record<string, string> = {
  building: "bg-destructive/15 text-destructive",
  growing: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]",
  confident: "bg-accent/15 text-accent",
};
const domainKeys = ["language", "literacy", "numeracy", "motor", "social", "self_help"] as const;
const domainLabels: Record<string, string> = {
  language: "Language", literacy: "Literacy", numeracy: "Numeracy",
  motor: "Motor", social: "Social", self_help: "Self-Help",
};

export default function AcademicLeaderReview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { activeBranchIds: branchIds, selectedBranchId } = useGlobalBranch();
  const activeBranchId = selectedBranchId || branchIds[0];
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [returnNotes, setReturnNotes] = useState("");

  // ── Overview queries ──
  const { data: students } = useQuery({
    queryKey: ["students-review", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, class_id").eq("branch_id", activeBranchId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: lessonPlans } = useQuery({
    queryKey: ["plans-review", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("lesson_plans").select("status, user_id").in("branch_id", branchIds);
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const { data: ptmReports } = useQuery({
    queryKey: ["ptm-review", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_reports").select("status").eq("branch_id", activeBranchId!);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: coverageLogs } = useQuery({
    queryKey: ["coverage-review", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("class_coverage_logs").select("id").eq("branch_id", activeBranchId!);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  // ── Observation Trends queries ──
  const { data: classes = [] } = useQuery({
    queryKey: ["obs-dash-classes", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", activeBranchId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: obsEntries = [] } = useQuery({
    queryKey: ["obs-dash-entries", activeBranchId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("id, student_id, class_id, entry_type, visible_to_parent, created_by, created_at, domain_id")
        .gte("created_at", thirtyDaysAgo);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  // ── Teacher Quality queries ──
  const { data: observations = [] } = useQuery({
    queryKey: ["observations-quality", branchIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("observed_by, observed_at, students!inner(branch_id)")
        .in("students.branch_id", branchIds);
      return (data ?? []) as any[];
    },
    enabled: branchIds.length > 0,
  });

  const { data: journeyEntries = [] } = useQuery({
    queryKey: ["journey-quality", branchIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("created_by, visible_to_parent, parent_summary, students!inner(branch_id)")
        .in("students.branch_id", branchIds);
      return (data ?? []) as any[];
    },
    enabled: branchIds.length > 0,
  });

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-profiles-quality-teachers", branchIds],
    queryFn: async () => {
      const { data: members } = await supabase.from("branch_memberships").select("user_id").in("branch_id", branchIds);
      if (!members?.length) return [];
      const userIds = members.map(m => m.user_id);
      const { data: teacherRoles } = await supabase.from("user_roles").select("user_id").eq("role", "teacher").in("user_id", userIds);
      if (!teacherRoles?.length) return [];
      const teacherIds = teacherRoles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", teacherIds);
      return (profiles ?? []).map(p => ({
        user_id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.id,
      }));
    },
    enabled: branchIds.length > 0,
  });

  // ── Readiness queries ──
  const { data: snapshots = [] } = useQuery({
    queryKey: ["readiness-dash-snapshots", activeBranchId, selectedTerm, classes],
    queryFn: async () => {
      const classIds = classes.map((c: any) => c.id);
      if (!classIds.length) return [];
      const { data } = await supabase
        .from("class_readiness_snapshots")
        .select("*")
        .in("class_id", classIds)
        .eq("term", selectedTerm)
        .order("created_at", { ascending: false });
      const seen = new Set<string>();
      return (data ?? []).filter((s: any) => {
        if (seen.has(s.class_id)) return false;
        seen.add(s.class_id);
        return true;
      });
    },
    enabled: classes.length > 0,
  });


  // ── Plan Approvals queries ──
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const { data: pendingMonthPlans = [] } = useQuery({
    queryKey: ["pending-month-plans", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_month_plans")
        .select("*, curriculum_year_plans(title, age_groups(label), academic_years(year_name))")
        .eq("branch_id", activeBranchId!)
        .eq("review_status", "submitted")
        .order("submitted_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: pendingWeekPlans = [] } = useQuery({
    queryKey: ["pending-week-plans", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_week_plans")
        .select("*, curriculum_month_plans(theme, month_number, curriculum_year_plans(age_groups(label)))")
        .eq("branch_id", activeBranchId!)
        .eq("review_status", "submitted")
        .order("submitted_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: submitterProfiles = [] } = useQuery({
    queryKey: ["submitter-profiles", pendingMonthPlans, pendingWeekPlans],
    queryFn: async () => {
      const ids = new Set<string>();
      pendingMonthPlans.forEach((p: any) => p.submitted_by && ids.add(p.submitted_by));
      pendingWeekPlans.forEach((p: any) => p.submitted_by && ids.add(p.submitted_by));
      if (!ids.size) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", Array.from(ids));
      return (data ?? []) as any[];
    },
    enabled: pendingMonthPlans.length > 0 || pendingWeekPlans.length > 0,
  });

  const getSubmitterName = (uid: string) => {
    const p = submitterProfiles.find((s: any) => s.id === uid);
    return p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Staff";
  };

  const approveMonthPlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("curriculum_month_plans").update({
        status: "active", review_status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
      } as any).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-month-plans"] });
      toast({ title: "Monthly plan approved ✅" });
    },
  });

  const returnMonthPlan = useMutation({
    mutationFn: async ({ planId, notes }: { planId: string; notes: string }) => {
      const { error } = await supabase.from("curriculum_month_plans").update({
        review_status: "returned", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes: notes,
      } as any).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-month-plans"] });
      setReturnNotes("");
      toast({ title: "Plan returned for revision" });
    },
  });

  const approveWeekPlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("curriculum_week_plans").update({
        status: "active", review_status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString(),
      } as any).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-week-plans"] });
      toast({ title: "Weekly plan approved ✅" });
    },
  });

  const returnWeekPlan = useMutation({
    mutationFn: async ({ planId, notes }: { planId: string; notes: string }) => {
      const { error } = await supabase.from("curriculum_week_plans").update({
        review_status: "returned", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes: notes,
      } as any).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-week-plans"] });
      setReturnNotes("");
      toast({ title: "Plan returned for revision" });
    },
  });

  const pendingCount = pendingMonthPlans.length + pendingWeekPlans.length;

  // ── Computed metrics ──
  const totalStudents = students?.length || 0;
  const totalPlans = lessonPlans?.length || 0;
  const completedPlans = lessonPlans?.filter((l: any) => l.status === "completed").length || 0;
  const totalPtm = ptmReports?.length || 0;
  const publishedPtm = ptmReports?.filter((r: any) => r.status === "published").length || 0;
  const coverageEntries = coverageLogs?.length || 0;
  const planRate = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;
  const ptmRate = totalStudents > 0 ? Math.round((totalPtm / totalStudents) * 100) : 0;

  // Observation stats
  const obsStats = useMemo(() => {
    const totalEntries = obsEntries.length;
    const sharedCount = obsEntries.filter((e: any) => e.visible_to_parent).length;
    const uniqueStudents = new Set(obsEntries.map((e: any) => e.student_id)).size;
    const totalStud = students?.length || 0;
    const coveragePercent = totalStud > 0 ? Math.round((uniqueStudents / totalStud) * 100) : 0;
    const classCounts: Record<string, { total: number; shared: number; students: Set<string> }> = {};
    for (const cls of classes) { classCounts[cls.id] = { total: 0, shared: 0, students: new Set() }; }
    for (const e of obsEntries) {
      if (e.class_id && classCounts[e.class_id]) {
        classCounts[e.class_id].total++;
        if (e.visible_to_parent) classCounts[e.class_id].shared++;
        classCounts[e.class_id].students.add(e.student_id);
      }
    }
    return { totalEntries, sharedCount, uniqueStudents, totalStud, coveragePercent, classCounts };
  }, [obsEntries, students, classes]);

  const obsPerStudent = totalStudents > 0 ? (obsStats.totalEntries / totalStudents).toFixed(1) : "0";

  // Teacher metrics
  const teacherMetrics = staff.map((s: any) => {
    const uid = s.user_id;
    const plans = lessonPlans?.filter((l: any) => l.user_id === uid).length || 0;
    const completePlans = lessonPlans?.filter((l: any) => l.user_id === uid && l.status === "completed").length || 0;
    const obs = observations.filter((o: any) => o.observed_by === uid).length;
    const entries = journeyEntries.filter((j: any) => j.created_by === uid).length;
    const parentSummaries = journeyEntries.filter((j: any) => j.created_by === uid && j.visible_to_parent).length;
    return { uid, name: s.name, plans, completePlans, obs, entries, parentSummaries };
  });

  const metrics = [
    { label: "Active Students", value: totalStudents, icon: Users, color: "text-primary" },
    { label: "Lesson Plans", value: totalPlans, icon: BookOpen, color: "text-primary" },
    { label: "Plan Completion", value: `${planRate}%`, icon: TrendingUp, color: planRate >= 70 ? "text-accent" : "text-destructive" },
    { label: "Observations (30d)", value: obsStats.totalEntries, icon: Eye, color: "text-primary" },
    { label: "Obs/Student", value: obsPerStudent, icon: BarChart3, color: "text-primary" },
    { label: "PTM Reports", value: totalPtm, icon: FileText, color: "text-primary" },
    { label: "PTM Published", value: publishedPtm, icon: FileText, color: "text-accent" },
    { label: "Coverage Logs", value: coverageEntries, icon: BarChart3, color: "text-primary" },
  ];

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="quality" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Academic Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Comprehensive academic quality command center</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="approvals" className="relative">
              Plan Approvals
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="observations">Observation Trends</TabsTrigger>
            <TabsTrigger value="teachers">Teacher Quality</TabsTrigger>
            <TabsTrigger value="readiness">Readiness</TabsTrigger>
            <TabsTrigger value="next-focus">Next Focus</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ── */}
          <TabsContent value="overview">
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {metrics.map((m, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 text-center">
                      <m.icon className={`h-5 w-5 mx-auto mb-1 ${m.color}`} />
                      <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Key Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm font-medium">Lesson Plan Completion</span><span className="text-sm text-muted-foreground">{planRate}%</span></div>
                    <Progress value={planRate} className="h-3" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm font-medium">PTM Coverage</span><span className="text-sm text-muted-foreground">{ptmRate}%</span></div>
                    <Progress value={ptmRate} className="h-3" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1"><span className="text-sm font-medium">Observation Depth (target: 5/student)</span><span className="text-sm text-muted-foreground">{obsPerStudent}/5</span></div>
                    <Progress value={Math.min(Number(obsPerStudent) / 5 * 100, 100)} className="h-3" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Plan Approvals Tab ── */}
          <TabsContent value="approvals">
            <div className="space-y-6">
              {pendingCount === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg mb-2">No plans awaiting approval</p>
                  <p className="text-sm">All monthly and weekly plans are up to date.</p>
                </CardContent></Card>
              ) : (
                <>
                  {pendingMonthPlans.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" /> Monthly Plans ({pendingMonthPlans.length})
                      </CardTitle></CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto -mx-6 px-6">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Month</TableHead>
                                <TableHead>Theme</TableHead>
                                <TableHead>Age Group</TableHead>
                                <TableHead>Submitted By</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pendingMonthPlans.map((p: any) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium">{MONTHS[p.month_number - 1]}</TableCell>
                                  <TableCell>{p.theme || "—"}</TableCell>
                                  <TableCell>{p.curriculum_year_plans?.age_groups?.label || "—"}</TableCell>
                                  <TableCell>{getSubmitterName(p.submitted_by)}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex gap-1 justify-end">
                                      <Button size="sm" onClick={() => approveMonthPlan.mutate(p.id)} disabled={approveMonthPlan.isPending}>
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                      </Button>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button size="sm" variant="outline">
                                            <RotateCcw className="h-3 w-3 mr-1" /> Return
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72">
                                          <div className="space-y-2">
                                            <Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Feedback..." rows={2} />
                                            <Button size="sm" onClick={() => returnMonthPlan.mutate({ planId: p.id, notes: returnNotes })}>Confirm</Button>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {pendingWeekPlans.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-base flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" /> Weekly Plans ({pendingWeekPlans.length})
                      </CardTitle></CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto -mx-6 px-6">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Week</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Month Theme</TableHead>
                                <TableHead>Submitted By</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pendingWeekPlans.map((p: any) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium">W{p.week_number}</TableCell>
                                  <TableCell>{p.title || p.focus_area || "—"}</TableCell>
                                  <TableCell>{p.curriculum_month_plans?.theme || "—"}</TableCell>
                                  <TableCell>{getSubmitterName(p.submitted_by)}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex gap-1 justify-end">
                                      <Button size="sm" onClick={() => approveWeekPlan.mutate(p.id)} disabled={approveWeekPlan.isPending}>
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                      </Button>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button size="sm" variant="outline">
                                            <RotateCcw className="h-3 w-3 mr-1" /> Return
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72">
                                          <div className="space-y-2">
                                            <Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Feedback..." rows={2} />
                                            <Button size="sm" onClick={() => returnWeekPlan.mutate({ planId: p.id, notes: returnNotes })}>Confirm</Button>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Observation Trends Tab ── */}
          <TabsContent value="observations">
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="p-4 text-center">
                  <BarChart3 className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold">{obsStats.totalEntries}</p>
                  <p className="text-xs text-muted-foreground">Total (30 days)</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <Eye className="h-5 w-5 mx-auto mb-1 text-accent" />
                  <p className="text-2xl font-bold">{obsStats.sharedCount}</p>
                  <p className="text-xs text-muted-foreground">Shared with Parents</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-[hsl(var(--role-teacher))]" />
                  <p className="text-2xl font-bold">{obsStats.uniqueStudents}/{obsStats.totalStud}</p>
                  <p className="text-xs text-muted-foreground">Students Observed</p>
                </CardContent></Card>
                <Card><CardContent className="p-4 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-2xl font-bold">{obsStats.coveragePercent}%</p>
                  <p className="text-xs text-muted-foreground">Coverage Rate</p>
                </CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">By Class</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {classes.map((cls: any) => {
                    const data = obsStats.classCounts[cls.id];
                    if (!data) return null;
                    const classStudents = students?.filter((s: any) => s.class_id === cls.id).length || 0;
                    const pct = classStudents > 0 ? Math.round((data.students.size / classStudents) * 100) : 0;
                    return (
                      <div key={cls.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{cls.class_name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{data.total} obs</Badge>
                            <Badge variant="secondary" className="text-xs">{data.students.size}/{classStudents} students</Badge>
                          </div>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                  {!classes.length && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Eye className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">No classes found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Teacher Quality Tab ── */}
          <TabsContent value="teachers">
            <Card>
              <CardHeader><CardTitle className="text-base">Teacher Performance</CardTitle></CardHeader>
              <CardContent>
                {loadingStaff ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : teacherMetrics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No planning data available</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Teacher metrics will appear once lesson plans and observations are recorded.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-6 px-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Teacher</TableHead>
                          <TableHead className="text-center">Plans</TableHead>
                          <TableHead className="text-center">Completed</TableHead>
                          <TableHead className="text-center">Observations</TableHead>
                          <TableHead className="text-center">Journey Entries</TableHead>
                          <TableHead className="text-center">Parent Summaries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teacherMetrics.map((t) => (
                          <TableRow key={t.uid}>
                            <TableCell className="font-medium whitespace-nowrap">{t.name}</TableCell>
                            <TableCell className="text-center">{t.plans}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={t.completePlans === t.plans && t.plans > 0 ? "bg-accent/15 text-accent" : ""}>
                                {t.completePlans}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{t.obs}</TableCell>
                            <TableCell className="text-center">{t.entries}</TableCell>
                            <TableCell className="text-center">{t.parentSummaries}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Readiness Tab ── */}
          <TabsContent value="readiness">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Term 1", "Term 2", "Term 3", "Term 4"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!snapshots.length ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg mb-2">No readiness data yet</p>
                  <p className="text-sm">Generate snapshots from the Class Readiness page first</p>
                </CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Class</th>
                            {domainKeys.map(k => (
                              <th key={k} className="text-center py-2 px-2 font-medium">{domainLabels[k]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {snapshots.map((snap: any) => {
                            const cls = classes.find((c: any) => c.id === snap.class_id);
                            return (
                              <tr key={snap.id} className="border-b hover:bg-muted/50">
                                <td className="py-3 px-3 font-medium">{cls?.class_name || "Unknown"}</td>
                                {domainKeys.map(key => {
                                  const data = snap[`${key}_summary_json`] as any;
                                  const status = data?.overall_status || "N/A";
                                  return (
                                    <td key={key} className="py-3 px-2 text-center">
                                      <Badge className={`${statusColors[status] || "bg-muted text-muted-foreground"} text-xs`}>
                                        {status.charAt(0).toUpperCase() + status.slice(1)}
                                      </Badge>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Next Focus Monitoring Tab (Batch 6F-C) ── */}
          <TabsContent value="next-focus">
            <NextFocusMonitoring branchId={activeBranchId} classes={classes as any[]} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/* ── Batch 6F-C: Next Focus Monitoring ── */
function isoWeekStart(d: Date = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

function NextFocusMonitoring({
  branchId,
  classes,
}: {
  branchId: string | undefined;
  classes: any[];
}) {
  const [classFilter, setClassFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>(isoWeekStart());

  const { data, isLoading } = useQuery({
    queryKey: ["next-focus-monitoring", branchId, classFilter, weekFilter],
    enabled: !!branchId,
    queryFn: async () => {
      // Active students for the branch
      let sQ = supabase
        .from("students")
        .select("id, class_id, first_name, last_name")
        .eq("branch_id", branchId!)
        .eq("is_active", true);
      if (classFilter !== "all") sQ = sQ.eq("class_id", classFilter);
      const { data: students } = await sQ;
      const studentIds = (students ?? []).map((s: any) => s.id);
      if (studentIds.length === 0) {
        return { students: [], focuses: [], evidenceCounts: {} as Record<string, number> };
      }
      const { data: focuses } = await (supabase as any)
        .from("child_next_focus")
        .select("id, student_id, class_id, status, visible_to_parent, reviewed_at, week_starting")
        .eq("branch_id", branchId!)
        .eq("week_starting", weekFilter)
        .in("student_id", studentIds);
      const focusIds = (focuses ?? []).map((f: any) => f.id);
      let evidenceCounts: Record<string, number> = {};
      if (focusIds.length) {
        const { data: ev } = await (supabase as any)
          .from("child_next_focus_evidence")
          .select("focus_id")
          .in("focus_id", focusIds);
        (ev ?? []).forEach((r: any) => {
          evidenceCounts[r.focus_id] = (evidenceCounts[r.focus_id] ?? 0) + 1;
        });
      }
      return { students: students ?? [], focuses: focuses ?? [], evidenceCounts };
    },
  });

  const summary = useMemo(() => {
    const students = data?.students ?? [];
    const focuses = data?.focuses ?? [];
    const ev = data?.evidenceCounts ?? {};
    const focusByStudent = new Map<string, any>();
    focuses.forEach((f: any) => focusByStudent.set(f.student_id, f));
    const total = students.length;
    let generated = 0, reviewed = 0, parentVisible = 0, withEvidence = 0, unreviewed = 0;
    students.forEach((s: any) => {
      const f = focusByStudent.get(s.id);
      if (!f) return;
      generated++;
      if (f.status === "approved" || f.status === "teacher_reviewed") reviewed++;
      if (f.visible_to_parent) parentVisible++;
      if ((ev[f.id] ?? 0) > 0) withEvidence++;
      if (f.status === "suggested" && !f.reviewed_at) unreviewed++;
    });
    const missing = total - generated;
    // Per-class breakdown
    const byClass = new Map<string, any>();
    students.forEach((s: any) => {
      const cls = s.class_id ?? "_unassigned";
      if (!byClass.has(cls)) byClass.set(cls, { total: 0, generated: 0, approved: 0, evidence: 0, missing: 0, unreviewed: 0 });
      const row = byClass.get(cls);
      row.total++;
      const f = focusByStudent.get(s.id);
      if (f) {
        row.generated++;
        if (f.visible_to_parent) row.approved++;
        if ((ev[f.id] ?? 0) > 0) row.evidence++;
        if (f.status === "suggested" && !f.reviewed_at) row.unreviewed++;
      } else {
        row.missing++;
      }
    });
    return { total, generated, reviewed, parentVisible, withEvidence, missing, unreviewed, byClass };
  }, [data]);

  const classNameOf = (id: string) =>
    classes.find((c: any) => c.id === id)?.class_name ?? (id === "_unassigned" ? "Unassigned" : id.slice(0, 6));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="date"
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">Week starting (Monday)</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total children", value: summary.total },
          { label: "Focus generated", value: summary.generated },
          { label: "Teacher reviewed", value: summary.reviewed },
          { label: "Parent visible", value: summary.parentVisible },
          { label: "With evidence", value: summary.withEvidence },
          { label: "Missing focus", value: summary.missing },
          { label: "Unreviewed suggestions", value: summary.unreviewed },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">By class</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : summary.byClass.size === 0 ? (
            <p className="text-sm text-muted-foreground">No students for this filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Children</TableHead>
                  <TableHead className="text-right">Generated</TableHead>
                  <TableHead className="text-right">Parent visible</TableHead>
                  <TableHead className="text-right">Evidence</TableHead>
                  <TableHead className="text-right">Missing</TableHead>
                  <TableHead className="text-right">Unreviewed</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(summary.byClass.entries()).map(([cid, r]: any) => {
                  const action =
                    r.missing > 0 ? "Generate focus" :
                    r.unreviewed > 0 ? "Review suggestions" :
                    r.approved < r.generated ? "Approve for parents" :
                    r.evidence < r.approved ? "Link evidence" : "—";
                  return (
                    <TableRow key={cid}>
                      <TableCell className="font-medium">{classNameOf(cid)}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right">{r.generated}</TableCell>
                      <TableCell className="text-right">{r.approved}</TableCell>
                      <TableCell className="text-right">{r.evidence}</TableCell>
                      <TableCell className="text-right">{r.missing}</TableCell>
                      <TableCell className="text-right">{r.unreviewed}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{action}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
