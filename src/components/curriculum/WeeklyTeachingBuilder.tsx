import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Save, Sparkles, BookOpen, CheckCircle2, AlertTriangle, GraduationCap } from "lucide-react";

/**
 * Phase 1 — Weekly Teaching Builder
 *
 * A teacher-friendly, subject-level companion that lives INSIDE the existing
 * Weekly Curriculum Planner. It does NOT replace the weekly plan approval
 * workflow; it just lets teachers capture, per subject:
 *   • What I'm Teaching        (what_teaching)
 *   • Learning Goals           (learning_goals[])
 *   • Key Words                (key_words[])
 *   • Book / Page / Resource   (resources[])
 *   • Teacher notes
 *
 * "Check My Plan" is a simple client-side completeness check in Phase 1.
 * Approved resources are limited to worksheets (per Phase 1 scope).
 * Books: title + page + skill only — never uploaded content.
 */

export const SUBJECT_OPTIONS: { key: string; label: string }[] = [
  { key: "english", label: "English / BI" },
  { key: "bahasa_melayu", label: "Bahasa Melayu" },
  { key: "maths", label: "Maths" },
  { key: "science", label: "Science" },
  { key: "tamil", label: "Tamil" },
  { key: "mandarin", label: "Mandarin" },
  { key: "islamic_studies", label: "Islamic Studies" },
  { key: "moral", label: "Moral Education" },
  { key: "practical_life", label: "Practical Life / Motor Skills" },
  { key: "creative", label: "Creative / Project Work" },
];

type ResourceRow = {
  type: "worksheet" | "book" | "link";
  worksheet_id?: string | null;
  worksheet_title?: string | null;
  book_title?: string;
  page_ref?: string;
  skill?: string;
  url?: string;
  notes?: string;
};

type SubjectRow = {
  id?: string;
  week_plan_id: string;
  subject: string;
  what_teaching: string;
  learning_goals: string[];
  key_words: string[];
  resources: ResourceRow[];
  notes: string;
};

function emptyRow(weekPlanId: string, subject: string): SubjectRow {
  return {
    week_plan_id: weekPlanId,
    subject,
    what_teaching: "",
    learning_goals: [],
    key_words: [],
    resources: [],
    notes: "",
  };
}

