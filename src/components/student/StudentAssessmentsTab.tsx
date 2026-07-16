import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Sparkles, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import AssessmentChecklistDialog from "./AssessmentChecklistDialog";
import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";

interface Props {
  studentId: string;
  branchId: string;
}

export default function StudentAssessmentsTab({ studentId, branchId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["student-baseline-assessments", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("*")
        .eq("student_id", studentId)
        .order("date_evaluated", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: recommendations } = useQuery({
    queryKey: ["student-methodology-recommendations", studentId],
    queryFn: async () => {
      const ids = (assessments ?? []).map(a => a.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("methodology_recommendations")
        .select("*")
        .in("baseline_assessment_id", ids);
      return (data ?? []) as any[];
    },
    enabled: !!assessments?.length,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Developmental Assessments
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> New Assessment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : !assessments?.length ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-muted-foreground">No assessments recorded yet.</p>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Conduct First Assessment
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2">Tip: see ongoing growth, trends and parent/school goals under the <strong>Growth</strong> tab.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground -mt-2 mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> See trends, goals and AI insight under the <strong>Growth</strong> tab.</p>
              {assessments.map((a: any) => {
                const rec = recommendations?.find((r: any) => r.baseline_assessment_id === a.id);
                const isPre = a.source === "pre_enrollment";
                return (
                  <div key={a.id} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(a.date_evaluated || a.created_at), "d MMM yyyy")}
                        </p>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {isPre ? "Pre-Enrollment (from Admissions)" : "Post-Enrollment Baseline"}
                        </Badge>
                      </div>
                      {rec && (
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="h-3 w-3" /> AI Recommendation Ready
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                      {KSPK_DOMAINS.map((d) => {
                        const v = readDomainScore(a, d.code);
                        return (
                          <div key={d.code} className="text-center rounded-md bg-muted/40 py-2" title={d.name}>
                            <p className="text-lg font-semibold">{v ?? "—"}<span className="text-xs text-muted-foreground">/5</span></p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{d.code}</p>
                          </div>
                        );
                      })}
                    </div>
                    {a.teacher_notes && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{a.teacher_notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <AssessmentChecklistDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={studentId}
        branchId={branchId}
      />
    </div>
  );
}