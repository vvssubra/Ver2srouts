import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Check, Pencil, EyeOff, Sparkles, Plus, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isoWeekStart, useChildNextFocus } from "@/hooks/use-child-next-focus";
import { useWeeklyLessonContext } from "@/components/parent/ParentLessonContextCards";

const toList = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.text ?? x?.label ?? x?.title ?? "")).filter(Boolean);
  if (typeof v === "string") return v.split(/[\n,;•]/).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "object") return Object.values(v as any).map((x) => String(x)).filter(Boolean);
  return [];
};

// Heuristic: detect Bahasa Malaysia in source curriculum text so we can
// fall back to an English wrapper instead of surfacing BM strings on the
// parent-visible card. Intentionally conservative — common BM stop-words.
const MALAY_TOKENS = [
  "dan", "yang", "untuk", "dengan", "kepada", "akan", "ialah", "adalah",
  "saya", "kita", "kami", "anda", "mereka", "dia", "ini", "itu", "tidak",
  "tema", "kanak", "kanak-kanak", "minggu", "harian", "bermain", "belajar",
  "guru", "murid", "pelajar", "sekolah", "rumah", "ibu", "bapa", "keluarga",
];
const looksMalay = (s?: string | null): boolean => {
  if (!s) return false;
  const lower = String(s).toLowerCase();
  return MALAY_TOKENS.some((t) => new RegExp(`(^|[^a-z])${t}([^a-z]|$)`, "i").test(lower));
};
/** Use the source string if it looks English, otherwise fall back to an English default. */
const englishOr = (src: string | null | undefined, fallback: string): string => {
  const s = (src ?? "").trim();
  if (!s) return fallback;
  return looksMalay(s) ? fallback : s;
};
const filterEnglishList = (items: string[]): string[] => items.filter((s) => !looksMalay(s));

type Props = {
  studentId: string;
  classId: string | null;
  branchId: string;
  studentFirstName?: string;
};

