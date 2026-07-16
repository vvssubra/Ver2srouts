import type { Json } from "@/integrations/supabase/types";

export type CompletenessBreakdown = {
  label: string;
  met: boolean;
}[];

export function calculateLessonCompleteness(plan: {
  monthly_plan_id?: string | null;
  weekly_plan_id?: string | null;
  objective_ids_json?: Json | null;
  domain_tags_json?: Json | null;
  routine_blocks_json?: Json | null;
  generated_plan?: Json | null;
  observation_targets_json?: Json | null;
  parent_story_prompt?: string | null;
  center_plan_json?: Json | null;
}): { score: number; breakdown: CompletenessBreakdown } {
  const checks: CompletenessBreakdown = [
    { label: "Linked to Monthly Plan", met: !!plan.monthly_plan_id },
    { label: "Linked to Weekly Plan", met: !!plan.weekly_plan_id },
    { label: "Objective Mapping", met: hasContent(plan.objective_ids_json) },
    { label: "Domain Tags", met: hasContent(plan.domain_tags_json) },
    { label: "Routine/Daily Structure", met: hasContent(plan.routine_blocks_json) },
    { label: "Activities & Materials", met: hasActivities(plan.generated_plan) },
    { label: "Observation Targets", met: hasContent(plan.observation_targets_json) },
    { label: "Differentiation", met: hasDifferentiation(plan.generated_plan) },
    { label: "Parent Story Prompt", met: !!plan.parent_story_prompt?.trim() },
    { label: "Center Plan", met: hasContent(plan.center_plan_json) },
  ];

  const met = checks.filter(c => c.met).length;
  const score = Math.round((met / checks.length) * 100);
  return { score, breakdown: checks };
}

function hasContent(json: Json | null | undefined): boolean {
  if (!json) return false;
  if (Array.isArray(json)) return json.length > 0;
  if (typeof json === "object") return Object.keys(json).length > 0;
  return false;
}

function hasActivities(plan: Json | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return false;
  const p = plan as Record<string, Json | undefined>;
  if (Array.isArray(p.days)) {
    return p.days.some((d: any) => Array.isArray(d?.activities) && d.activities.length > 0);
  }
  return false;
}

function hasDifferentiation(plan: Json | null | undefined): boolean {
  if (!plan || typeof plan !== "object") return false;
  const p = plan as Record<string, Json | undefined>;
  if (Array.isArray(p.days)) {
    return p.days.some((d: any) =>
      Array.isArray(d?.activities) &&
      d.activities.some((a: any) => a?.differentiation_strategies)
    );
  }
  return false;
}
