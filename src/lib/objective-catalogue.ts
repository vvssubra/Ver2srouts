/**
 * Objective Catalogue helpers (Batch 6B-1)
 *
 * These helpers wrap the new additive tables `curriculum_objectives` and
 * `curriculum_objective_indicators`. They are intentionally read-only/
 * lookup-style: this batch is foundation + admin UI only. The Parent
 * Progress Wheel, NewUpdateSheet typeahead, AI lesson planner and
 * child_skill_progress rollup are NOT switched to this catalogue yet —
 * that work lands in 6B-3.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CatalogueObjective = {
  id: string;
  age_profile_id: string;
  domain_id: string;
  objective_code: string;
  parent_title: string;
  parent_description: string | null;
  teacher_title: string;
  teacher_description: string | null;
  observable_evidence: string[];
  level: string | null;
  recommended_term: string | null;
  objective_type: "core" | "emerging" | "extension";
  parent_visible: boolean;
  source: "sprouts" | "kspk_aligned" | "school_custom";
  is_active: boolean;
  sort_order: number;
};

export type CatalogueIndicator = {
  id: string;
  objective_id: string;
  indicator_label: string;
  evidence_example: string | null;
  observation_prompt: string | null;
  proficiency_levels: string[];
  is_active: boolean;
  sort_order: number;
};

export function useCatalogueDomains() {
  return useQuery({
    queryKey: ["catalogue-domains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("development_domains")
        .select("id, code, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCatalogueAgeProfiles() {
  return useQuery({
    queryKey: ["catalogue-age-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("age_profiles")
        .select("id, age_group, stage_name")
        .order("age_group");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCatalogueObjectives(ageProfileId: string | null) {
  return useQuery({
    queryKey: ["catalogue-objectives", ageProfileId],
    enabled: !!ageProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("curriculum_objectives")
        .select("*")
        .eq("age_profile_id", ageProfileId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CatalogueObjective[];
    },
  });
}

export function useCatalogueIndicators(objectiveIds: string[]) {
  const key = objectiveIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["catalogue-indicators", key],
    enabled: objectiveIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("curriculum_objective_indicators")
        .select("*")
        .in("objective_id", objectiveIds)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CatalogueIndicator[];
    },
  });
}

/**
 * Batch 6B-3 — Parent Progress denominator helper.
 *
 * Returns the per-domain count of active, parent-visible curriculum
 * objectives for the given age profile. Callers should prefer these
 * counts as the Progress Wheel denominator and fall back to the legacy
 * `development_outcomes` count when this returns no rows (catalogue not
 * seeded yet for that age).
 */
