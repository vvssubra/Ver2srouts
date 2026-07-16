import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Home, Sparkles, MessageCircle, Camera } from "lucide-react";
import { format } from "date-fns";

/**
 * Resolve the current weekly curriculum plan for a child's class, plus the
 * parent month plan and theme bank used to enrich the parent Progress page.
 *
 * Returns null when no plan exists — callers must handle the empty state.
 */
export function useWeeklyLessonContext(classId?: string | null) {
  return useQuery({
    queryKey: ["parent-weekly-lesson-context", classId],
    enabled: !!classId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const monthNum = now.getMonth() + 1;
      // Pull a handful of recent monthly plans for this class — pick current
      // month if available, otherwise the most recent one we have.
      const { data: monthlyRaw } = await supabase
        .from("monthly_curriculum_plans" as any)
        .select(
          "id, month_number, theme_bank_id, big_idea, monthly_objectives, family_connection, suggested_books, suggested_songs, status"
        )
        .eq("class_id", classId!)
        .order("month_number", { ascending: false })
        .limit(12);
      const monthly = (monthlyRaw ?? []) as any[];
      const monthPlan: any =
        (monthly ?? []).find((m: any) => m.month_number === monthNum) ??
        (monthly ?? [])[0] ??
        null;
      if (!monthPlan) return null;

      // Theme bank for vocabulary / parent connection.
      let themeBank: any = null;
      if (monthPlan.theme_bank_id) {
        const { data: tb } = await supabase
          .from("theme_bank" as any)
          .select(
            "id, theme_name, big_idea, key_vocabulary, key_concepts, suggested_books, suggested_songs, parent_connection"
          )
          .eq("id", monthPlan.theme_bank_id)
          .maybeSingle();
        themeBank = tb;
      }

      // Weekly plans for this monthly plan.
      const { data: weeksRaw } = await supabase
        .from("weekly_curriculum_plans" as any)
        .select(
          "id, week_number, focus_title, focus_questions, weekly_objectives, observation_focus, suggested_books, suggested_songs, status"
        )
        .eq("monthly_plan_id", monthPlan.id)
        .order("week_number");
      const weeks = (weeksRaw ?? []) as any[];
      const weekIdx = Math.min(
        Math.max(Math.ceil(now.getDate() / 7), 1),
        (weeks ?? []).length || 1,
      );
      const weeklyPlan =
        (weeks ?? []).find((w: any) => w.week_number === weekIdx) ??
        (weeks ?? [])[0] ??
        null;

      return { monthPlan, weeklyPlan, themeBank };
    },
  });
}

const toList = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.text ?? x?.label ?? x?.title ?? "")).filter(Boolean);
  if (typeof v === "string") return v.split(/[\n,;•]/).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "object") return Object.values(v as any).map((x) => String(x)).filter(Boolean);
  return [];
};

interface WeeklyContext {
  monthPlan: any;
  weeklyPlan: any | null;
  themeBank: any | null;
}

/** Build a parent-friendly "Growing next" line that prefers weekly context. */
export function buildGrowingNextText(
  childFirst: string,
  ctx: WeeklyContext | null | undefined,
  lowDomainNames: string[],
): string | null {
  const focus = ctx?.weeklyPlan?.focus_title || ctx?.themeBank?.theme_name;
  const obs = toList(ctx?.weeklyPlan?.observation_focus).slice(0, 2);
  if (focus && obs.length) {
    return `Teacher is supporting ${childFirst} to explore "${focus}" — practising ${obs.join(" and ")}.`;
  }
  if (focus) {
    return `Teacher is supporting ${childFirst} with this week's focus: ${focus}.`;
  }
  if (lowDomainNames.length) {
    return `Teacher is supporting ${childFirst} in ${lowDomainNames.slice(0, 2).join(" and ")}.`;
  }
  return null;
}

