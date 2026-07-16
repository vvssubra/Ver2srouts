import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, ClipboardCheck, Printer, TrendingUp, TrendingDown, CalendarDays } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { backFromStudent } from "@/hooks/use-back-to-student";
import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";
import { NewUpdateSheet } from "@/components/daily-updates/NewUpdateSheet";

/**
 * ChildHeroBar — slim contextual strip beneath the profile hero card.
 * Shows baseline date, days in school, an AI-style one-liner (strongest +
 * weakest KSPK domain) and a quick-action dock for the most common
 * teacher tasks.
 */
interface Props {
  studentId: string;
  classId?: string | null;
  enrollmentDate?: string | null;
  onJumpToProgress?: (view: "snapshot" | "growth" | "assessments") => void;
}

export default function ChildHeroBar({ studentId, classId, enrollmentDate, onJumpToProgress }: Props) {
  const navigate = useNavigate();
  const [obsOpen, setObsOpen] = useState(false);

  const { data: baselines = [] } = useQuery({
    queryKey: ["herobar-baselines", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("date_evaluated, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score")
        .eq("student_id", studentId)
        .order("date_evaluated", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const latest = baselines.length ? baselines[baselines.length - 1] : null;
  const baselineDate = baselines[0]?.date_evaluated ?? null;

  // Days in school from enrollment_date (if present).
  const daysInSchool = enrollmentDate
    ? Math.max(0, differenceInCalendarDays(new Date(), new Date(enrollmentDate)))
    : null;

  // Derive strongest + weakest domain from the latest assessment.
  const { strongest, weakest } = (() => {
    if (!latest) return { strongest: null as any, weakest: null as any };
    const scored = KSPK_DOMAINS
      .map((d) => ({ d, s: readDomainScore(latest, d.code) }))
      .filter((x) => x.s != null) as { d: typeof KSPK_DOMAINS[number]; s: number }[];
    if (!scored.length) return { strongest: null, weakest: null };
    scored.sort((a, b) => b.s - a.s);
    return { strongest: scored[0], weakest: scored[scored.length - 1] };
  })();

  const oneLiner = (() => {
    if (!latest) return "No baseline yet — capture one to see growth";
    const parts: string[] = [];
    if (strongest) parts.push(`${strongest.d.short} strong (${strongest.s.toFixed(1)}/5)`);
    if (weakest && (!strongest || weakest.d.code !== strongest.d.code))
      parts.push(`${weakest.d.short} to watch (${weakest.s.toFixed(1)}/5)`);
    return parts.join(" · ") || "Baseline captured";
  })();

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-r from-primary/[0.04] via-transparent to-accent/[0.04]">
        <CardContent className="p-3 flex flex-col gap-2.5 md:flex-row md:items-center md:gap-4">
          {/* AI one-liner */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary shrink-0">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sprouts at a glance</p>
              <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                {strongest && <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                <span className="truncate">{oneLiner}</span>
                {weakest && weakest !== strongest && <TrendingDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
              </p>
            </div>
          </div>

          {/* Context strip */}
          <div className="flex items-center gap-3 text-xs">
            <div className="px-2.5 py-1 rounded-md bg-card border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Baseline</p>
              <p className="font-semibold tabular-nums">
                {baselineDate ? format(new Date(baselineDate), "d MMM yyyy") : "—"}
              </p>
            </div>
            <div className="px-2.5 py-1 rounded-md bg-card border">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> In school
              </p>
              <p className="font-semibold tabular-nums">{daysInSchool != null ? `${daysInSchool}d` : "—"}</p>
            </div>
          </div>

          {/* Quick-action dock */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => setObsOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Observation
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => onJumpToProgress?.("assessments")}
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> Assess
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() =>
                navigate(`/curriculum/ptm/generate/${studentId}?${backFromStudent(studentId, "progress")}`)
              }
              title="Open this child's PTM reports"
            >
              <Printer className="h-3.5 w-3.5" /> PTM
            </Button>
          </div>
        </CardContent>
      </Card>

      <NewUpdateSheet
        open={obsOpen}
        onOpenChange={setObsOpen}
        initialStudentId={studentId}
        initialClassId={classId ?? null}
      />
    </>
  );
}