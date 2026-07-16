import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Plus, Trash2, CheckCircle2, PauseCircle, BookOpen, Activity, Sparkles, Loader2, AlertTriangle, Lock } from "lucide-react";
import { format } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";

interface Props {
  studentId: string;
  branchId: string;
}

const TREND_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 70% 50%)",
  "hsl(30 80% 55%)",
  "hsl(280 60% 55%)",
  "hsl(160 60% 45%)",
  "hsl(0 70% 55%)",
  "hsl(340 70% 50%)",
];

export default function StudentGrowthTab({ studentId, branchId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState<any>({
    scope: "parent", title: "", description: "", target_domain_id: "", target_proficiency: "3", target_date: "",
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["growth-assessments", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("*")
        .eq("student_id", studentId)
        .order("date_evaluated", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  // Pull pre-enrollment context (parent / school goals) once enrolled.
  const { data: preEnrollment } = useQuery<any>({
    queryKey: ["growth-pre-enrollment", studentId],
    queryFn: async () => {
      const { data: lead } = await (supabase as any)
        .from("leads")
        .select("pre_enrollment_assessment, child_name")
        .eq("student_id", studentId)
        .maybeSingle();
      return (lead as any)?.pre_enrollment_assessment ?? null;
    },
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("id, code, name").order("sort_order");
      return data ?? [];
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["child-goals", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("child_goals" as any)
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: rollup = [] } = useQuery({
    queryKey: ["domain-rollup", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v_student_domain_rollup" as any)
        .select("*")
        .eq("student_id", studentId);
      return (data ?? []) as any[];
    },
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["child-goal-progress", studentId, (goals as any[]).map(g => g.id).join(",")],
    enabled: (goals as any[]).length > 0,
    queryFn: async () => {
      const ids = (goals as any[]).map((g: any) => g.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("child_goal_progress" as any)
        .select("*")
        .in("goal_id", ids)
        .order("recorded_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  // Trend lines per domain (KSPK 7 domains)
  const trendData = useMemo(() => {
    return assessments.map((a: any, i) => {
      const row: any = {
        label: a.date_evaluated ? format(new Date(a.date_evaluated), "MMM d") : `#${i + 1}`,
        isBaseline: i === 0 || a.assessment_type === "baseline",
      };
      for (const d of KSPK_DOMAINS) {
        const v = readDomainScore(a, d.code);
        if (v != null) row[d.short] = v;
      }
      return row;
    });
  }, [assessments]);

  // Regression flags: latest vs baseline, ≥0.5 drop = amber callout.
  const regressionFlags = useMemo(() => {
    if (assessments.length < 2) return [] as { code: string; name: string; delta: number }[];
    const first = assessments[0];
    const last = assessments[assessments.length - 1];
    const out: { code: string; name: string; delta: number }[] = [];
    for (const d of KSPK_DOMAINS) {
      const a = readDomainScore(first, d.code);
      const b = readDomainScore(last, d.code);
      if (a == null || b == null) continue;
      const delta = Math.round((b - a) * 10) / 10;
      if (delta <= -0.5) out.push({ code: d.code, name: d.name, delta });
    }
    return out;
  }, [assessments]);

  // Radar: initial vs latest, across 7 KSPK domains
  const radarData = useMemo(() => {
    if (!assessments.length) return [];
    const first = assessments[0];
    const last = assessments[assessments.length - 1];
    return KSPK_DOMAINS.map((d) => ({
      area: d.short,
      initial: readDomainScore(first, d.code) ?? 0,
      latest: readDomainScore(last, d.code) ?? 0,
      fullMark: 5,
    }));
  }, [assessments]);

  const createGoal = useMutation({
    mutationFn: async () => {
      if (!goalForm.title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("child_goals" as any).insert({
        student_id: studentId,
        branch_id: branchId,
        scope: goalForm.scope,
        title: goalForm.title.trim(),
        description: goalForm.description.trim() || null,
        target_domain_id: goalForm.target_domain_id || null,
        target_proficiency: goalForm.target_proficiency ? parseInt(goalForm.target_proficiency) : null,
        target_date: goalForm.target_date || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["child-goals", studentId] });
      setGoalOpen(false);
      setGoalForm({ scope: "parent", title: "", description: "", target_domain_id: "", target_proficiency: "3", target_date: "" });
      toast({ title: "Goal added" });
    },
    onError: (e: any) => toast({ title: "Could not add goal", description: e.message, variant: "destructive" }),
  });

  const updateGoalStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("child_goals" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["child-goals", studentId] }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("child_goals" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["child-goals", studentId] }),
  });

  const progressByGoal = useMemo(() => {
    const map = new Map<string, number>();
    (progress as any[]).forEach((p: any) => map.set(p.goal_id, (map.get(p.goal_id) ?? 0) + 1));
    return map;
  }, [progress]);

  // Pre-enrollment goals extracted from the intake dialog (informational seeds).
  const seedGoals = useMemo(() => {
    const ctx = (preEnrollment as any)?.context ?? {};
    const parents = (ctx.parent_goals ?? "").trim();
    const teachers = (ctx.teacher_recommendation ?? "").trim();
    const out: { scope: "parent" | "school"; text: string }[] = [];
    if (parents) out.push({ scope: "parent", text: parents });
    if (teachers) out.push({ scope: "school", text: teachers });
    return out;
  }, [preEnrollment]);

  return (
    <div className="space-y-4">
      {/* Baseline marker */}
      {assessments.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Baseline locked:</span>
            <span className="text-muted-foreground">
              {assessments[0].date_evaluated ? format(new Date(assessments[0].date_evaluated), "d MMM yyyy") : "—"}
            </span>
            <Badge variant="outline" className="text-[10px]">{assessments.length} assessment{assessments.length === 1 ? "" : "s"}</Badge>
          </div>
          {regressionFlags.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">{regressionFlags.length} domain{regressionFlags.length === 1 ? "" : "s"} regressed</span>
              <span className="hidden sm:inline text-muted-foreground">
                ({regressionFlags.map(r => `${r.code} ${r.delta}`).join(", ")})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Top: 7 KSPK domain trend cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {KSPK_DOMAINS.map((d) => {
          const latest = assessments[assessments.length - 1];
          const first = assessments[0];
          const cur = readDomainScore(latest, d.code);
          const init = readDomainScore(first, d.code);
          const delta = (cur != null && init != null) ? Math.round((cur - init) * 10) / 10 : null;
          return (
            <Card key={d.code}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{d.short}</p>
                  <Badge variant="outline" className="text-[9px] py-0">{d.code}</Badge>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-semibold tabular-nums">{cur ?? "—"}<span className="text-xs text-muted-foreground">/5</span></p>
                  {delta != null && delta !== 0 && (
                    <Badge variant={delta > 0 ? "default" : "secondary"} className="text-[10px] h-5">
                      {delta > 0 ? "+" : ""}{delta}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate" title={d.name}>{d.name}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Trend + Radar */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Domain Trends</CardTitle></CardHeader>
          <CardContent>
            {trendData.length < 2 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Need 2+ assessments to show trends. Add one from the Assessments tab.</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {KSPK_DOMAINS.map((d, i) => (
                      <Line
                        key={d.code}
                        type="monotone"
                        dataKey={d.short}
                        stroke={TREND_COLORS[i % TREND_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Initial vs Latest</CardTitle></CardHeader>
          <CardContent>
            {radarData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No assessments yet.</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="area" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 9 }} />
                    <Radar name="Initial" dataKey="initial" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.15} />
                    <Radar name="Latest" dataKey="latest" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Parent & School Goals</CardTitle>
            <Button size="sm" onClick={() => setGoalOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add goal</Button>
          </div>
        </CardHeader>
        <CardContent>
          {seedGoals.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mb-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold">Captured at intake</p>
                <Badge variant="outline" className="text-[10px]">From admissions</Badge>
              </div>
              {seedGoals.map((s, i) => (
                <div key={i} className="text-xs">
                  <Badge variant={s.scope === "parent" ? "secondary" : "default"} className="text-[10px] mr-2 capitalize">{s.scope}</Badge>
                  <span className="text-muted-foreground whitespace-pre-wrap">{s.text}</span>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground italic">Click "Add goal" to turn any of these into a trackable goal with progress evidence.</p>
            </div>
          )}
          {goals.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {seedGoals.length > 0
                ? "No tracked goals yet. Promote one of the intake goals above by clicking \"Add goal\"."
                : "No goals yet. Add a parent goal (e.g. \"Eat independently\") or a school goal (e.g. \"Recognise letters A–E\") to start tracking progress."}
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {(goals as any[]).map((g: any) => {
                const evidence = progressByGoal.get(g.id) ?? 0;
                const pct = Math.min(100, evidence * 20); // 5 evidence items ≈ "complete"
                const domain = (domains as any[]).find((d: any) => d.id === g.target_domain_id);
                return (
                  <div key={g.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={g.scope === "parent" ? "secondary" : "default"} className="text-[10px]">{g.scope}</Badge>
                          {domain && <Badge variant="outline" className="text-[10px]">{domain.code}</Badge>}
                          {g.status !== "active" && <Badge variant="outline" className="text-[10px]">{g.status}</Badge>}
                        </div>
                        <p className="text-sm font-medium mt-1 break-words">{g.title}</p>
                        {g.description && <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        {g.status === "active" ? (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateGoalStatus.mutate({ id: g.id, status: "achieved" })} title="Mark achieved">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateGoalStatus.mutate({ id: g.id, status: "active" })} title="Reactivate">
                            <PauseCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if (confirm("Delete this goal?")) deleteGoal.mutate(g.id); }} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{evidence} evidence item{evidence === 1 ? "" : "s"}</span>
                        {g.target_date && <span>by {format(new Date(g.target_date), "d MMM yyyy")}</span>}
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observation rollup (90 days) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Learning Journey Rollup (90 days)</CardTitle></CardHeader>
        <CardContent>
          {rollup.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No observations recorded in the last 90 days. Observations recorded against KSPK standards will appear here as evidence per developmental domain.</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {(rollup as any[]).map((r: any) => (
                <div key={r.domain_id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{r.domain_name}</p>
                    <Badge variant="outline" className="text-[10px]">{r.domain_code}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {r.obs_30d} obs / 30d · {r.obs_90d} / 90d
                  </p>
                  {r.avg_prof_90d != null && (
                    <p className="text-[10px] text-muted-foreground">Avg TP {r.avg_prof_90d}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal dialog */}
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add growth goal</DialogTitle>
            <DialogDescription>Goals from parents and the school feed the AI lesson planner so activities are personalized for this child.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Scope</Label>
              <Select value={goalForm.scope} onValueChange={(v) => setGoalForm({ ...goalForm, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent goal</SelectItem>
                  <SelectItem value="school">School goal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} placeholder="e.g. Eat lunch independently" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Developmental domain</Label>
                <Select value={goalForm.target_domain_id || "__none__"} onValueChange={(v) => setGoalForm({ ...goalForm, target_domain_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(domains as any[]).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.code} · {d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target date</Label>
                <Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button onClick={() => createGoal.mutate()} disabled={createGoal.isPending}>
              {createGoal.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Add goal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}