/** "This Week's Learning at Home" card — uses theme bank + weekly plan. */
export function ParentWeeklyAtHomeCard({
  childFirst,
  ctx,
}: {
  childFirst: string;
  ctx: WeeklyContext | null | undefined;
}) {
  if (!ctx) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" /> This Week's Learning at Home
          </h4>
          <p className="text-xs text-muted-foreground">
            Home activities will appear once this week's learning plan is ready.
          </p>
        </CardContent>
      </Card>
    );
  }
  const { weeklyPlan, themeBank, monthPlan } = ctx;
  const theme = themeBank?.theme_name || weeklyPlan?.focus_title || monthPlan?.big_idea;
  const vocab = toList(themeBank?.key_vocabulary).slice(0, 5);
  const questions = toList(weeklyPlan?.focus_questions);
  const askQuestion = questions[0] || null;
  const familyTips = [
    ...toList(themeBank?.parent_connection),
    ...toList(monthPlan?.family_connection),
  ].slice(0, 3);
  const books = toList(weeklyPlan?.suggested_books).concat(toList(themeBank?.suggested_books)).slice(0, 1);
  const songs = toList(weeklyPlan?.suggested_songs).concat(toList(themeBank?.suggested_songs)).slice(0, 1);

  // Deterministic fallback activities if teacher hasn't filled in family
  // connection — never call AI here.
  const fallbackTips =
    familyTips.length > 0
      ? familyTips
      : [
          theme ? `Talk with ${childFirst} about ${String(theme).toLowerCase()} and what they noticed today.` : `Ask ${childFirst} about one thing they enjoyed at school today.`,
          vocab.length ? `Practise the words ${vocab.slice(0, 3).join(", ")} during play.` : `Read a short story together and point to new words.`,
          `Try a quick activity together — drawing, singing or a short outdoor walk.`,
        ];

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" /> This Week's Learning at Home
        </h4>
        {theme && (
          <p className="text-xs text-foreground/90">
            <span className="font-medium">Theme:</span> {theme}
          </p>
        )}
        {vocab.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {vocab.map((w) => (
              <Badge key={w} variant="secondary" className="text-[10px]">{w}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Teachers are still preparing this week's vocabulary focus.
          </p>
        )}
        {askQuestion && (
          <div className="text-xs text-foreground/80 flex gap-1.5">
            <MessageCircle className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <span><span className="font-medium">Ask:</span> "{askQuestion}"</span>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-foreground/80">Try at home:</p>
          {fallbackTips.map((t, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {t}</p>
          ))}
        </div>
        {(books.length > 0 || songs.length > 0) && (
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2 pt-1 border-t">
            {books[0] && <span><BookOpen className="inline h-3 w-3 mr-0.5" /> {books[0]}</span>}
            {songs[0] && <span>🎵 {songs[0]}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** "Teacher's Next Focus" card — derived from weekly observation focus + growing skills. */
export function ParentTeacherNextFocusCard({
  childFirst,
  ctx,
  growingSkills,
  lowDomainNames,
  approvedFocus,
  evidenceCount = 0,
}: {
  childFirst: string;
  ctx: WeeklyContext | null | undefined;
  growingSkills: { label: string; domain?: string | null }[];
  lowDomainNames: string[];
  approvedFocus?: {
    focus_title: string;
    focus_description?: string | null;
    vocabulary_json?: any;
    observation_cues_json?: any;
    home_support_json?: any;
  } | null;
  evidenceCount?: number;
}) {
  // Priority 1: a teacher-approved focus that is parent-visible.
  if (approvedFocus) {
    const vocab = toList(approvedFocus.vocabulary_json).slice(0, 5);
    const cues = toList(approvedFocus.observation_cues_json).slice(0, 3);
    const home = toList(approvedFocus.home_support_json).slice(0, 3);
    return (
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Teacher's Next Focus
          </h4>
          <p className="text-xs font-medium text-foreground">{approvedFocus.focus_title}</p>
          {approvedFocus.focus_description && (
            <p className="text-xs text-foreground/85">{approvedFocus.focus_description}</p>
          )}
          {vocab.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {vocab.map((w) => (
                <Badge key={w} variant="secondary" className="text-[10px]">{w}</Badge>
              ))}
            </div>
          )}
          {cues.length > 0 && (
            <ul className="text-[11px] text-muted-foreground space-y-0.5 pt-1">
              {cues.map((c, i) => <li key={i}>• {c}</li>)}
            </ul>
          )}
          {home.length > 0 && (
            <div className="pt-1 border-t mt-1">
              <p className="text-[11px] font-medium text-foreground/80 mt-1">Try at home:</p>
              {home.map((h, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">• {h}</p>
              ))}
            </div>
          )}
          {evidenceCount > 0 && (
            <div className="pt-1 border-t mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <Camera className="h-3 w-3 text-primary" />
              Evidence recorded: {evidenceCount} learning moment{evidenceCount === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Priority 2: deterministic fallback from weekly context / progress.
  const obs = toList(ctx?.weeklyPlan?.observation_focus);
  let line: string;
  if (obs.length) {
    line = `Teachers will continue supporting ${childFirst} with ${obs.slice(0, 2).join(" and ")} during this week's activities.`;
  } else if (growingSkills.length) {
    line = `Teachers will keep observing ${childFirst} as they practise ${growingSkills.slice(0, 2).map((g) => g.label).join(" and ")}.`;
  } else if (lowDomainNames.length) {
    line = `Teachers will continue supporting ${childFirst} in ${lowDomainNames.slice(0, 2).join(" and ")} during daily play and routines.`;
  } else {
    line = `Teachers will continue observing ${childFirst} during daily learning activities and update progress as new evidence is recorded.`;
  }
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Teacher's Next Focus
        </h4>
        <p className="text-xs text-foreground/85">{line}</p>
      </CardContent>
    </Card>
  );
}

/** Evidence strip — latest 5 skill-tagged moments for this child. */
export function ParentEvidenceStrip({
  skillAssessments,
  domainName,
  onOpenMoment,
}: {
  skillAssessments: any[] | undefined;
  domainName: (id: string | null) => string;
  onOpenMoment?: (updateId: string) => void;
}) {
  const rows = (skillAssessments ?? [])
    .filter((s: any) => s.child_updates?.visible_to_parent !== false)
    .slice()
    .sort((a: any, b: any) => {
      const ad = a.child_updates?.activity_date || a.created_at;
      const bd = b.child_updates?.activity_date || b.created_at;
      return ad < bd ? 1 : -1;
    })
    .slice(0, 5);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" /> Evidence from Learning Journey
        </h4>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Learning evidence will appear here as teachers observe your child during class activities.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((s: any) => {
              const u = s.child_updates || {};
              const media = (u.child_update_media ?? [])
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              const first = media[0];
              const when = u.activity_date || s.created_at;
              const preview = u.parent_summary || u.caption || u.ai_learning_story || "";
              const clickable = !!(onOpenMoment && u.id);
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-3 ${clickable ? "cursor-pointer hover:bg-muted/40" : ""} rounded-md p-1 -m-1`}
                  onClick={clickable ? () => onOpenMoment!(u.id) : undefined}
                >
                  {first?.url ? (
                    <img
                      src={first.url}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-md object-cover border shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground line-clamp-1">
                      {s.indicator_label || "Skill observed"}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">
                      {domainName(s.domain_id)}
                      {when ? ` · ${format(new Date(when), "d MMM")}` : ""}
                      {s.proficiency_level ? ` · ${s.proficiency_level}` : ""}
                    </div>
                    {preview && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{preview}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}