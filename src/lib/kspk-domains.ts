/**
 * KSPK Tunjang — the 7 developmental domains used by the curriculum.
 * Falls back to a hardcoded list if `development_domains` cannot be read.
 */
export type KspkDomain = {
  code: string;
  name: string;
  short: string;
  /** Optional legacy `baseline_assessments` numeric column that maps to this domain. */
  legacyScoreKey?: "motor_skills_score" | "language_score" | "socio_emotional_score" | "cognitive_score";
};

export const KSPK_DOMAINS: KspkDomain[] = [
  { code: "CL", name: "Communication & Language",      short: "Communication", legacyScoreKey: "language_score" },
  { code: "EL", name: "Early Literacy",                 short: "Literacy" },
  { code: "NT", name: "Numeracy & Thinking",            short: "Numeracy",     legacyScoreKey: "cognitive_score" },
  { code: "PM", name: "Physical & Motor Development",   short: "Physical",     legacyScoreKey: "motor_skills_score" },
  { code: "SE", name: "Social-Emotional & Self-Help",   short: "Social",       legacyScoreKey: "socio_emotional_score" },
  { code: "CD", name: "Creativity & Discovery",         short: "Creativity" },
  { code: "VC", name: "Values, Community & Belonging",  short: "Values" },
];

/**
 * Given a `baseline_assessments` row, extract the score for a domain.
 * Prefer the new `domain_scores` JSONB; otherwise fall back to the
 * legacy aggregate column where one exists.
 */
export function readDomainScore(row: any, code: string): number | null {
  if (!row) return null;
  const ds = row.domain_scores ?? {};
  if (typeof ds?.[code] === "number") return ds[code];
  const meta = KSPK_DOMAINS.find((d) => d.code === code);
  if (meta?.legacyScoreKey && typeof row[meta.legacyScoreKey] === "number") return row[meta.legacyScoreKey];
  return null;
}