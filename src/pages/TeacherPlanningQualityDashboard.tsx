import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Eye, FileText, TrendingUp, BookOpen } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function TeacherPlanningQualityDashboard() {
  const { activeBranchIds: branchIds, isLoading: branchesLoading } = useGlobalBranch();

  const { data: lessonPlans, isLoading: loadingPlans } = useQuery({
    queryKey: ["lesson-plans-quality", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("lesson_plans").select("*").in("branch_id", branchIds);
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const { data: observations, isLoading: loadingObs } = useQuery({
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

  const { data: journeyEntries, isLoading: loadingJourney } = useQuery({
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

  // Only fetch teachers (not all branch members)
  const { data: staff, isLoading: loadingStaff } = useQuery({
    queryKey: ["staff-profiles-quality-teachers", branchIds],
    queryFn: async () => {
      // Step 1: Get all branch member user_ids
      const { data: members } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", branchIds);
      if (!members || members.length === 0) return [];

      const userIds = members.map(m => m.user_id);

      // Step 2: Filter to only teachers
      const { data: teacherRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "teacher")
        .in("user_id", userIds);
      if (!teacherRoles || teacherRoles.length === 0) return [];

      const teacherIds = teacherRoles.map(r => r.user_id);

      // Step 3: Get profiles for teachers only
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", teacherIds);

      return (profiles ?? []).map(p => ({
        user_id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.id,
      }));
    },
    enabled: branchIds.length > 0,
  });

  const isLoading = branchesLoading || loadingPlans || loadingObs || loadingJourney || loadingStaff;

  const teacherMetrics = staff?.map((s: any) => {
    const uid = s.user_id;
    const name = s.name;
    const plans = lessonPlans?.filter((l: any) => l.user_id === uid).length || 0;
    const completePlans = lessonPlans?.filter((l: any) => l.user_id === uid && l.status === "completed").length || 0;
    const obs = observations?.filter((o: any) => o.observed_by === uid).length || 0;
    const entries = journeyEntries?.filter((j: any) => j.created_by === uid).length || 0;
    const parentSummaries = journeyEntries?.filter((j: any) => j.created_by === uid && j.visible_to_parent).length || 0;
    return { uid, name, plans, completePlans, obs, entries, parentSummaries };
  }) ?? [];

  const totalPlans = lessonPlans?.length || 0;
  const completedPlans = lessonPlans?.filter((l: any) => l.status === "completed").length || 0;
  const totalObs = observations?.length || 0;
  const totalEntries = journeyEntries?.length || 0;
  const planCompletionRate = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Teacher Planning Quality
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor lesson planning, observations, and parent communication quality</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="p-4 text-center">
                  <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{totalPlans}</p>
                  <p className="text-xs text-muted-foreground">Total Lesson Plans</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto text-accent mb-1" />
                  <p className="text-2xl font-bold text-accent">{planCompletionRate}%</p>
                  <p className="text-xs text-muted-foreground">Plan Completion</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Eye className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{totalObs}</p>
                  <p className="text-xs text-muted-foreground">Observations</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{totalEntries}</p>
                  <p className="text-xs text-muted-foreground">Journey Entries</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Teacher Performance</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
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
      </div>
    </DashboardLayout>
  );
}