// Shared KSPK-aligned baseline assessment domains.
// Used by:
//  - CRM Pre-enrolment baseline dialog (PreEnrollmentAssessmentDialog)
//  - Admissions blank checklist PDF (EnrollmentAssessments › Assessment Form)
//  - In-app Assessment Report dialog & Print PDF report
// Keeping a single source of truth ensures the manual form, the
// principal's e-form entry and the generated reports stay in sync.

export type BaselineIndicator = { key: string; label: string };
export type BaselineDomain = {
  key: string;
  label: string;
  emoji: string;
  hint: string;
  scoreKey: string; // legacy aggregate key for backward compat
  kspkCode: "CL" | "EL" | "NT" | "PM" | "SE" | "CD" | "VC";
  indicators: BaselineIndicator[];
};

export const BASELINE_DOMAINS: BaselineDomain[] = [
  {
    key: "gross_motor",
    label: "Gross motor",
    emoji: "🤸",
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
    emoji: "✋",
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
    emoji: "🗣️",
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
    emoji: "📖",
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
    emoji: "🤝",
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
    emoji: "🧩",
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
    emoji: "🏠",
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
    emoji: "🎨",
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
    emoji: "⭐",
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

export const BASELINE_TOTAL_INDICATORS = BASELINE_DOMAINS.reduce(
  (n, d) => n + d.indicators.length,
  0,
);

export function baselineAvg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Given a `pre_enrollment_assessment` payload (or any object with
 * `domain_scores`), return an array of per-domain rows for display.
 * Falls back to legacy 4-score shape when domain_scores is absent.
 */
export function getBaselineDomainScores(
  assessment: any,
): Array<{ key: string; label: string; emoji: string; score: number }> {
  if (!assessment) return [];
  const ds = assessment.domain_scores as Record<string, number> | undefined;
  if (ds && Object.keys(ds).length) {
    return BASELINE_DOMAINS.map((d) => ({
      key: d.key,
      label: d.label,
      emoji: d.emoji,
      score: Number(ds[d.scoreKey]) || 0,
    }));
  }
  // Legacy fallback (4 aggregate scores)
  return [
    { key: "motor", label: "Motor Skills", emoji: "🤸", score: Number(assessment.motor_skills_score) || 0 },
    { key: "language", label: "Language", emoji: "🗣️", score: Number(assessment.language_score) || 0 },
    { key: "socio_emotional", label: "Socio-Emotional", emoji: "🤝", score: Number(assessment.socio_emotional_score) || 0 },
    { key: "cognitive", label: "Cognitive", emoji: "🧩", score: Number(assessment.cognitive_score) || 0 },
  ];
}