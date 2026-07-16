import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, BookOpen, ClipboardList, Calendar, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { backFromStudent } from "@/hooks/use-back-to-student";
import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";

interface Props {
  studentId: string;
  classId?: string;
  branchId: string;
  /**
   * When provided, the "Record Observation" button calls this instead of
   * navigating away — used by the Progress hub to open the unified
   * observation drawer.
   */
  onRecordObservation?: () => void;
}

export default function StudentAcademicTab({ studentId, classId, branchId, onRecordObservation }: Props) {
  const navigate = useNavigate();

  const { data: observations } = useQuery({
    queryKey: ["student-obs-summary", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("id, observed_at, proficiency_level, curriculum_standards(code, title_ms)")
        .eq("student_id", studentId)
        .order("observed_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: lessonPlans } = useQuery({
    queryKey: ["class-lesson-plans", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_plans")
        .select("id, title, theme, status, created_at")
        .eq("class_id", classId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!classId,
  });

  const { data: ptmReports } = useQuery({
    queryKey: ["student-ptm-count", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ptm_reports")
        .select("id, term_name, status, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  // Baseline vs latest assessment — surfaces domain regressions on the Snapshot.
  const { data: assessments = [] } = useQuery({
    queryKey: ["snapshot-baselines", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("date_evaluated, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score")
        .eq("student_id", studentId)
        .order("date_evaluated", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const domainDeltas = (() => {
    if (assessments.length < 1) return [] as { code: string; short: string; baseline: number; latest: number; delta: number }[];
    const baseline = assessments[0];
    const latest = assessments[assessments.length - 1];
    if (baseline === latest) return [];
    return KSPK_DOMAINS.map((d) => {
      const b = readDomainScore(baseline, d.code);
      const l = readDomainScore(latest, d.code);
      if (b == null || l == null) return null;
      return { code: d.code, short: d.short, baseline: b, latest: l, delta: l - b };
    }).filter(Boolean) as { code: string; short: string; baseline: number; latest: number; delta: number }[];
  })();

  const regressions = domainDeltas.filter((d) => d.delta <= -0.3);
  const gains      = domainDeltas.filter((d) => d.delta >=  0.3);

  const profColors: Record<string, string> = {
    TP1: "bg-destructive/15 text-destructive",
    TP2: "bg-yellow-500/15 text-yellow-700",
    TP3: "bg-accent/15 text-accent",
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{observations?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Recent Observations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{lessonPlans?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Class Lesson Plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{ptmReports?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">PTM Reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">
              {observations?.[0]?.observed_at ? format(new Date(observations[0].observed_at), "d MMM") : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Last Observation</p>
          </CardContent>
        </Card>
      </div>

      {/* Domain pulse — baseline vs latest assessment */}
      {domainDeltas.length > 0 && (
        <Card className={regressions.length ? "border-amber-500/40" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {regressions.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              )}
              Domain pulse
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                baseline vs latest assessment
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {regressions.map((d) => (
                <Badge
                  key={d.code}
                  variant="outline"
                  className="text-xs gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                  title={`Was ${d.baseline.toFixed(1)} → now ${d.latest.toFixed(1)} /5`}
                >
                  <TrendingDown className="h-3 w-3" />
                  {d.short} {d.delta.toFixed(1)}
                </Badge>
              ))}
              {gains.map((d) => (
                <Badge
                  key={d.code}
                  variant="outline"
                  className="text-xs gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                  title={`Was ${d.baseline.toFixed(1)} → now ${d.latest.toFixed(1)} /5`}
                >
                  <TrendingUp className="h-3 w-3" />
                  {d.short} +{d.delta.toFixed(1)}
                </Badge>
              ))}
              {regressions.length === 0 && gains.length === 0 && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Minus className="h-3 w-3" /> Steady across all KSPK domains.
                </span>
              )}
            </div>
            {regressions.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Watch areas: {regressions.map((r) => r.short).join(", ")}. Consider scheduling a targeted intervention.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Observations */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Recent Observations</CardTitle></CardHeader>
        <CardContent>
          {!observations?.length ? (
            <p className="text-sm text-muted-foreground">No observations recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {observations.map((obs: any) => (
                <div key={obs.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Badge variant="outline" className={`text-xs ${profColors[obs.proficiency_level] || ""}`}>
                    {obs.proficiency_level}
                  </Badge>
                  <span className="text-sm flex-1 truncate">{obs.curriculum_standards?.code} — {obs.curriculum_standards?.title_ms}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(obs.observed_at), "d MMM")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Class Lesson Plans */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Class Lesson Plans</CardTitle></CardHeader>
        <CardContent>
          {!lessonPlans?.length ? (
            <p className="text-sm text-muted-foreground">No lesson plans for this class yet.</p>
          ) : (
            <div className="space-y-2">
              {lessonPlans.map((lp: any) => (
                <div
                  key={lp.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/curriculum/lessons/${lp.id}?${backFromStudent(studentId, "progress")}`)}
                >
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lp.title}</p>
                    <p className="text-xs text-muted-foreground">{lp.theme}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{lp.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PTM Reports */}
      {ptmReports && ptmReports.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4" /> PTM Reports</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ptmReports.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm flex-1">{r.term_name}</span>
                  <Badge variant="outline" className="text-xs">{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
