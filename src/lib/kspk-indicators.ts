/**
 * Developmental indicator bank for the Sprouts assessment.
 *
 * Combines:
 *  - KSPK 2017 Tunjang (Malaysia national preschool curriculum) — 7 domain spine.
 *  - Ages & Stages Questionnaires (ASQ-3) — age-banded milestone framing.
 *  - Teaching Strategies GOLD — 5-level Not Yet → Mastered progression scale.
 *  - EYFS UK — encourages anecdotal/photo evidence per observation.
 *
 * Scoring rule: each indicator is rated 0..4 on the LEVELS scale below.
 * The domain score is the average of its indicator levels, normalised to
 * 0..5 so it stays compatible with the existing `domain_scores` JSONB
 * column on `baseline_assessments`.
 */
import { KSPK_DOMAINS } from "./kspk-domains";

export type IndicatorLevel = 0 | 1 | 2 | 3 | 4;

export const LEVELS: {
  value: IndicatorLevel;
  label: string;
  short: string;
  description: string;
  color: string;
}[] = [
  { value: 0, label: "Not yet observed",        short: "Not yet",     description: "No clear evidence at this time.",                                color: "bg-muted text-muted-foreground" },
  { value: 1, label: "Emerging",                short: "Emerging",    description: "Beginning to show the skill, needs significant adult support.",  color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  { value: 2, label: "Developing",              short: "Developing",  description: "Demonstrates the skill with prompts or scaffolding.",            color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  { value: 3, label: "Proficient",              short: "Proficient",  description: "Performs the skill independently and consistently.",             color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  { value: 4, label: "Mastered / Exceeds",      short: "Mastered",    description: "Performs reliably across contexts; teaches or extends peers.",   color: "bg-primary/15 text-primary" },
];

export const LEVEL_LABELS = LEVELS.map((l) => l.short);

/** Indicator descriptors per KSPK Tunjang. Add age band hints where useful. */
export const DOMAIN_INDICATORS: Record<string, string[]> = {
  CL: [
    "Follows simple 1–2 step instructions",
    "Speaks in clear phrases / sentences appropriate to age",
    "Names familiar objects, people, and body parts",
    "Asks questions (what / where / why)",
    "Engages in back-and-forth conversation",
    "Communicates needs and feelings using words",
    "Uses appropriate volume and turn-taking in group talk",
  ],
  EL: [
    "Listens attentively to a short story",
    "Recognises own name in print",
    "Identifies some letters of the alphabet",
    "Pretends to read familiar books",
    "Holds a crayon / pencil to scribble or write",
    "Shows interest in print in the environment",
    "Identifies rhyming words and beginning sounds",
  ],
  NT: [
    "Counts objects (1–10 or beyond, age appropriate)",
    "Matches or sorts by colour, shape, or size",
    "Recognises simple shapes and numerals",
    "Compares quantities (more / less / same)",
    "Sustains attention on a task for 5+ minutes",
    "Solves simple problems independently",
    "Recognises simple patterns (AB / ABB)",
  ],
  PM: [
    "Walks and runs confidently without falling",
    "Climbs stairs with alternating feet",
    "Jumps with both feet off the ground",
    "Throws and attempts to catch a ball",
    "Balances on one foot briefly",
    "Uses pincer grip to pick up small objects",
    "Holds a crayon / pencil purposefully",
    "Stacks blocks or completes simple puzzles",
  ],
  SE: [
    "Separates from parent without prolonged distress",
    "Plays alongside or with other children",
    "Shares toys and takes turns with support",
    "Expresses feelings with words or gestures",
    "Manages transitions between activities",
    "Toilet-trained (or in active progress)",
    "Washes hands and feeds self with utensils",
    "Recovers from frustration with adult support",
  ],
  CD: [
    "Engages in pretend / imaginative play",
    "Sings, dances, or moves to music",
    "Explores art materials (paint, dough, collage)",
    "Asks questions and explores how things work",
    "Tells simple stories or describes pictures",
    "Experiments with shapes, sounds, or movement",
    "Builds or constructs original creations",
  ],
  VC: [
    "Greets familiar people warmly",
    "Says please, thank you, and sorry with prompting",
    "Cares for classroom resources and tidies up",
    "Shows respect for adults and peers",
    "Knows basic family / school routines",
    "Demonstrates curiosity about own culture and others",
    "Participates in classroom rituals (assembly, doa)",
  ],
};

/** Convert the raw 0..4 indicator levels into a 0..5 domain score. */
export function domainScoreFromLevels(levels: IndicatorLevel[]): number {
  if (!levels.length) return 0;
  const sum = levels.reduce((s, v) => s + v, 0);
  // Normalise mean (0..4) → (0..5), one decimal.
  return Math.round(((sum / levels.length) * 5 / 4) * 10) / 10;
}

/** Convenience: build an empty response shape for all 7 KSPK domains. */
export function emptyResponses(): Record<string, IndicatorLevel[]> {
  return Object.fromEntries(
    KSPK_DOMAINS.map((d) => [d.code, new Array(DOMAIN_INDICATORS[d.code]?.length ?? 0).fill(0) as IndicatorLevel[]]),
  );
}

/** Build an evidence-note shape with the same keying. */
export function emptyEvidence(): Record<string, string[]> {
  return Object.fromEntries(
    KSPK_DOMAINS.map((d) => [d.code, new Array(DOMAIN_INDICATORS[d.code]?.length ?? 0).fill("")]),
  );
}