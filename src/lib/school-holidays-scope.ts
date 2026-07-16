import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the academic_year ids that belong to a branch. Used to scope
 * `school_holidays` queries so a branch never sees another branch's holidays.
 *
 * When a branch has no academic year configured we return a sentinel UUID so
 * callers can safely pass the result to `.in("academic_year_id", [...])` — an
 * empty array behaves inconsistently in PostgREST and can accidentally match
 * every row.
 */
export async function getBranchAcademicYearIds(
  branchId: string | null | undefined,
): Promise<string[]> {
  if (!branchId) return ["00000000-0000-0000-0000-000000000000"];
  const { data } = await supabase
    .from("academic_years")
    .select("id")
    .eq("branch_id", branchId);
  const ids = (data ?? []).map((y: any) => y.id as string);
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}