export function TeacherNextFocusCard({ studentId, classId, branchId, studentFirstName }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: focus, isLoading } = useChildNextFocus(studentId);
  const { data: weeklyCtx } = useWeeklyLessonContext(classId);
  const [editOpen, setEditOpen] = useState(false);

  // Latest 3 growing/emerging skills for suggestion seed.
  const { data: growing } = useQuery({
    queryKey: ["teacher-focus-growing", studentId],
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("child_skill_progress")
        .select("indicator_label, domain_id, current_status, last_observed_at")
        .eq("student_id", studentId)
        .in("current_status", ["not_yet", "emerging"])
        .order("last_observed_at", { ascending: false })
        .limit(5);
      return (data ?? []) as any[];
    },
  });

  const suggestion = useMemo(() => {
    const rawFocusTitle =
      weeklyCtx?.weeklyPlan?.focus_title ||
      weeklyCtx?.themeBank?.theme_name ||
      "";
    const focusTitle = englishOr(rawFocusTitle, "Continue exploring this week's learning theme");
    // Strip BM entries from vocabulary / cues so the parent-facing card stays English.
    const vocab = filterEnglishList(toList(weeklyCtx?.themeBank?.key_vocabulary)).slice(0, 5);
    const cues = filterEnglishList(toList(weeklyCtx?.weeklyPlan?.observation_focus)).slice(0, 3);
    const skillLabels = (growing ?? []).map((g: any) => g.indicator_label).slice(0, 3);
    const childFirst = studentFirstName || "this child";
    const description = cues.length
      ? `Teachers will support ${childFirst} with ${cues.slice(0, 2).join(" and ")} through play, story and routines.`
      : skillLabels.length
        ? `Teachers will keep observing ${childFirst} as they practise ${skillLabels.slice(0, 2).join(" and ")}.`
        : `Teachers will continue observing ${childFirst} during this week's activities.`;
    const home = vocab.length
      ? [`Practise the words ${vocab.slice(0, 3).join(", ")} during play.`,
         `Ask about one thing ${childFirst} noticed today.`]
      : [`Ask about one thing ${childFirst} enjoyed at school today.`];
    return {
      focus_title: focusTitle,
      focus_description: description,
      vocabulary_json: vocab,
      observation_cues_json: cues,
      skill_labels_json: skillLabels,
      home_support_json: home,
      weekly_plan_id: weeklyCtx?.weeklyPlan?.id ?? null,
    };
  }, [weeklyCtx, growing, studentFirstName]);

  // ---- "Based on" source transparency (teacher-only, not stored) ----
  const sources = useMemo(() => {
    const rawVocab = toList(weeklyCtx?.themeBank?.key_vocabulary);
    const rawCues = toList(weeklyCtx?.weeklyPlan?.observation_focus);
    const enVocab = filterEnglishList(rawVocab);
    const enCues = filterEnglishList(rawCues);
    const skill = (growing ?? [])[0];
    return {
      weeklyPlan: !!weeklyCtx?.weeklyPlan?.focus_title,
      weeklyPlanPreview: englishOr(weeklyCtx?.weeklyPlan?.focus_title, "Weekly focus") as string,
      observationFocus: enCues.length > 0,
      observationFocusPreview: enCues[0] ?? null,
      childProgress: !!skill,
      childProgressPreview: skill?.indicator_label ?? null,
      vocabulary: enVocab.length > 0,
      vocabularyPreview: enVocab.slice(0, 3).join(", "),
    };
  }, [weeklyCtx, growing]);

  // ---- Weekly data completeness warning (teacher-only) ----
  const missing = useMemo(() => {
    const issues: string[] = [];
    if (!weeklyCtx?.themeBank?.key_vocabulary || toList(weeklyCtx?.themeBank?.key_vocabulary).length === 0) issues.push("vocabulary");
    if (!weeklyCtx?.weeklyPlan?.weekly_objectives || toList(weeklyCtx?.weeklyPlan?.weekly_objectives).length === 0) issues.push("weekly objectives");
    if (!weeklyCtx?.weeklyPlan?.suggested_books && !weeklyCtx?.themeBank?.suggested_books) issues.push("suggested book");
    if (!weeklyCtx?.weeklyPlan?.suggested_songs && !weeklyCtx?.themeBank?.suggested_songs) issues.push("suggested song");
    if (!weeklyCtx?.weeklyPlan?.observation_focus || toList(weeklyCtx?.weeklyPlan?.observation_focus).length === 0) issues.push("observation focus");
    return issues;
  }, [weeklyCtx]);

  const createSuggested = useMutation({
    mutationFn: async () => {
      const payload = {
        branch_id: branchId,
        class_id: classId,
        student_id: studentId,
        weekly_plan_id: suggestion.weekly_plan_id,
        source: "weekly_plan" as const,
        focus_title: suggestion.focus_title,
        focus_description: suggestion.focus_description,
        vocabulary_json: suggestion.vocabulary_json,
        observation_cues_json: suggestion.observation_cues_json,
        skill_labels_json: suggestion.skill_labels_json,
        home_support_json: suggestion.home_support_json,
        domain_ids_json: [],
        status: "suggested" as const,
        visible_to_parent: false,
        week_starting: isoWeekStart(),
        created_by: user?.id ?? null,
      };
      const { data, error } = await (supabase as any)
        .from("child_next_focus")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["child-next-focus", studentId] });
      toast.success("Suggested focus created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create suggestion"),
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase as any)
        .from("child_next_focus")
        .update({ ...patch, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", focus!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["child-next-focus", studentId] });
    },
  });

  if (isLoading) {
    return (
      <Card><CardContent className="p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading next focus…
      </CardContent></Card>
    );
  }

  if (!focus) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Next Focus for This Child
          </h4>
          <p className="text-xs text-muted-foreground">
            No focus is set for this week. Generate a suggested focus from the current
            weekly plan and recent progress, then accept or edit it before parents see it.
          </p>
          <BasedOnPanel sources={sources} />
          {missing.length > 0 && (
            <div className="text-[11px] flex items-start gap-1.5 rounded-md border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-900 dark:text-amber-200">
                This week's learning plan is missing {missing.join(", ")}. Add these in the curriculum planner to improve parent home reinforcement.
              </span>
            </div>
          )}
          <Button size="sm" onClick={() => createSuggested.mutate()} disabled={createSuggested.isPending}>
            {createSuggested.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Suggest from this week's plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const vocab = toList(focus.vocabulary_json);
  const cues = toList(focus.observation_cues_json);
  const home = toList(focus.home_support_json);
  const isApproved = focus.status === "approved" && focus.visible_to_parent;

  return (
    <>
      <Card className={isApproved ? "border-primary/30 bg-primary/[0.03]" : "border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/10"}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Next Focus for This Child
            </h4>
            <Badge variant={isApproved ? "default" : "secondary"} className="text-[10px]">
              {focus.status === "suggested" ? "Suggested" :
               focus.status === "teacher_reviewed" ? "Reviewed" :
               focus.status === "approved" ? (focus.visible_to_parent ? "Approved · Parent visible" : "Approved") :
               "Archived"}
            </Badge>
          </div>
          <p className="text-xs font-medium text-foreground">{focus.focus_title}</p>
          {focus.focus_description && (
            <p className="text-xs text-foreground/85">{focus.focus_description}</p>
          )}
          {vocab.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {vocab.map((w) => <Badge key={w} variant="secondary" className="text-[10px]">{w}</Badge>)}
            </div>
          )}
          {cues.length > 0 && (
            <div className="text-[11px] text-muted-foreground pt-1">
              <span className="font-medium text-foreground/80">Teacher Observation Cues: </span>
              {cues.join(" • ")}
            </div>
          )}
          {home.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">Parent home tip: </span>
              {home[0]}
            </div>
          )}
          <BasedOnPanel sources={sources} />
          {missing.length > 0 && (
            <div className="text-[11px] flex items-start gap-1.5 rounded-md border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-2 mt-1">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <span className="text-amber-900 dark:text-amber-200">
                Weekly plan is missing {missing.join(", ")}. Parents will see a friendly fallback until this is added.
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {!isApproved && (
              <Button
                size="sm"
                onClick={() => updateMutation.mutate({ status: "approved", visible_to_parent: true })}
                disabled={updateMutation.isPending}
              >
                <Check className="h-3 w-3 mr-1" /> Accept & show parent
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateMutation.mutate({ status: "archived", visible_to_parent: false })}
              disabled={updateMutation.isPending}
            >
              <EyeOff className="h-3 w-3 mr-1" /> Hide
            </Button>
          </div>
        </CardContent>
      </Card>
      <EditFocusDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        focus={focus}
        onSave={(patch) => {
          updateMutation.mutate({
            ...patch,
            status: focus.status === "suggested" ? "teacher_reviewed" : focus.status,
          }, {
            onSuccess: () => {
              setEditOpen(false);
              toast.success("Focus updated");
            },
          });
        }}
      />
    </>
  );
}

function EditFocusDialog({
  open, onOpenChange, focus, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  focus: any;
  onSave: (patch: any) => void;
}) {
  const [title, setTitle] = useState(focus.focus_title ?? "");
  const [description, setDescription] = useState(focus.focus_description ?? "");
  const [vocab, setVocab] = useState(toList(focus.vocabulary_json).join(", "));
  const [cues, setCues] = useState(toList(focus.observation_cues_json).join("\n"));
  const [home, setHome] = useState(toList(focus.home_support_json).join("\n"));

  // Re-seed when focus changes
  useMemo(() => {
    if (open) {
      setTitle(focus.focus_title ?? "");
      setDescription(focus.focus_description ?? "");
      setVocab(toList(focus.vocabulary_json).join(", "));
      setCues(toList(focus.observation_cues_json).join("\n"));
      setHome(toList(focus.home_support_json).join("\n"));
    }
    return null;
  }, [open, focus.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Next Focus</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Focus title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Description (shown to parent)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="text-xs">Vocabulary (comma separated)</Label>
            <Input value={vocab} onChange={(e) => setVocab(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Observation cues (one per line, teacher-facing)</Label>
            <Textarea value={cues} onChange={(e) => setCues(e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="text-xs">Parent home tip (one per line)</Label>
            <Textarea value={home} onChange={(e) => setHome(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({
            focus_title: title.trim() || focus.focus_title,
            focus_description: description.trim() || null,
            vocabulary_json: vocab.split(",").map((s) => s.trim()).filter(Boolean),
            observation_cues_json: cues.split("\n").map((s) => s.trim()).filter(Boolean),
            home_support_json: home.split("\n").map((s) => s.trim()).filter(Boolean),
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small teacher-only panel showing which sources fed the suggestion. */
function BasedOnPanel({ sources }: { sources: {
  weeklyPlan: boolean; weeklyPlanPreview: string;
  observationFocus: boolean; observationFocusPreview: string | null;
  childProgress: boolean; childProgressPreview: string | null;
  vocabulary: boolean; vocabularyPreview: string;
} }) {
  const any =
    sources.weeklyPlan || sources.observationFocus || sources.childProgress || sources.vocabulary;
  if (!any) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2 mt-2">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
        Based on
      </p>
      <div className="flex flex-wrap gap-1">
        {sources.weeklyPlan && <Badge variant="outline" className="text-[10px]">Weekly Plan</Badge>}
        {sources.observationFocus && <Badge variant="outline" className="text-[10px]">Observation Focus</Badge>}
        {sources.childProgress && <Badge variant="outline" className="text-[10px]">Child Progress</Badge>}
        {sources.vocabulary && <Badge variant="outline" className="text-[10px]">Vocabulary Focus</Badge>}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
        {sources.weeklyPlan && <p>• Weekly focus: {sources.weeklyPlanPreview}</p>}
        {sources.observationFocus && sources.observationFocusPreview && (
          <p>• Observation focus: {sources.observationFocusPreview}</p>
        )}
        {sources.childProgress && sources.childProgressPreview && (
          <p>• Top growing skill: {sources.childProgressPreview}</p>
        )}
        {sources.vocabulary && sources.vocabularyPreview && (
          <p>• Vocabulary: {sources.vocabularyPreview}</p>
        )}
      </div>
    </div>
  );
}