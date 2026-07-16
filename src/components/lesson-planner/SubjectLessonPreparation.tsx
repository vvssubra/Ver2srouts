import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Save, Sparkles, BookOpen, Wand2, GraduationCap, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Subject Lesson Preparation
 *
 * Teacher-facing component inside Lesson Planner. Shows only the currently
 * selected subject. Auto-creates session rows from the class timetable and
 * lets the teacher fill session-level book / page / skill focus data.
 *
 * Principle:  Principal gives the direction.
 *             Teacher gives the page/skill context.
 *             AI builds the lesson (later).
 *             Teacher reviews before use.
 */

const RESOURCE_TYPES: { key: string; label: string }[] = [
  { key: "commercial_book", label: "Commercial Book" },
  { key: "sprouts_internal_resource", label: "Sprouts Internal Resource" },
  { key: "approved_worksheet", label: "Approved Worksheet" },
  { key: "flashcard", label: "Flashcard" },
  { key: "hands_on_activity", label: "Hands-on Activity" },
  { key: "song_story", label: "Song / Story" },
  { key: "no_resource", label: "No Resource / Teacher-led" },
];

type SessionRow = {
  id?: string;
  weekly_teaching_subject_id?: string | null;
  week_plan_id: string;
  class_id: string;
  subject: string;
  session_date: string;
  day_of_week: string;
  timetable_slot_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  resource_source_type: string;
  book_title?: string | null;
  page_from?: string | null;
  page_to?: string | null;
  worksheet_id?: string | null;
  skill_focus: string;
  key_words: string[];
  teacher_note?: string | null;
  teacher_review_status: string;
};

function dayName(d: Date) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}

export interface WeeklyDirection {
  className?: string | null;
  ageGroup?: string | null;
  weekStart: string;
  theme?: string | null;
  weeklyFocusTitle?: string | null;
  keyQuestions?: string[];
}

