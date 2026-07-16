import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, Baby, MessageCircle, Heart, Brain, Sparkles, Home, AlertCircle, BookOpen, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any | null;
  onSaved?: (payload: any) => void;
}

/**
 * Comprehensive pre-enrollment screener.
 * Informed by ASQ-3, EYFS Prime Areas, NAEYC developmental domains,
 * and Malaysia's PERMATA / KSPK readiness indicators.
 *
 * Five domain groups, each with 4-6 observable indicators rated 1-5.
 * Plus a "Child context" panel capturing the qualitative data the
 * AI lesson-planner needs (interests, home language, routines, flags).
 */

type Indicator = { key: string; label: string };
type Domain = {
  key:
    | "gross_motor"
    | "fine_motor"
    | "language_communication"
    | "early_literacy"
    | "socio_emotional"
    | "cognitive"
    | "self_help"
    | "creativity_discovery"
    | "values_community";
  label: string;
  icon: any;
  hint: string;
  scoreKey: string; // legacy aggregate key for backward compat
  kspkCode: "CL" | "EL" | "NT" | "PM" | "SE" | "CD" | "VC";
  indicators: Indicator[];
};

const DOMAINS: Domain[] = [
  {
    key: "gross_motor",
    label: "Gross motor",
    icon: Baby,
    hint: "Whole-body movement, balance & coordination",
    scoreKey: "motor_skills_score",
    kspkCode: "PM",
    indicators: [
      { key: "walks_runs_confidently", label: "Walks & runs confidently without falling" },
      { key: "climbs_stairs", label: "Climbs stairs with alternating feet / handrail" },
      { key: "jumps_two_feet", label: "Jumps with both feet off the ground" },
      { key: "throws_catches_ball", label: "Throws and attempts to catch a ball" },
      { key: "balances_one_foot", label: "Balances on one foot briefly" },
    ],
  },
  {
    key: "fine_motor",
    label: "Fine motor",
    icon: Sparkles,
    hint: "Hand control, grip & manipulation",
    scoreKey: "fine_motor_score",
    kspkCode: "PM",
    indicators: [
      { key: "pincer_grip", label: "Uses pincer grip to pick up small objects" },
      { key: "holds_crayon", label: "Holds a crayon / pencil purposefully" },
      { key: "scribbles_draws", label: "Scribbles, draws lines or simple shapes" },
      { key: "stacks_blocks", label: "Stacks blocks or completes simple puzzles" },
      { key: "uses_utensils", label: "Uses spoon / fork to feed self" },
    ],
  },
  {
    key: "language_communication",
    label: "Communication & language",
    icon: MessageCircle,
    hint: "Receptive + expressive language, listening",
    scoreKey: "language_score",
    kspkCode: "CL",
    indicators: [
      { key: "follows_instructions", label: "Follows simple 1-2 step instructions" },
      { key: "speaks_phrases", label: "Speaks in 2-4 word phrases / sentences" },
      { key: "names_objects", label: "Names familiar objects, people, body parts" },
      { key: "asks_questions", label: "Asks questions (what / where / why)" },
      { key: "listens_to_story", label: "Listens attentively to a short story" },
      { key: "engages_conversation", label: "Engages in back-and-forth conversation" },
    ],
  },
  {
    key: "early_literacy",
    label: "Early literacy",
    icon: BookOpen,
    hint: "Print awareness, letters, pre-writing",
    scoreKey: "early_literacy_score",
    kspkCode: "EL",
    indicators: [
      { key: "recognises_name_print", label: "Recognises own name in print" },
      { key: "identifies_some_letters", label: "Identifies some letters of the alphabet" },
      { key: "pretend_reads", label: "Pretends to read familiar books" },
      { key: "interest_in_print", label: "Shows interest in print in the environment" },
      { key: "pre_writing_marks", label: "Makes pre-writing marks or shapes" },
    ],
  },
  {
    key: "socio_emotional",
    label: "Social-emotional & self-help",
    icon: Heart,
    hint: "Confidence, regulation, peer interaction",
    scoreKey: "socio_emotional_score",
    kspkCode: "SE",
    indicators: [
      { key: "separates_from_parent", label: "Separates from parent without prolonged distress" },
      { key: "plays_alongside_peers", label: "Plays alongside or with other children" },
      { key: "shares_takes_turns", label: "Shares toys / takes turns with support" },
      { key: "expresses_feelings", label: "Expresses feelings with words or gestures" },
      { key: "responds_to_adult", label: "Responds to and seeks comfort from familiar adults" },
      { key: "manages_transitions", label: "Manages transitions between activities" },
    ],
  },
  {
    key: "cognitive",
    label: "Numeracy & thinking",
    icon: Brain,
    hint: "Counting, sorting, problem solving",
    scoreKey: "cognitive_score",
    kspkCode: "NT",
    indicators: [
      { key: "sustained_attention", label: "Sustains attention on an activity for 5+ minutes" },
      { key: "matches_sorts", label: "Matches or sorts by colour, shape or size" },
      { key: "counts_objects", label: "Counts objects (1-5 or beyond)" },
      { key: "recognises_numbers", label: "Recognises some numbers" },
      { key: "problem_solves", label: "Attempts to solve simple problems independently" },
    ],
  },
  {
    key: "self_help",
    label: "Self-help & independence",
    icon: Home,
    hint: "Daily routines, toileting, self-care",
    scoreKey: "self_help_score",
    kspkCode: "SE",
    indicators: [
      { key: "toilet_trained", label: "Toilet trained (or in progress)" },
      { key: "washes_hands", label: "Washes hands with prompting" },
      { key: "dresses_self", label: "Removes / puts on simple clothing or shoes" },
      { key: "drinks_from_cup", label: "Drinks from an open cup independently" },
      { key: "tidies_up", label: "Helps tidy up toys when asked" },
    ],
  },
  {
    key: "creativity_discovery",
    label: "Creativity & discovery",
    icon: Sparkles,
    hint: "Imagination, art, music, exploration",
    scoreKey: "creativity_score",
    kspkCode: "CD",
    indicators: [
      { key: "pretend_play", label: "Engages in pretend / imaginative play" },
      { key: "sings_dances", label: "Sings, dances or moves to music" },
      { key: "explores_art", label: "Explores art materials (paint, dough, collage)" },
      { key: "asks_how_things_work", label: "Asks questions and explores how things work" },
      { key: "describes_pictures", label: "Tells simple stories or describes pictures" },
    ],
  },
  {
    key: "values_community",
    label: "Values, community & belonging",
    icon: Star,
    hint: "Manners, respect, cultural awareness",
    scoreKey: "values_score",
    kspkCode: "VC",
    indicators: [
      { key: "greets_warmly", label: "Greets familiar people warmly" },
      { key: "please_thank_you", label: "Says please, thank you and sorry with prompting" },
      { key: "cares_for_resources", label: "Cares for classroom resources and tidies up" },
      { key: "respects_others", label: "Shows respect for adults and peers" },
      { key: "knows_routines", label: "Knows basic family / school routines" },
    ],
  },
];

