import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const profValue: Record<string, number> = { TP1: 1, TP2: 2, TP3: 3 };
const profLabel: Record<string, string> = { TP1: "Belum Menguasai", TP2: "Menguasai", TP3: "Melebihi" };

export default function Analytics() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["analytics-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch all observations with related data
  const { data: observations, isLoading } = useQuery({
    queryKey: ["analytics-observations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("*, students(id, first_name, last_name, branch_id), curriculum_standards(id, code, title_ms, learning_area_id)")
        .order("observed_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: areas } = useQuery({
    queryKey: ["analytics-areas"],
    queryFn: async () => {
      const { data } = await supabase.from("learning_areas").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: allStandards } = useQuery({
    queryKey: ["analytics-standards"],
    queryFn: async () => {
      const { data } = await supabase.from("curriculum_standards").select("id, code, title_ms, learning_area_id, level").order("code");
      return data ?? [];
    },
  });

  // Filter by branch
  const filtered = useMemo(() => {
    if (!observations) return [];
    if (selectedBranch === "all") return observations;
    return observations.filter((o: any) => o.students?.branch_id === selectedBranch);
  }, [observations, selectedBranch]);

  // Section A: Coverage Heatmap data
  const heatmapData = useMemo(() => {
    if (!areas || !filtered.length) return [];
    return (areas || []).map((area: any) => {
      const areaObs = filtered.filter((o: any) => o.curriculum_standards?.learning_area_id === area.id);
      const studentMap = new Map<string, number[]>();
      areaObs.forEach((o: any) => {
        const sid = o.students?.id;
        if (!sid) return;
        if (!studentMap.has(sid)) studentMap.set(sid, []);
        studentMap.get(sid)!.push(profValue[o.proficiency_level] || 0);
      });
      const students = Array.from(studentMap.entries()).map(([id, scores]) => ({
        id,
        name: areaObs.find((o: any) => o.students?.id === id)?.students,
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      }));
      const totalAvg = students.length ? students.reduce((a, s) => a + s.avg, 0) / students.length : 0;
      return { area, students, totalAvg, obsCount: areaObs.length };
    });
  }, [areas, filtered]);

  // Section B: Proficiency Distribution
  const distributionData = useMemo(() => {
    if (!areas || !filtered.length) return [];
    return (areas || []).map((area: any) => {
      const areaObs = filtered.filter((o: any) => o.curriculum_standards?.learning_area_id === area.id);
      const total = areaObs.length || 1;
      const tp1 = areaObs.filter((o: any) => o.proficiency_level === "TP1").length;
      const tp2 = areaObs.filter((o: any) => o.proficiency_level === "TP2").length;
      const tp3 = areaObs.filter((o: any) => o.proficiency_level === "TP3").length;
      return {
        name: area.code,
        fullName: area.name_ms,
        TP1: Math.round((tp1 / total) * 100),
        TP2: Math.round((tp2 / total) * 100),
        TP3: Math.round((tp3 / total) * 100),
      };
    });
  }, [areas, filtered]);

  // Section C: Gap Analysis
  const gapData = useMemo(() => {
    if (!allStandards || !filtered.length) return [];
    const standardStats = new Map<string, { code: string; title: string; scores: number[]; count: number }>();
    (allStandards || []).filter((s: any) => s.level === "sub_standard" || s.level === "standard").forEach((s: any) => {
      standardStats.set(s.id, { code: s.code, title: s.title_ms, scores: [], count: 0 });
    });
    filtered.forEach((o: any) => {
      const stat = standardStats.get(o.standard_id);
      if (stat) {
        stat.scores.push(profValue[o.proficiency_level] || 0);
        stat.count++;
      }
    });
    return Array.from(standardStats.values())
      .map((s) => ({
        ...s,
        avg: s.scores.length ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length : 0,
      }))
      .sort((a, b) => a.avg - b.avg || a.count - b.count)
      .slice(0, 15);
  }, [allStandards, filtered]);

  // Section D: Trend Over Time
  const trendData = useMemo(() => {
    if (!filtered.length) return [];
    const monthMap = new Map<string, { count: number; totalScore: number }>();
    filtered.forEach((o: any) => {
      const month = o.observed_at?.slice(0, 7); // YYYY-MM
      if (!month) return;
      if (!monthMap.has(month)) monthMap.set(month, { count: 0, totalScore: 0 });
      const m = monthMap.get(month)!;
      m.count++;
      m.totalScore += profValue[o.proficiency_level] || 0;
    });
    return Array.from(monthMap.entries())
      .map(([month, d]) => ({
        month,
        observations: d.count,
        avgProficiency: +(d.totalScore / d.count).toFixed(2),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const getHeatColor = (avg: number) => {
    if (avg === 0) return "bg-muted text-muted-foreground";
    if (avg < 1.5) return "bg-destructive/20 text-destructive";
    if (avg < 2.5) return "bg-[hsl(var(--role-teacher))]/20 text-[hsl(var(--role-teacher))]";
    return "bg-accent/20 text-accent";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analitik / Analytics</h1>
            <p className="text-sm text-muted-foreground">Curriculum coverage, proficiency trends, and gap analysis</p>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Loading analytics...</CardContent></Card>
        ) : !filtered.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No observation data available yet.</CardContent></Card>
        ) : (
          <Tabs defaultValue="coverage" className="space-y-4">
            <TabsList>
              <TabsTrigger value="coverage">Coverage</TabsTrigger>
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
              <TabsTrigger value="gaps">Gap Analysis</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            {/* Coverage Heatmap */}
            <TabsContent value="coverage" className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Coverage by Learning Area</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {heatmapData.map((row) => (
                      <div key={row.area.id} className="flex items-center gap-3">
                        <div className="w-24 shrink-0 text-xs font-medium">{row.area.code}</div>
                        <div className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${getHeatColor(row.totalAvg)}`}>
                          {row.area.name_ms}
                          <span className="ml-2 text-xs opacity-70">
                            ({row.obsCount} obs, {row.students.length} students,
                            avg {row.totalAvg ? row.totalAvg.toFixed(1) : "–"})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Proficiency Distribution */}
            <TabsContent value="distribution">
              <Card>
                <CardHeader><CardTitle className="text-base">Proficiency Distribution by Learning Area</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={distributionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
                        formatter={(v: number, name: string) => [`${v}%`, profLabel[name] || name]}
                      />
                      <Legend />
                      <Bar dataKey="TP1" stackId="a" fill="hsl(var(--destructive))" name="TP1" />
                      <Bar dataKey="TP2" stackId="a" fill="hsl(var(--role-teacher))" name="TP2" />
                      <Bar dataKey="TP3" stackId="a" fill="hsl(var(--accent))" name="TP3" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Gap Analysis */}
            <TabsContent value="gaps">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Standards Needing Attention
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {gapData.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                        <Badge variant="outline" className="font-mono text-xs shrink-0">{s.code}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.count} observations • Avg: {s.avg ? s.avg.toFixed(1) : "No data"}
                          </p>
                        </div>
                        <Badge variant="outline" className={getHeatColor(s.avg)}>
                          {s.avg === 0 ? "Unassessed" : s.avg < 1.5 ? "TP1" : s.avg < 2.5 ? "TP2" : "TP3"}
                        </Badge>
                      </div>
                    ))}
                    {!gapData.length && (
                      <p className="text-center text-sm text-muted-foreground py-4">No standards data to analyse.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Trends */}
            <TabsContent value="trends">
              <Card>
                <CardHeader><CardTitle className="text-base">Monthly Trends</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" domain={[1, 3]} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
                      />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="observations" stroke="hsl(var(--primary))" name="Observations" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="avgProficiency" stroke="hsl(var(--accent))" name="Avg Proficiency" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
