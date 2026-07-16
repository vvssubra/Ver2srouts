import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Users, Eye, TrendingUp } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function ObservationDashboard() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-obs-dash"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(name)").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = selectedBranch || memberships[0]?.branch_id || "";

  const { data: classes = [] } = useQuery({
    queryKey: ["obs-dash-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["obs-dash-entries", branchId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("id, student_id, class_id, entry_type, visible_to_parent, created_by, created_at, domain_id")
        .gte("created_at", thirtyDaysAgo);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["obs-dash-students", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, class_id").eq("branch_id", branchId).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const stats = useMemo(() => {
    const totalEntries = entries.length;
    const sharedCount = entries.filter((e: any) => e.visible_to_parent).length;
    const uniqueStudents = new Set(entries.map((e: any) => e.student_id)).size;
    const totalStudents = students.length;
    const coveragePercent = totalStudents > 0 ? Math.round((uniqueStudents / totalStudents) * 100) : 0;

    // Per-class stats
    const classCounts: Record<string, { total: number; shared: number; students: Set<string> }> = {};
    for (const cls of classes) {
      classCounts[cls.id] = { total: 0, shared: 0, students: new Set() };
    }
    for (const e of entries) {
      if (e.class_id && classCounts[e.class_id]) {
        classCounts[e.class_id].total++;
        if (e.visible_to_parent) classCounts[e.class_id].shared++;
        classCounts[e.class_id].students.add(e.student_id);
      }
    }

    return { totalEntries, sharedCount, uniqueStudents, totalStudents, coveragePercent, classCounts };
  }, [entries, students, classes]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Observation Dashboard</h1>
          <p className="text-sm text-muted-foreground">Last 30 days observation completion overview</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{stats.totalEntries}</p>
              <p className="text-xs text-muted-foreground">Total Observations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Eye className="h-6 w-6 mx-auto mb-2 text-accent" />
              <p className="text-2xl font-bold">{stats.sharedCount}</p>
              <p className="text-xs text-muted-foreground">Shared with Parents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-6 w-6 mx-auto mb-2 text-[hsl(var(--role-teacher))]" />
              <p className="text-2xl font-bold">{stats.uniqueStudents}/{stats.totalStudents}</p>
              <p className="text-xs text-muted-foreground">Students Observed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{stats.coveragePercent}%</p>
              <p className="text-xs text-muted-foreground">Coverage Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Per-class breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-sm">By Class</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {classes.map((cls: any) => {
              const data = stats.classCounts[cls.id];
              if (!data) return null;
              const classStudents = students.filter((s: any) => s.class_id === cls.id).length;
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
                <p className="text-xs text-muted-foreground/70 mt-1">Ensure classes are set up in your branch to see observation data.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