const LEARNING_STYLES = ["Visual", "Auditory", "Kinesthetic / hands-on", "Verbal", "Music & rhythm", "Nature / outdoor"];
const TEMPERAMENTS = ["Calm", "Energetic", "Cautious / slow-to-warm", "Outgoing", "Sensitive", "Strong-willed"];
const FLAGS = [
  { key: "speech_delay", label: "Possible speech / language delay" },
  { key: "separation_anxiety", label: "Significant separation anxiety" },
  { key: "sensory_sensitivities", label: "Sensory sensitivities (sound / touch / food)" },
  { key: "motor_concerns", label: "Motor coordination concerns" },
  { key: "behaviour_concerns", label: "Behaviour / regulation concerns" },
  { key: "medical_concerns", label: "Medical condition affecting learning" },
];

function avg(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export default function PreEnrollmentAssessmentDialog({ open, onOpenChange, lead, onSaved }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [indicators, setIndicators] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [context, setContext] = useState({
    home_languages: "",
    prior_schooling: "",
    interests: "",
    favourite_activities: "",
    dislikes_triggers: "",
    routines: "",
    sleep_nap: "",
    diet_allergies: "",
    learning_styles: [] as string[],
    temperament: [] as string[],
    flags: [] as string[],
    parent_goals: "",
    teacher_recommendation: "",
  });

  useEffect(() => {
    if (!open) return;
    const existing = lead?.pre_enrollment_assessment as any;
    if (existing) {
      setIndicators(existing.indicators ?? {});
      setNotes(existing.teacher_notes ?? "");
      setContext({
        home_languages: existing.context?.home_languages ?? "",
        prior_schooling: existing.context?.prior_schooling ?? "",
        interests: existing.context?.interests ?? "",
        favourite_activities: existing.context?.favourite_activities ?? "",
        dislikes_triggers: existing.context?.dislikes_triggers ?? "",
        routines: existing.context?.routines ?? "",
        sleep_nap: existing.context?.sleep_nap ?? "",
        diet_allergies: existing.context?.diet_allergies ?? "",
        learning_styles: existing.context?.learning_styles ?? [],
        temperament: existing.context?.temperament ?? [],
        flags: existing.context?.flags ?? [],
        parent_goals: existing.context?.parent_goals ?? "",
        teacher_recommendation: existing.context?.teacher_recommendation ?? "",
      });
    } else {
      setIndicators({});
      setNotes("");
      setContext({
        home_languages: "",
        prior_schooling: "",
        interests: "",
        favourite_activities: "",
        dislikes_triggers: "",
        routines: "",
        sleep_nap: "",
        diet_allergies: "",
        learning_styles: [],
        temperament: [],
        flags: [],
        parent_goals: "",
        teacher_recommendation: "",
      });
    }
  }, [open, lead]);

  const domainScores: Record<string, number> = {};
  const kspkScores: Record<string, number[]> = { CL: [], EL: [], NT: [], PM: [], SE: [], CD: [], VC: [] };
  for (const d of DOMAINS) {
    const vals = d.indicators.map((i) => indicators[`${d.key}.${i.key}`]).filter((v) => typeof v === "number") as number[];
    domainScores[d.scoreKey] = vals.length ? avg(vals) : 0;
    if (vals.length) kspkScores[d.kspkCode].push(...vals);
  }
  const kspkDomainScores: Record<string, number> = {};
  for (const code of Object.keys(kspkScores)) {
    const arr = kspkScores[code];
    kspkDomainScores[code] = arr.length ? avg(arr) : 0;
  }
  const ratedCount = Object.keys(indicators).length;
  const totalIndicators = DOMAINS.reduce((a, d) => a + d.indicators.length, 0);
  const completion = Math.round((ratedCount / totalIndicators) * 100);

  const toggleMulti = (field: "learning_styles" | "temperament" | "flags", value: string) => {
    setContext((c) => ({
      ...c,
      [field]: c[field].includes(value) ? c[field].filter((v) => v !== value) : [...c[field], value],
    }));
  };

  const handleSave = async () => {
    if (!lead) return;
    setSubmitting(true);
    try {
      const payload = {
        // legacy aggregates (kept for back-compat with downstream consumers)
        motor_skills_score: domainScores.motor_skills_score || domainScores.fine_motor_score || 0,
        language_score: domainScores.language_score || 0,
        socio_emotional_score: domainScores.socio_emotional_score || 0,
        cognitive_score: domainScores.cognitive_score || 0,
        // new structured data
        version: 3,
        domain_scores: domainScores,
        kspk_domain_scores: kspkDomainScores,
        indicators,
        context,
        teacher_notes: notes.trim() || null,
        completion_pct: completion,
        assessed_by: user?.id ?? null,
      };
      const { error } = await supabase
        .from("leads")
        .update({
          pre_enrollment_assessment: payload,
          pre_enrollment_assessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", lead.id);
      if (error) throw error;
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        activity_type: "assessment_completed",
        description: `Comprehensive pre-enrollment assessment recorded (${completion}% complete · ${DOMAINS.map((d) => `${d.label.split(" ")[0]}:${domainScores[d.scoreKey] || "-"}`).join(" ")})`,
        created_by: user?.id,
      });
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-activities", lead.id] });
      toast({ title: "Assessment saved", description: "You can now enrol this child with full context." });
      onSaved?.(payload);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl h-[calc(100dvh-3rem)] max-h-[92dvh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Pre-enrolment baseline assessment
          </DialogTitle>
          <DialogDescription>
            Observe {lead?.child_name ?? "the child"} across the 7 KSPK developmental domains during tour or trial.
            Rate each indicator <span className="font-medium">1 (emerging)</span> to <span className="font-medium">5 (secure)</span>.
            Aligned with ASQ-3, EYFS Prime Areas and KSPK readiness benchmarks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {ratedCount} of {totalIndicators} indicators rated
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-xs font-medium tabular-nums">{completion}%</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 -mx-6 overflow-y-auto overscroll-contain px-6 pr-4 pb-4">
          <Accordion type="multiple" defaultValue={[DOMAINS[0].key, "context"]} className="w-full">
            {DOMAINS.map((d) => {
              const Icon = d.icon;
              const score = domainScores[d.scoreKey];
              return (
                <AccordionItem key={d.key} value={d.key}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 items-center gap-3 pr-3">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <div className="text-left flex-1">
                        <div className="text-sm font-medium">{d.label}</div>
                        <div className="text-xs text-muted-foreground">{d.hint}</div>
                      </div>
                      {score > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                          {score.toFixed(1)} / 5
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2.5 pt-1">
                      {d.indicators.map((ind) => {
                        const k = `${d.key}.${ind.key}`;
                        const val = indicators[k];
                        return (
                          <div key={k} className="rounded-md border p-2.5">
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <Label className="text-xs leading-snug">{ind.label}</Label>
                              {val ? (
                                <span className="text-xs font-semibold text-primary shrink-0">{val}/5</span>
                              ) : (
                                <span className="text-xs text-muted-foreground shrink-0">Not rated</span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setIndicators((s) => ({ ...s, [k]: n }))}
                                  className={`flex-1 rounded border py-1 text-xs font-medium transition ${
                                    val === n
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border hover:bg-muted"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}

            <AccordionItem value="context">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 items-center gap-3 pr-3">
                  <Home className="h-4 w-4 text-primary shrink-0" />
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium">Child context</div>
                    <div className="text-xs text-muted-foreground">Home, interests, temperament & flags — feeds the AI planner</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Languages spoken at home</Label>
                    <Input
                      placeholder="e.g. English, Mandarin, BM"
                      value={context.home_languages}
                      onChange={(e) => setContext({ ...context, home_languages: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prior schooling / playgroup</Label>
                    <Input
                      placeholder="e.g. None, 6 months daycare"
                      value={context.prior_schooling}
                      onChange={(e) => setContext({ ...context, prior_schooling: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Interests & passions</Label>
                    <Textarea
                      rows={2}
                      placeholder="Dinosaurs, vehicles, music, drawing, animals…"
                      value={context.interests}
                      onChange={(e) => setContext({ ...context, interests: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Favourite activities</Label>
                    <Textarea
                      rows={2}
                      placeholder="Building blocks, water play, story time…"
                      value={context.favourite_activities}
                      onChange={(e) => setContext({ ...context, favourite_activities: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dislikes / triggers</Label>
                    <Textarea
                      rows={2}
                      placeholder="Loud noises, messy textures, transitions…"
                      value={context.dislikes_triggers}
                      onChange={(e) => setContext({ ...context, dislikes_triggers: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Daily routines at home</Label>
                    <Textarea
                      rows={2}
                      placeholder="Meal times, screen time, outdoor play…"
                      value={context.routines}
                      onChange={(e) => setContext({ ...context, routines: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sleep & nap pattern</Label>
                    <Input
                      placeholder="e.g. 1pm-3pm nap, sleeps 8pm"
                      value={context.sleep_nap}
                      onChange={(e) => setContext({ ...context, sleep_nap: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Diet / allergies / medical</Label>
                    <Input
                      placeholder="e.g. No nuts, asthma, halal only"
                      value={context.diet_allergies}
                      onChange={(e) => setContext({ ...context, diet_allergies: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Preferred learning styles</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {LEARNING_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleMulti("learning_styles", s)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            context.learning_styles.includes(s)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Temperament</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPERAMENTS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleMulti("temperament", t)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            context.temperament.includes(t)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                      Areas needing attention (flag for follow-up)
                    </Label>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {FLAGS.map((f) => (
                        <label
                          key={f.key}
                          className="flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer hover:bg-muted"
                        >
                          <Checkbox
                            checked={context.flags.includes(f.key)}
                            onCheckedChange={() => toggleMulti("flags", f.key)}
                          />
                          <span>{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Parent's goals for the child</Label>
                    <Textarea
                      rows={2}
                      placeholder="What does the family hope to see in the next 6-12 months?"
                      value={context.parent_goals}
                      onChange={(e) => setContext({ ...context, parent_goals: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Teacher's class placement recommendation</Label>
                    <Textarea
                      rows={2}
                      placeholder="Suggested class / age group, support needed, peer fit…"
                      value={context.teacher_recommendation}
                      onChange={(e) => setContext({ ...context, teacher_recommendation: e.target.value })}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="notes">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 items-center gap-3 pr-3">
                  <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                  <div className="text-left flex-1">
                    <div className="text-sm font-medium">Overall teacher notes</div>
                    <div className="text-xs text-muted-foreground">Narrative summary of the observation</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarise the child's strengths, areas to grow, how they engaged during the tour or trial, and anything else the lead teacher should know on day one…"
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t pt-4 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            ) : (
              `Save assessment${ratedCount > 0 ? ` (${completion}%)` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}