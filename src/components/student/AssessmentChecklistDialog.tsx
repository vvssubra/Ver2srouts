import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, MessageSquarePlus, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";
import {
  DOMAIN_INDICATORS,
  LEVELS,
  IndicatorLevel,
  emptyResponses,
  emptyEvidence,
  domainScoreFromLevels,
} from "@/lib/kspk-indicators";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  branchId: string;
  studentName?: string;
  source?: "ongoing" | "initial_baseline";
}

export default function AssessmentChecklistDialog({ open, onOpenChange, studentId, branchId, studentName, source = "ongoing" }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [responses, setResponses] = useState<Record<string, IndicatorLevel[]>>(() => emptyResponses());
  const [evidence, setEvidence] = useState<Record<string, string[]>>(() => emptyEvidence());
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");

  // Pull the locked baseline (or earliest assessment if no flag yet) so we
  // can render a comparison column for every domain.
  const { data: baseline } = useQuery({
    queryKey: ["student-assessment-baseline", studentId],
    enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("baseline_assessments")
        .select("*")
        .eq("student_id", studentId)
        .order("date_evaluated", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const reset = () => {
    setResponses(emptyResponses());
    setEvidence(emptyEvidence());
    setOpenEvidence({});
    setNotes("");
  };

  // Reset when the dialog is reopened to ensure a clean slate
  useEffect(() => {
    if (open) reset();
  }, [open]);

  const setLevel = (code: string, i: number, level: IndicatorLevel) => {
    setResponses((prev) => {
      const next = [...(prev[code] ?? [])];
      next[i] = level;
      return { ...prev, [code]: next };
    });
  };

  const setEvidenceText = (code: string, i: number, text: string) => {
    setEvidence((prev) => {
      const next = [...(prev[code] ?? [])];
      next[i] = text;
      return { ...prev, [code]: next };
    });
  };

  const isBaseline = !baseline; // No earlier record → this one IS the baseline.
  const daysSinceBaseline = useMemo(() => {
    if (!baseline?.date_evaluated) return null;
    const ms = Date.now() - new Date(baseline.date_evaluated).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }, [baseline]);

  const save = useMutation({
    mutationFn: async () => {
      const checklist: any[] = [];
      const domainScores: Record<string, number> = {};
      for (const d of KSPK_DOMAINS) {
        const items = DOMAIN_INDICATORS[d.code] ?? [];
        const arr = responses[d.code] ?? [];
        const ev = evidence[d.code] ?? [];
        domainScores[d.code] = domainScoreFromLevels(arr);
        items.forEach((item, i) => {
          checklist.push({
            category: d.code,
            domain_name: d.name,
            item,
            level: arr[i] ?? 0,
            level_label: LEVELS[arr[i] ?? 0]?.short,
            evidence_note: (ev[i] || "").trim() || null,
            // passed kept for back-compat with legacy readers
            passed: (arr[i] ?? 0) >= 3,
          });
        });
      }
      // Hard-coerce any decimal (e.g. 4.6) to a clamped 1..5 integer for legacy
      // NOT-NULL integer columns. The precise decimal stays in domain_scores (jsonb).
      const toLegacyInt = (v: unknown): number => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 1;
        return Math.min(5, Math.max(1, Math.round(n)));
      };
      const { error } = await (supabase as any).from("baseline_assessments").insert({
        student_id: studentId,
        branch_id: branchId,
        assessed_by: user!.id,
        motor_skills_score: toLegacyInt(domainScores.PM),
        language_score: toLegacyInt(domainScores.CL),
        socio_emotional_score: toLegacyInt(domainScores.SE),
        cognitive_score: toLegacyInt(domainScores.NT),
        domain_scores: domainScores,
        checklist_responses: checklist,
        teacher_notes: notes || null,
        source,
        assessment_type: isBaseline ? "baseline" : "progression",
        date_evaluated: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-baseline-assessments", studentId] });
      qc.invalidateQueries({ queryKey: ["baseline-assessments"] });
      qc.invalidateQueries({ queryKey: ["growth-assessments", studentId] });
      qc.invalidateQueries({ queryKey: ["student-assessment-baseline", studentId] });
      toast({ title: "Assessment saved ✅", description: isBaseline ? "Saved as the child's baseline." : "Progression recorded." });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const totalAnswered = Object.values(responses).reduce((sum, arr) => sum + arr.filter((v) => v > 0).length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl h-[calc(100dvh-3rem)] max-h-[94dvh] !flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                {isBaseline ? "Baseline Assessment" : "Progression Assessment"}{studentName ? ` — ${studentName}` : ""}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Rate each indicator on the {LEVELS.length}-point scale (Not Yet → Mastered). Add a short evidence note where you can — it powers the child's progress story.
              </DialogDescription>
            </div>
            {isBaseline ? (
              <Badge variant="default" className="gap-1"><Sparkles className="h-3 w-3" />Baseline</Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                {daysSinceBaseline != null ? `${daysSinceBaseline}d since baseline` : "Progression"}
              </Badge>
            )}
          </div>
          {/* Legend strip */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            {LEVELS.map((l) => (
              <span key={l.value} className={`px-1.5 py-0.5 rounded font-medium ${l.color}`} title={l.description}>
                {l.value} · {l.short}
              </span>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 -mx-6 overflow-y-auto px-6 pr-4 pb-2">
          <Accordion type="multiple" defaultValue={[KSPK_DOMAINS[0].code]} className="w-full">
            {KSPK_DOMAINS.map((d) => {
              const items = DOMAIN_INDICATORS[d.code] ?? [];
              const arr = responses[d.code] ?? [];
              const ev = evidence[d.code] ?? [];
              const answered = arr.filter((v) => v > 0).length;
              const s = domainScoreFromLevels(arr);
              const baseScore = readDomainScore(baseline, d.code);
              const delta = baseScore != null && answered > 0 ? Math.round((s - baseScore) * 10) / 10 : null;

              return (
                <AccordionItem key={d.code} value={d.code}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center gap-3 pr-3">
                      <Badge variant="outline" className="text-[10px]">{d.code}</Badge>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {answered}/{items.length} indicators rated
                        </div>
                      </div>
                      {baseScore != null && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          base {baseScore}/5
                        </span>
                      )}
                      <Badge variant="secondary" className="tabular-nums">{s.toFixed(1)}/5</Badge>
                      {delta != null && delta !== 0 && (
                        <Badge
                          variant="outline"
                          className={`gap-0.5 tabular-nums text-[10px] ${
                            delta > 0
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : "border-red-500/40 text-red-700 dark:text-red-300"
                          }`}
                        >
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {delta > 0 ? "+" : ""}{delta}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pt-1">
                      {items.map((item, i) => {
                        const lvl = arr[i] ?? 0;
                        const evidenceKey = `${d.code}:${i}`;
                        const showEv = !!openEvidence[evidenceKey] || !!ev[i];
                        return (
                          <div key={i} className="rounded-md border p-2.5 bg-card/50">
                            <div className="flex items-start gap-3">
                              <span className="text-sm leading-snug flex-1 pt-1">{item}</span>
                              <button
                                type="button"
                                onClick={() => setOpenEvidence((p) => ({ ...p, [evidenceKey]: !showEv }))}
                                className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 mt-1"
                                title="Add evidence note"
                              >
                                <MessageSquarePlus className="h-3 w-3" />
                                {ev[i] ? "Evidence" : "Note"}
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-5 gap-1">
                              {LEVELS.map((l) => {
                                const active = lvl === l.value;
                                return (
                                  <button
                                    key={l.value}
                                    type="button"
                                    onClick={() => setLevel(d.code, i, l.value)}
                                    title={`${l.label} — ${l.description}`}
                                    className={`text-[10px] font-medium rounded px-1.5 py-1 border transition ${
                                      active
                                        ? `${l.color} border-current shadow-sm`
                                        : "bg-background hover:bg-muted border-border text-muted-foreground"
                                    }`}
                                  >
                                    <span className="block text-[11px] font-bold">{l.value}</span>
                                    <span className="block leading-none">{l.short}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {showEv && (
                              <Textarea
                                value={ev[i] ?? ""}
                                onChange={(e) => setEvidenceText(d.code, i, e.target.value)}
                                rows={2}
                                placeholder="What did you observe? (e.g. asked 'what's this?' three times during art)"
                                className="mt-2 text-xs"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
            <AccordionItem value="__notes">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 items-center gap-3 pr-3">
                  <span className="text-base">📝</span>
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium">Teacher observations</div>
                    <div className="text-xs text-muted-foreground">Context that accompanies these ratings</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Label className="text-sm">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What stood out today? What did you change to support this child?" rows={6} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Footer summary strip — current vs baseline */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] bg-muted/40 rounded-md p-2">
          {KSPK_DOMAINS.map((d) => {
            const cur = domainScoreFromLevels(responses[d.code] ?? []);
            const base = readDomainScore(baseline, d.code);
            const delta = base != null ? Math.round((cur - base) * 10) / 10 : null;
            return (
              <div key={d.code} title={d.name}>
                <p className="font-semibold text-sm tabular-nums">{cur.toFixed(1)}</p>
                <p className="text-muted-foreground uppercase tracking-wide">{d.code}</p>
                {base != null ? (
                  <p className={`text-[9px] inline-flex items-center gap-0.5 ${
                    delta == null || delta === 0
                      ? "text-muted-foreground"
                      : delta > 0
                        ? "text-emerald-600"
                        : "text-red-600"
                  }`}>
                    {delta == null ? null : delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : delta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                    base {base}
                  </p>
                ) : (
                  <p className="text-[9px] text-muted-foreground">no base</p>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || totalAnswered === 0}>
            {save.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving</> : (isBaseline ? "Save as Baseline" : "Save Progression")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
