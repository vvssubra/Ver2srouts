import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, ArrowUpRight, Eye, Target, TrendingUp, Wand2, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { backFromStudent } from "@/hooks/use-back-to-student";
import { format } from "date-fns";

/**
 * "One class plan, tweaked for every child" — calls the AI gateway to turn
 * the class roster + per-child baseline / observations / goals into
 * actionable interventions the teacher can run inside today's lesson.
 */
interface Intervention {
  student_id: string;
  name: string;
  strengths?: string[];
  gap_focus?: string[];
  differentiation?: string;
  extension?: string;
  observation_cues?: string;
}

interface Props {
  classId: string;
  lessonPlanId: string;
}

export default function PerChildDifferentiationCard({ classId, lessonPlanId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [items, setItems] = useState<Intervention[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Load persisted interventions on mount so teachers don't have to regenerate.
  const { data: persisted } = useQuery({
    queryKey: ["lesson-plan-interventions", lessonPlanId],
    enabled: !!lessonPlanId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_plans")
        .select("per_student_interventions, updated_at")
        .eq("id", lessonPlanId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    const stored = (persisted as any)?.per_student_interventions;
    if (Array.isArray(stored) && stored.length > 0 && !hasGenerated) {
      setItems(stored as Intervention[]);
      setHasGenerated(true);
      if ((persisted as any)?.updated_at) setSavedAt((persisted as any).updated_at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted]);

  // Student avatars for the cards.
  const { data: roster } = useQuery({
    queryKey: ["class-roster-for-differentiation", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, photo_url")
        .eq("class_id", classId)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-class-differentiation", {
        body: { class_id: classId, lesson_plan_id: lessonPlanId },
      });
      if (error) throw error;
      const interventions = (data?.per_student_interventions ?? []) as Intervention[];
      // Persist to lesson_plans so we don't burn AI credits on every visit.
      if (interventions.length > 0 && lessonPlanId) {
        await supabase
          .from("lesson_plans")
          .update({ per_student_interventions: interventions as any })
          .eq("id", lessonPlanId);
      }
      return interventions;
    },
    onSuccess: (data) => {
      setItems(data);
      setHasGenerated(true);
      setSavedAt(new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["lesson-plan-interventions", lessonPlanId] });
      if (!data.length) {
        toast({ title: "No active students in this class", variant: "destructive" });
      } else {
        toast({ title: `Saved ${data.length} per-child interventions` });
      }
    },
    onError: (e: any) => toast({ title: "Could not generate", description: e.message, variant: "destructive" }),
  });

  const avatarFor = (id: string) => roster?.find((s: any) => s.id === id);

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Per-child differentiation
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              One class plan — tweaked for every child. Pulls each student's baseline,
              latest assessment, 90-day Learning Journey observations and active goals
              so you can support, extend and observe precisely.
            </p>
          </div>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending} className="gap-1.5">
            {generate.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</>
            ) : (
              <><Wand2 className="h-3.5 w-3.5" /> {hasGenerated ? "Regenerate" : "Generate"}</>
            )}
          </Button>
        </div>
        {savedAt && hasGenerated && (
          <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 mt-1.5">
            <Check className="h-3 w-3 text-emerald-600" />
            Saved · {format(new Date(savedAt), "d MMM yyyy, HH:mm")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasGenerated ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">Generate</span> to produce
            individualised support, extension and observation cues for every child in this class.
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No students returned.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((it) => {
              const student = avatarFor(it.student_id);
              const initials = (it.name || "?")
                .split(/\s+/).filter(Boolean).slice(0, 2)
                .map((s) => s[0]?.toUpperCase()).join("");
              return (
                <div key={it.student_id} className="rounded-lg border bg-card p-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    {student?.photo_url ? (
                      <img src={student.photo_url} alt="" className="h-9 w-9 rounded-full object-cover border shrink-0" />
                    ) : (
                      <span className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold border shrink-0">
                        {initials}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{it.name}</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/students/${it.student_id}?tab=progress`)}
                        className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        Open profile <ArrowUpRight className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>

                  {it.strengths && it.strengths.length > 0 && (
                    <div className="text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Strengths</p>
                      <ul className="list-disc list-inside space-y-0.5 text-foreground/85">
                        {it.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {it.gap_focus && it.gap_focus.length > 0 && (
                    <div className="text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Gap focus</p>
                      <div className="flex flex-wrap gap-1">
                        {it.gap_focus.map((g, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                            {g}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {it.differentiation && (
                    <div className="text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 flex items-center gap-1">
                        <Target className="h-2.5 w-2.5" /> Differentiation
                      </p>
                      <p className="text-foreground/85">{it.differentiation}</p>
                    </div>
                  )}
                  {it.extension && (
                    <div className="text-xs">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 flex items-center gap-1">
                        <TrendingUp className="h-2.5 w-2.5" /> Extension
                      </p>
                      <p className="text-foreground/85">{it.extension}</p>
                    </div>
                  )}
                  {it.observation_cues && (
                    <div className="text-xs rounded-md bg-primary/5 border border-primary/15 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-primary mb-0.5 flex items-center gap-1">
                        <Eye className="h-2.5 w-2.5" /> Watch for
                      </p>
                      <p className="text-foreground/85">{it.observation_cues}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}