export function useCatalogueDomainTotals(ageProfileId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalogue-domain-totals", ageProfileId],
    enabled: !!ageProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("curriculum_objectives")
        .select("id, domain_id, parent_visible, is_active")
        .eq("age_profile_id", ageProfileId)
        .eq("is_active", true)
        .eq("parent_visible", true);
      if (error) throw error;
      const byDomain = new Map<string, number>();
      for (const row of (data ?? []) as { domain_id: string }[]) {
        byDomain.set(row.domain_id, (byDomain.get(row.domain_id) ?? 0) + 1);
      }
      return {
        byDomain,
        total: (data ?? []).length,
        hasCatalogue: (data ?? []).length > 0,
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Indicators flattened for the Learning Journey typeahead. Returns
 * indicator rows joined to their parent objective so we can suggest
 * catalogue-linked skills first, with domain + objective wording for
 * grouping. Falls back to empty list when catalogue is not seeded.
 */
export function useCatalogueIndicatorsForAge(ageProfileId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalogue-indicators-for-age", ageProfileId],
    enabled: !!ageProfileId,
    queryFn: async () => {
      const { data: objectives, error: oErr } = await (supabase as any)
        .from("curriculum_objectives")
        .select("id, domain_id, teacher_title, parent_title, parent_visible, is_active")
        .eq("age_profile_id", ageProfileId)
        .eq("is_active", true);
      if (oErr) throw oErr;
      const objs = (objectives ?? []) as Array<{
        id: string; domain_id: string; teacher_title: string; parent_title: string;
      }>;
      if (!objs.length) return [] as Array<{
        id: string; domain_id: string; objective_id: string;
        indicator_label: string; teacher_title: string; parent_title: string;
      }>;
      const { data: inds, error: iErr } = await (supabase as any)
        .from("curriculum_objective_indicators")
        .select("id, objective_id, indicator_label, is_active, sort_order")
        .in("objective_id", objs.map((o) => o.id))
        .eq("is_active", true)
        .order("sort_order");
      if (iErr) throw iErr;
      const objById = new Map(objs.map((o) => [o.id, o]));
      return ((inds ?? []) as Array<{ id: string; objective_id: string; indicator_label: string }>)
        .map((row) => {
          const obj = objById.get(row.objective_id);
          if (!obj) return null;
          return {
            id: row.id,
            domain_id: obj.domain_id,
            objective_id: obj.id,
            indicator_label: row.indicator_label,
            teacher_title: obj.teacher_title,
            parent_title: obj.parent_title,
          };
        })
        .filter(Boolean) as Array<{
          id: string; domain_id: string; objective_id: string;
          indicator_label: string; teacher_title: string; parent_title: string;
        }>;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Readiness summary used by the admin Catalogue UI and Foundation tile. */
export function summarizeCatalogue(
  objectives: CatalogueObjective[],
  indicators: CatalogueIndicator[],
  domains: { id: string; code: string; name: string }[],
) {
  const objByDomain = new Map<string, CatalogueObjective[]>();
  for (const o of objectives) {
    if (!o.is_active) continue;
    const arr = objByDomain.get(o.domain_id) ?? [];
    arr.push(o);
    objByDomain.set(o.domain_id, arr);
  }
  const indByObj = new Map<string, CatalogueIndicator[]>();
  for (const i of indicators) {
    const arr = indByObj.get(i.objective_id) ?? [];
    arr.push(i);
    indByObj.set(i.objective_id, arr);
  }
  const counts = domains.map((d) => ({
    domain: d,
    objectives: (objByDomain.get(d.id) ?? []).length,
  }));
  const max = counts.reduce((m, c) => Math.max(m, c.objectives), 0);
  const missingDomains = counts.filter((c) => c.objectives === 0).map((c) => c.domain);
  const lowDomains = counts.filter((c) => max > 0 && c.objectives > 0 && c.objectives < Math.max(1, Math.ceil(max / 3))).map((c) => c.domain);
  const objectivesWithoutIndicator = objectives.filter((o) => o.is_active && !(indByObj.get(o.id)?.length)).length;
  const objectivesMissingParentWording = objectives.filter((o) => o.is_active && (!o.parent_title || !o.parent_description)).length;
  return {
    counts,
    missingDomains,
    lowDomains,
    objectivesWithoutIndicator,
    objectivesMissingParentWording,
    totalActive: objectives.filter((o) => o.is_active).length,
    indicatorsByObjective: indByObj,
  };
}

/**
 * Batch 6B-5 — Parent-friendly objective wording lookup.
 *
 * Given a set of curriculum_objective IDs (from mapped Learning Journey
 * skill rows), fetch the parent_title / parent_description so the Parent
 * Progress detail panel can show warm parent-facing wording instead of
 * raw teacher labels. Returns a Map keyed by objective id.
 */
export function useCatalogueObjectivesByIds(ids: (string | null | undefined)[]) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean) as string[])).sort();
  const key = cleanIds.join(",");
  return useQuery({
    queryKey: ["catalogue-objectives-by-ids", key],
    enabled: cleanIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("curriculum_objectives")
        .select("id, parent_title, parent_description, teacher_title, parent_visible, is_active")
        .in("id", cleanIds);
      if (error) throw error;
      const map = new Map<string, {
        id: string;
        parent_title: string | null;
        parent_description: string | null;
        teacher_title: string | null;
        parent_visible: boolean;
        is_active: boolean;
      }>();
      for (const row of (data ?? [])) map.set(row.id, row);
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Batch 6B-5 — Safe historical backfill DRY-RUN.
 *
 * Reads (but never writes) child_update_skills rows whose
 * curriculum_objective_id is NULL and attempts exact, normalized label
 * matching against the active catalogue indicators (and, secondarily,
 * objective titles) for the given age profile.
 *
 * Returns counts only — no rows are updated. Used by the admin
 * "Historical mapping readiness" diagnostic.
 */
export type BackfillDryRun = {
  totalUnmapped: number;
  exactMatches: number;
  ambiguousMatches: number;
  noMatches: number;
  matchRateByAge: Record<string, { matched: number; total: number }>;
  matchRateByDomain: Record<string, { matched: number; total: number }>;
  topUnmatchedLabels: Array<{ label: string; count: number }>;
  sampleAmbiguousLabels: Array<{ label: string; candidates: number }>;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]+/g, "").trim();

export function useCatalogueBackfillDryRun(ageProfileId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalogue-backfill-dryrun", ageProfileId ?? "all"],
    enabled: !!ageProfileId,
    queryFn: async (): Promise<BackfillDryRun> => {
      const sb = supabase as any;

      // 1. Catalogue for this age (objective + indicator labels).
      const { data: objs } = await sb
        .from("curriculum_objectives")
        .select("id, domain_id, age_profile_id, parent_title, teacher_title, is_active")
        .eq("age_profile_id", ageProfileId)
        .eq("is_active", true);
      const objList = (objs ?? []) as Array<{
        id: string; domain_id: string; age_profile_id: string;
        parent_title: string | null; teacher_title: string | null;
      }>;
      const objIds = objList.map((o) => o.id);

      const { data: inds } = objIds.length
        ? await sb
            .from("curriculum_objective_indicators")
            .select("id, objective_id, indicator_label, is_active")
            .in("objective_id", objIds)
            .eq("is_active", true)
        : { data: [] as any[] };
      const indList = (inds ?? []) as Array<{ id: string; objective_id: string; indicator_label: string }>;

      // Build label → [{objectiveId}] index. Exact-normalized match only.
      const labelToObjectives = new Map<string, Set<string>>();
      const addLabel = (label: string, objId: string) => {
        const k = norm(label);
        if (!k) return;
        const set = labelToObjectives.get(k) ?? new Set<string>();
        set.add(objId);
        labelToObjectives.set(k, set);
      };
      for (const i of indList) addLabel(i.indicator_label, i.objective_id);
      for (const o of objList) {
        addLabel(o.parent_title ?? "", o.id);
        addLabel(o.teacher_title ?? "", o.id);
      }

      // 2. Pull unmapped child_update_skills rows. Scope by domain to keep payload small.
      const domainIds = Array.from(new Set(objList.map((o) => o.domain_id)));
      if (!domainIds.length) {
        return {
          totalUnmapped: 0, exactMatches: 0, ambiguousMatches: 0, noMatches: 0,
          matchRateByAge: {}, matchRateByDomain: {},
          topUnmatchedLabels: [], sampleAmbiguousLabels: [],
        };
      }
      const { data: skills } = await sb
        .from("child_update_skills")
        .select("id, domain_id, indicator_label")
        .is("curriculum_objective_id", null)
        .in("domain_id", domainIds)
        .limit(5000);
      const rows = (skills ?? []) as Array<{ id: string; domain_id: string; indicator_label: string | null }>;

      let exact = 0, ambiguous = 0, none = 0;
      const byDomain: Record<string, { matched: number; total: number }> = {};
      const unmatchedCounts = new Map<string, number>();
      const ambiguousLabels = new Map<string, number>();

      for (const r of rows) {
        const k = norm(r.indicator_label);
        const bucket = (byDomain[r.domain_id] ||= { matched: 0, total: 0 });
        bucket.total++;
        const candidates = k ? labelToObjectives.get(k) : undefined;
        if (!candidates || candidates.size === 0) {
          none++;
          if (k) unmatchedCounts.set(k, (unmatchedCounts.get(k) ?? 0) + 1);
        } else if (candidates.size === 1) {
          exact++;
          bucket.matched++;
        } else {
          ambiguous++;
          ambiguousLabels.set(k, candidates.size);
        }
      }

      const topUnmatchedLabels = Array.from(unmatchedCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({ label, count }));
      const sampleAmbiguousLabels = Array.from(ambiguousLabels.entries())
        .slice(0, 10)
        .map(([label, candidates]) => ({ label, candidates }));

      return {
        totalUnmapped: rows.length,
        exactMatches: exact,
        ambiguousMatches: ambiguous,
        noMatches: none,
        matchRateByAge: { [ageProfileId!]: { matched: exact, total: rows.length } },
        matchRateByDomain: byDomain,
        topUnmatchedLabels,
        sampleAmbiguousLabels,
      };
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Future integration plan (NOT executed in 6B-1):
 * - Parent Progress denominator → switch from `development_outcomes` to
 *   active parent-visible `curriculum_objectives` per child age profile.
 * - NewUpdateSheet typeahead → suggest from `curriculum_objective_indicators`.
 * - AI lesson planner → inject objective + indicator JSON into context.
 * - child_skill_progress rollup → map indicator → objective via FK.
 */