export default function SubjectLessonPreparation({
  weekPlanId,
  classId,
  subject,
  weekStart,
  branchId,
  direction,
  isEditable,
  onReadinessChange,
}: {
  weekPlanId: string | null | undefined;
  classId: string;
  subject: string;
  weekStart: string; // yyyy-MM-dd (Monday)
  branchId: string | null | undefined;
  direction: WeeklyDirection;
  isEditable: boolean;
  onReadinessChange?: (state: {
    sessionCount: number;
    missingSkillCount: number;
    hasUnsaved: boolean;
    ready: boolean;
  }) => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  // Auto-fill helper state
  const [afBook, setAfBook] = useState("");
  const [afStart, setAfStart] = useState("");
  const [afPer, setAfPer] = useState("2");

  const disabled = !isEditable || !weekPlanId || !classId || !subject;

  const weekEnd = useMemo(
    () => format(addDays(new Date(weekStart), 6), "yyyy-MM-dd"),
    [weekStart]
  );

  // 1. Load saved subject row
  const { data: subjectRow } = useQuery({
    queryKey: ["wts-row", weekPlanId, classId, subject],
    queryFn: async () => {
      if (!weekPlanId) return null;
      const { data } = await supabase
        .from("weekly_teaching_subjects" as any)
        .select("*")
        .eq("week_plan_id", weekPlanId)
        .eq("subject", subject)
        .eq("class_id", classId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!weekPlanId && !!classId && !!subject,
  });

  // 2. Load timetable slots for this class/subject in the week
  const { data: timetableSlots = [] } = useQuery({
    queryKey: ["subject-slots", classId, subject, weekStart, weekEnd],
    queryFn: async () => {
      const { data: daily } = await supabase
        .from("daily_timetable_slots" as any)
        .select("id, slot_date, start_time, end_time, subject_name")
        .eq("class_id", classId)
        .gte("slot_date", weekStart)
        .lte("slot_date", weekEnd)
        .eq("is_cancelled", false);
      const matched = ((daily as any[]) || []).filter(
        (s) => (s.subject_name || "").toLowerCase() === subject.toLowerCase()
      );
      return matched;
    },
    enabled: !!classId && !!subject,
  });

  // 3. Load saved session rows
  const { data: savedSessions = [] } = useQuery({
    queryKey: ["wtsess", weekPlanId, classId, subject],
    queryFn: async () => {
      if (!weekPlanId) return [];
      const { data } = await supabase
        .from("weekly_teaching_sessions" as any)
        .select("*")
        .eq("week_plan_id", weekPlanId)
        .eq("class_id", classId)
        .eq("subject", subject)
        .order("session_date");
      return (data as any[]) ?? [];
    },
    enabled: !!weekPlanId && !!classId && !!subject,
  });

  // 4. Approved worksheets
  const { data: worksheetOptions = [] } = useQuery({
    queryKey: ["worksheets-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksheets")
        .select("id, title")
        .order("title")
        .limit(200);
      return (data as { id: string; title: string }[]) ?? [];
    },
  });

  // Merge saved sessions + auto-generated defaults from timetable
  useEffect(() => {
    if (!weekPlanId || !classId || !subject) return;
    const bySavedDate = new Map(
      savedSessions.map((s: any) => [s.session_date, s])
    );

    let base: SessionRow[] = [];

    if (timetableSlots.length > 0) {
      base = timetableSlots.map((s: any) => {
        const saved = bySavedDate.get(s.slot_date);
        if (saved) {
          return normalizeSaved(saved);
        }
        const d = new Date(s.slot_date);
        return {
          week_plan_id: weekPlanId,
          class_id: classId,
          subject,
          session_date: s.slot_date,
          day_of_week: dayName(d),
          timetable_slot_id: s.id,
          start_time: s.start_time || null,
          end_time: s.end_time || null,
          resource_source_type: "commercial_book",
          book_title: "",
          page_from: "",
          page_to: "",
          skill_focus: "",
          key_words: [],
          teacher_note: "",
          teacher_review_status: "draft",
        } satisfies SessionRow;
      });
    } else {
      // Default Monday–Friday rows
      const monday = new Date(weekStart);
      for (let i = 0; i < 5; i++) {
        const d = addDays(monday, i);
        const dateStr = format(d, "yyyy-MM-dd");
        const saved = bySavedDate.get(dateStr);
        if (saved) {
          base.push(normalizeSaved(saved));
        } else {
          base.push({
            week_plan_id: weekPlanId,
            class_id: classId,
            subject,
            session_date: dateStr,
            day_of_week: dayName(d),
            resource_source_type: "commercial_book",
            book_title: "",
            page_from: "",
            page_to: "",
            skill_focus: "",
            key_words: [],
            teacher_note: "",
            teacher_review_status: "draft",
          });
        }
      }
    }

    // Append any saved sessions that don't match today's timetable (e.g. timetable changed)
    for (const saved of savedSessions) {
      if (!base.find((b) => b.session_date === (saved as any).session_date)) {
        base.push(normalizeSaved(saved));
      }
    }
    base.sort((a, b) => a.session_date.localeCompare(b.session_date));
    setRows(base);
    setDirty({});
  }, [weekPlanId, classId, subject, JSON.stringify(timetableSlots), JSON.stringify(savedSessions), weekStart]);

  function normalizeSaved(s: any): SessionRow {
    return {
      id: s.id,
      weekly_teaching_subject_id: s.weekly_teaching_subject_id,
      week_plan_id: s.week_plan_id,
      class_id: s.class_id,
      subject: s.subject,
      session_date: s.session_date,
      day_of_week: s.day_of_week,
      timetable_slot_id: s.timetable_slot_id,
      start_time: s.start_time,
      end_time: s.end_time,
      resource_source_type: s.resource_source_type || "commercial_book",
      book_title: s.book_title || "",
      page_from: s.page_from || "",
      page_to: s.page_to || "",
      worksheet_id: s.worksheet_id || null,
      skill_focus: s.skill_focus || "",
      key_words: Array.isArray(s.key_words) ? s.key_words : [],
      teacher_note: s.teacher_note || "",
      teacher_review_status: s.teacher_review_status || "draft",
    };
  }

  const patchRow = (idx: number, patch: Partial<SessionRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty((prev) => ({ ...prev, [String(idx)]: true }));
  };

  // Auto-fill helper
  const runAutoFill = () => {
    if (!afBook.trim() || !afStart.trim()) {
      toast({ title: "Fill in book title and start page", variant: "destructive" });
      return;
    }
    const startNum = parseInt(afStart, 10);
    const per = Math.max(1, parseInt(afPer || "1", 10));
    if (isNaN(startNum)) {
      toast({ title: "Start page must be a number", variant: "destructive" });
      return;
    }
    setRows((prev) =>
      prev.map((r, i) => {
        const from = startNum + i * per;
        const to = per > 1 ? from + per - 1 : from;
        return {
          ...r,
          resource_source_type: "commercial_book",
          book_title: afBook,
          page_from: String(from),
          page_to: per > 1 ? String(to) : String(from),
        };
      })
    );
    setDirty(Object.fromEntries(rows.map((_, i) => [String(i), true])));
    toast({ title: "Pages auto-filled ✏️", description: "Review and adjust as needed." });
  };

  // Auto-fill skill from mapping when teacher enters book+page
  const lookupMapping = async (idx: number) => {
    const r = rows[idx];
    if (!branchId || !r.book_title || !r.page_from) return;
    const { data } = await supabase
      .from("commercial_book_page_mappings" as any)
      .select("skill_focus, learning_goal_text, key_words")
      .eq("branch_id", branchId)
      .ilike("book_title", r.book_title)
      .eq("subject", subject)
      .eq("page_from", r.page_from)
      .maybeSingle();
    if (data && !r.skill_focus) {
      patchRow(idx, {
        skill_focus: (data as any).skill_focus,
        key_words: Array.isArray((data as any).key_words) ? (data as any).key_words : r.key_words,
      });
      toast({ title: "Skill auto-filled from library 📚" });
    }
  };

  // Save all sessions (upsert subject row first, then sessions)
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!weekPlanId) throw new Error("No weekly plan found for this week.");
      // Ensure subject row exists
      let subjectId: string | null = subjectRow?.id ?? null;
      if (!subjectId) {
        const { data, error } = await supabase
          .from("weekly_teaching_subjects" as any)
          .insert({
            week_plan_id: weekPlanId,
            class_id: classId,
            subject,
            what_teaching: direction.weeklyFocusTitle || "",
            learning_goals: [],
            key_words: [],
            resources: [],
            notes: "",
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        subjectId = (data as any).id;
      }

      for (const r of rows) {
        const payload: any = {
          weekly_teaching_subject_id: subjectId,
          week_plan_id: weekPlanId,
          class_id: classId,
          subject,
          session_date: r.session_date,
          day_of_week: r.day_of_week,
          timetable_slot_id: r.timetable_slot_id || null,
          start_time: r.start_time || null,
          end_time: r.end_time || null,
          resource_source_type: r.resource_source_type,
          book_title: r.book_title || null,
          page_from: r.page_from || null,
          page_to: r.page_to || null,
          worksheet_id: r.worksheet_id || null,
          skill_focus: r.skill_focus || "",
          key_words: r.key_words || [],
          teacher_note: r.teacher_note || null,
          teacher_review_status: r.teacher_review_status || "draft",
        };
        if (r.id) {
          const { error } = await supabase
            .from("weekly_teaching_sessions" as any)
            .update(payload)
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("weekly_teaching_sessions" as any)
            .insert(payload);
          if (error) throw error;
        }
      }

      // Best-effort: save new page → skill mappings for future auto-fill
      if (branchId) {
        for (const r of rows) {
          if (
            r.resource_source_type === "commercial_book" &&
            r.book_title &&
            r.page_from &&
            r.skill_focus
          ) {
            await supabase
              .from("commercial_book_page_mappings" as any)
              .upsert(
                {
                  branch_id: branchId,
                  book_title: r.book_title,
                  subject,
                  age_group: direction.ageGroup || null,
                  page_from: r.page_from,
                  page_to: r.page_to || null,
                  skill_focus: r.skill_focus,
                  key_words: r.key_words || [],
                } as any,
                { onConflict: "branch_id,book_title,subject,age_group,page_from,page_to" as any }
              );
          }
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Teaching details saved ✅" });
      queryClient.invalidateQueries({ queryKey: ["wtsess", weekPlanId, classId, subject] });
      queryClient.invalidateQueries({ queryKey: ["wts-row", weekPlanId, classId, subject] });
      setDirty({});
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Every session must have a skill focus filled in — empty rows also count
  // as missing so teachers cannot accidentally generate on a half-filled week.
  const missingSkill = rows.filter((r) => !r.skill_focus.trim());
  const canGenerate = rows.length > 0 && missingSkill.length === 0;

  // Expose readiness to parent so it can gate the Generate Lesson Plan button.
  useEffect(() => {
    if (!onReadinessChange) return;
    onReadinessChange({
      sessionCount: rows.length,
      missingSkillCount: missingSkill.length,
      hasUnsaved: Object.keys(dirty).length > 0,
      ready: canGenerate,
    });
  }, [rows.length, missingSkill.length, dirty, canGenerate, onReadinessChange]);

  return (
    <Card className="shadow-sm border-primary/30">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
              Subject Lesson Preparation
            </CardTitle>
            <CardDescription className="mt-1">
              Tell the AI <em>what</em> you are teaching. The AI will generate <em>how</em> to teach it.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">{subject}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* This Week's Direction */}
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> This Week's Direction
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Class</div>{direction.className || "—"}</div>
            <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Age group</div>{direction.ageGroup || "—"}</div>
            <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Week starting</div>{direction.weekStart}</div>
            <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</div>{subject}</div>
            <div className="col-span-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Theme</div>{direction.theme || "—"}</div>
            <div className="col-span-2 md:col-span-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Weekly focus</div>{direction.weeklyFocusTitle || "—"}</div>
            {direction.keyQuestions && direction.keyQuestions.length > 0 && (
              <div className="col-span-2 md:col-span-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Key questions</div>
                {direction.keyQuestions.join(" · ")}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground italic">
            The principal has set the direction. You are preparing the subject lesson.
          </p>
        </div>

        {/* Auto-fill helper */}
        <div className="rounded-lg border border-dashed p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 className="h-4 w-4" /> Auto-fill Book Pages
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Book title</Label>
              <Input placeholder="e.g. English Book Age 4" value={afBook} onChange={(e) => setAfBook(e.target.value)} disabled={disabled} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start page</Label>
              <Input placeholder="10" value={afStart} onChange={(e) => setAfStart(e.target.value)} disabled={disabled} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Pages / session</Label>
              <Input placeholder="2" value={afPer} onChange={(e) => setAfPer(e.target.value)} disabled={disabled} className="h-9" />
            </div>
            <Button variant="outline" onClick={runAutoFill} disabled={disabled} className="h-9">
              <Wand2 className="h-4 w-4 mr-1" /> Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Book content is never uploaded — only title, page and skill are stored.
          </p>
        </div>

        {/* Session rows */}
        {rows.length === 0 ? (
          <Alert className="py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              No sessions found for this subject in the week. Check your timetable or contact your admin.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {rows.map((r, idx) => (
              <div key={r.session_date + idx} className="border rounded-lg p-4 space-y-4 bg-background">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Badge variant="outline">{r.day_of_week}</Badge>
                    <span>{r.session_date}</span>
                    {r.start_time && (
                      <span className="text-muted-foreground font-normal">
                        · {r.start_time?.slice(0, 5)}
                        {r.end_time ? `–${r.end_time.slice(0, 5)}` : ""}
                      </span>
                    )}
                  </div>
                  {r.skill_focus && (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
                    </Badge>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Resource source</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      disabled={disabled}
                      value={r.resource_source_type}
                      onChange={(e) => patchRow(idx, { resource_source_type: e.target.value })}
                    >
                      {RESOURCE_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  {r.resource_source_type === "commercial_book" && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Book title</Label>
                        <Input
                          value={r.book_title || ""}
                          disabled={disabled}
                          onChange={(e) => patchRow(idx, { book_title: e.target.value })}
                          className="h-9"
                          placeholder="e.g. English Book Age 4"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Page from</Label>
                        <Input
                          value={r.page_from || ""}
                          disabled={disabled}
                          onChange={(e) => patchRow(idx, { page_from: e.target.value })}
                          onBlur={() => lookupMapping(idx)}
                          className="h-9"
                          placeholder="10"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Page to</Label>
                        <Input
                          value={r.page_to || ""}
                          disabled={disabled}
                          onChange={(e) => patchRow(idx, { page_to: e.target.value })}
                          className="h-9"
                          placeholder="11"
                        />
                      </div>
                    </>
                  )}
                  {r.resource_source_type === "approved_worksheet" && (
                    <div className="md:col-span-3 space-y-1">
                      <Label className="text-xs text-muted-foreground">Approved worksheet</Label>
                      <select
                        className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                        disabled={disabled}
                        value={r.worksheet_id || ""}
                        onChange={(e) => patchRow(idx, { worksheet_id: e.target.value || null })}
                      >
                        <option value="">Select worksheet…</option>
                        {worksheetOptions.map((w) => (
                          <option key={w.id} value={w.id}>{w.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      What does this page teach? (Skill Focus) *
                    </Label>
                    <Input
                      value={r.skill_focus}
                      disabled={disabled}
                      onChange={(e) => patchRow(idx, { skill_focus: e.target.value })}
                      className={`h-9 ${
                        (r.book_title || r.page_from) && !r.skill_focus.trim()
                          ? "border-destructive"
                          : ""
                      }`}
                      placeholder="e.g. Letter A sound"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Key words (comma-separated)</Label>
                    <Input
                      value={(r.key_words || []).join(", ")}
                      disabled={disabled}
                      onChange={(e) =>
                        patchRow(idx, {
                          key_words: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="h-9"
                      placeholder="e.g. apple, ant, alligator"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Teacher note (optional)</Label>
                  <Textarea
                    value={r.teacher_note || ""}
                    disabled={disabled}
                    onChange={(e) => patchRow(idx, { teacher_note: e.target.value })}
                    rows={2}
                    className="resize-none text-sm"
                    placeholder="Anything the AI or a relief teacher should know for this session."
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {missingSkill.length > 0 && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              Please add what this page teaches before generating the lesson plan.
              {" "}
              <span className="opacity-80">
                ({missingSkill.length} session{missingSkill.length > 1 ? "s" : ""} missing skill focus)
              </span>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2 items-center pt-1">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={disabled || saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveMutation.isPending ? "Saving…" : "Save Teaching Details"}
          </Button>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {canGenerate
              ? "All sessions ready — you can generate the lesson plan below."
              : "Add skill focus before generating."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}