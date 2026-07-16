import { KSPK_DOMAINS, readDomainScore } from "@/lib/kspk-domains";

export type ProgressStatus = "improved" | "maintained" | "needs_support" | "no_data";

export type DomainComparisonRow = {
  code: string;
  name: string;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  status: ProgressStatus;
};

export type AssessmentSummary = {
  academicYear: string | null;
  termLabel: string | null;
  termStart: string | null;
  termEnd: string | null;
  baseline: {
    id: string;
    date_evaluated: string;
    assessment_type: string | null;
  } | null;
  current: {
    id: string;
    date_evaluated: string;
    assessment_type: string | null;
  } | null;
  rows: DomainComparisonRow[];
};

const IMPROVED_THRESHOLD = 0.3;

export function statusForDelta(delta: number | null): ProgressStatus {
  if (delta === null || Number.isNaN(delta)) return "no_data";
  if (delta >= IMPROVED_THRESHOLD) return "improved";
  if (delta <= -IMPROVED_THRESHOLD) return "needs_support";
  return "maintained";
}

export function statusLabel(status: ProgressStatus): string {
  switch (status) {
    case "improved": return "Improved";
    case "needs_support": return "Needs Support";
    case "maintained": return "Maintained";
    default: return "No Data";
  }
}

/**
 * Split an academic year date range into 3 equal terms (calendar-day based).
 * Returns half-open ranges [start, end] (inclusive on both ends since we compare
 * against `date_evaluated` dates).
 */
export function computeTerms(startISO: string, endISO: string): Array<{ term: number; label: string; start: string; end: string }> {
  const start = new Date(startISO + "T00:00:00Z").getTime();
  const end = new Date(endISO + "T00:00:00Z").getTime();
  const span = Math.max(1, end - start);
  const third = Math.floor(span / 3);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return [
    { term: 1, label: "Term 1", start: iso(start),               end: iso(start + third - 86400000) },
    { term: 2, label: "Term 2", start: iso(start + third),       end: iso(start + 2 * third - 86400000) },
    { term: 3, label: "Term 3", start: iso(start + 2 * third),   end: iso(end) },
  ];
}

/** Pick earliest (baseline) and latest (current) assessment rows within a range. */
export function pickBaselineAndCurrent<T extends { date_evaluated: string }>(rows: T[]): { baseline: T | null; current: T | null } {
  if (!rows.length) return { baseline: null, current: null };
  const sorted = [...rows].sort((a, b) => a.date_evaluated.localeCompare(b.date_evaluated));
  return {
    baseline: sorted[0],
    current: sorted[sorted.length - 1],
  };
}

export function buildComparisonRows(baseline: any | null, current: any | null): DomainComparisonRow[] {
  return KSPK_DOMAINS.map((d) => {
    const b = baseline ? readDomainScore(baseline, d.code) : null;
    const c = current  ? readDomainScore(current,  d.code) : null;
    const delta = b !== null && c !== null ? Number((c - b).toFixed(2)) : null;
    return {
      code: d.code,
      name: d.name,
      baseline: b,
      current: c,
      delta,
      status: statusForDelta(delta),
    };
  });
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "no_year" | "no_term" | "no_baseline" | "no_current" | "single_assessment"; message: string };

export function validateForGeneration(params: {
  yearId: string | null;
  termLabel: string | null;
  baseline: { id: string } | null;
  current: { id: string } | null;
}): ValidationResult {
  if (!params.yearId) return { ok: false, reason: "no_year", message: "Select an Academic Year before generating the booklet." };
  if (!params.termLabel) return { ok: false, reason: "no_term", message: "Select a Term before generating the booklet." };
  if (!params.baseline) return { ok: false, reason: "no_baseline", message: "No Baseline Assessment recorded for the selected term. Complete an assessment in the Assessment Module first." };
  if (!params.current)  return { ok: false, reason: "no_current",  message: "No Current Assessment recorded for the selected term. Complete a follow-up assessment before generating the booklet." };
  if (params.baseline.id === params.current.id) {
    return { ok: false, reason: "single_assessment", message: "Only one assessment exists in this term. A second assessment is required so progress can be compared." };
  }
  return { ok: true };
}