function StringList({
  label,
  items,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nothing added yet.</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={item}
            disabled={disabled}
            onChange={(e) => {
              const n = [...items];
              n[i] = e.target.value;
              onChange(n);
            }}
            placeholder={placeholder}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="shrink-0 text-destructive"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ResourceList({
  items,
  onChange,
  disabled,
  worksheetOptions,
}: {
  items: ResourceRow[];
  onChange: (v: ResourceRow[]) => void;
  disabled?: boolean;
  worksheetOptions: { id: string; title: string }[];
}) {
  const addRow = (type: ResourceRow["type"]) =>
    onChange([...items, { type } as ResourceRow]);
  const update = (i: number, patch: Partial<ResourceRow>) =>
    onChange(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm">Book / Page / Resource Used</Label>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => addRow("worksheet")}>
            <Plus className="h-3 w-3 mr-1" /> Worksheet
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => addRow("book")}>
            <Plus className="h-3 w-3 mr-1" /> Book
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => addRow("link")}>
            <Plus className="h-3 w-3 mr-1" /> Link
          </Button>
        </div>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No resources yet. For commercial books, only store the title, page and skill — do not upload book content.
        </p>
      )}
      {items.map((r, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="capitalize text-xs">
              {r.type}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="h-7 w-7 text-destructive"
              onClick={() => remove(i)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {r.type === "worksheet" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Approved worksheet</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  disabled={disabled}
                  value={r.worksheet_id || ""}
                  onChange={(e) => {
                    const wid = e.target.value;
                    const w = worksheetOptions.find((x) => x.id === wid);
                    update(i, { worksheet_id: wid || null, worksheet_title: w?.title || null });
                  }}
                >
                  <option value="">Select worksheet…</option>
                  {worksheetOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input
                  value={r.notes || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { notes: e.target.value })}
                  placeholder="e.g. Do page 1 first"
                />
              </div>
            </div>
          )}

          {r.type === "book" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Book title</Label>
                <Input
                  value={r.book_title || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { book_title: e.target.value })}
                  placeholder="e.g. My First Numbers"
                />
              </div>
              <div>
                <Label className="text-xs">Page</Label>
                <Input
                  value={r.page_ref || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { page_ref: e.target.value })}
                  placeholder="e.g. p. 12"
                />
              </div>
              <div>
                <Label className="text-xs">Skill</Label>
                <Input
                  value={r.skill || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { skill: e.target.value })}
                  placeholder="e.g. Counting to 10"
                />
              </div>
            </div>
          )}

          {r.type === "link" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Link</Label>
                <Input
                  value={r.url || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={r.notes || ""}
                  disabled={disabled}
                  onChange={(e) => update(i, { notes: e.target.value })}
                  placeholder="What is it for?"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WeeklyTeachingBuilder({
  weekPlanId,
  branchId,
  isEditable,
}: {
  weekPlanId: string | undefined;
  branchId: string | null | undefined;
  isEditable: boolean;
}) {
  const queryClient = useQueryClient();
  const [activeSubject, setActiveSubject] = useState<string>(SUBJECT_OPTIONS[0].key);
  const [drafts, setDrafts] = useState<Record<string, SubjectRow>>({});
  const [checkResult, setCheckResult] = useState<null | {
    ok: boolean;
    issues: string[];
  }>(null);

  const { data: savedRows = [], isLoading } = useQuery({
    queryKey: ["weekly-teaching-subjects", weekPlanId],
    queryFn: async () => {
      if (!weekPlanId) return [];
      const { data, error } = await supabase
        .from("weekly_teaching_subjects" as any)
        .select("*")
        .eq("week_plan_id", weekPlanId);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!weekPlanId,
  });

  const { data: worksheetOptions = [] } = useQuery({
    queryKey: ["worksheets-for-teaching", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksheets")
        .select("id, title")
        .order("title")
        .limit(200);
      return (data as { id: string; title: string }[]) ?? [];
    },
    enabled: !!weekPlanId,
  });

  const getRow = (subject: string): SubjectRow => {
    if (drafts[subject]) return drafts[subject];
    const saved = savedRows.find((r: any) => r.subject === subject);
    if (saved) {
      return {
        id: saved.id,
        week_plan_id: saved.week_plan_id,
        subject: saved.subject,
        what_teaching: saved.what_teaching || "",
        learning_goals: Array.isArray(saved.learning_goals) ? saved.learning_goals : [],
        key_words: Array.isArray(saved.key_words) ? saved.key_words : [],
        resources: Array.isArray(saved.resources) ? saved.resources : [],
        notes: saved.notes || "",
      };
    }
    return emptyRow(weekPlanId || "", subject);
  };

  const patchRow = (subject: string, patch: Partial<SubjectRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [subject]: { ...getRow(subject), ...patch },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (subject: string) => {
      if (!weekPlanId) throw new Error("Save the weekly plan first before adding teaching details.");
      const row = getRow(subject);
      const payload = {
        week_plan_id: weekPlanId,
        subject,
        what_teaching: row.what_teaching,
        learning_goals: row.learning_goals,
        key_words: row.key_words,
        resources: row.resources,
        notes: row.notes,
      };
      if (row.id) {
        const { error } = await supabase
          .from("weekly_teaching_subjects" as any)
          .update(payload)
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("weekly_teaching_subjects" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_res, subject) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[subject];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["weekly-teaching-subjects", weekPlanId] });
      toast({ title: "Saved ✅", description: "Teaching details saved for this subject." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const runCheckMyPlan = (subject: string) => {
    const r = getRow(subject);
    const issues: string[] = [];
    if (!r.what_teaching.trim()) issues.push("Add a short 'What I'm Teaching' summary.");
    if (r.learning_goals.filter((x) => x.trim()).length === 0)
      issues.push("Add at least one Learning Goal.");
    if (r.key_words.filter((x) => x.trim()).length < 3)
      issues.push("Add at least 3 Key Words.");
    if (r.resources.length === 0)
      issues.push("Add at least one Book / Page / Resource Used.");
    setCheckResult({ ok: issues.length === 0, issues });
  };

  if (!weekPlanId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          <GraduationCap className="h-6 w-6 mx-auto mb-2" />
          Save the weekly plan first to unlock the Weekly Teaching Builder.
        </CardContent>
      </Card>
    );
  }

  const activeRow = getRow(activeSubject);
  const isDirty = !!drafts[activeSubject];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Weekly Teaching Builder
            </CardTitle>
            <CardDescription>
              Add teaching details for each subject. Use the tabs below to switch subjects.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">Phase 1</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeSubject} onValueChange={(v) => { setActiveSubject(v); setCheckResult(null); }}>
          <TabsList className="flex-wrap h-auto">
            {SUBJECT_OPTIONS.map((s) => {
              const has = savedRows.some((r: any) => r.subject === s.key) || !!drafts[s.key];
              return (
                <TabsTrigger key={s.key} value={s.key} className="text-xs">
                  {s.label}{has ? " ✓" : ""}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {SUBJECT_OPTIONS.map((s) => (
            <TabsContent key={s.key} value={s.key} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>What I'm Teaching</Label>
                <Textarea
                  value={activeRow.what_teaching}
                  disabled={!isEditable}
                  onChange={(e) => patchRow(s.key, { what_teaching: e.target.value })}
                  placeholder="A short sentence for parents and reviewers, e.g. 'This week we explore counting from 1 to 10 through songs and pouring games.'"
                  rows={2}
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <StringList
                  label="Learning Goal"
                  items={activeRow.learning_goals}
                  onChange={(v) => patchRow(s.key, { learning_goals: v })}
                  placeholder="e.g. Count objects 1–10 with 1-to-1 matching"
                  disabled={!isEditable}
                />
                <StringList
                  label="Key Words"
                  items={activeRow.key_words}
                  onChange={(v) => patchRow(s.key, { key_words: v })}
                  placeholder="e.g. count, more, less"
                  disabled={!isEditable}
                />
              </div>

              <ResourceList
                items={activeRow.resources}
                onChange={(v) => patchRow(s.key, { resources: v })}
                disabled={!isEditable}
                worksheetOptions={worksheetOptions}
              />

              <div className="space-y-2">
                <Label>Teacher notes</Label>
                <Textarea
                  value={activeRow.notes}
                  disabled={!isEditable}
                  onChange={(e) => patchRow(s.key, { notes: e.target.value })}
                  placeholder="Anything the reviewer or a relief teacher should know."
                  rows={2}
                />
              </div>

              {checkResult && (
                <div
                  className={`rounded-md p-3 text-sm border ${
                    checkResult.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200"
                      : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {checkResult.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Looks good — ready to save.
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4" /> A few things to add:
                      </>
                    )}
                  </div>
                  {!checkResult.ok && (
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {checkResult.issues.map((iss, i) => (
                        <li key={i}>{iss}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  onClick={() => saveMutation.mutate(s.key)}
                  disabled={!isEditable || saveMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : isDirty ? "Save changes" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => runCheckMyPlan(s.key)} disabled={!isEditable}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Check My Plan
                </Button>
                <p className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  Book content is never uploaded — store title, page and skill only.
                </p>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading saved teaching details…</p>
        )}
      </CardContent>
    </Card>
  );
}