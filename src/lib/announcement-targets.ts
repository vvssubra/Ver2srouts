// Pure helpers for resolving announcement audiences.
// Extracted from `src/pages/Announcements.tsx` so the target-audience logic
// (class list + recipient resolution) can be regression-tested in isolation.

export const DEFAULT_CLASS_OPTIONS = ["3 Tahun", "4 Tahun", "5 Tahun", "6 Tahun"];

export type TargetType =
  | "staff_all"
  | "staff_specific"
  | "parents_all"
  | "parents_class"
  | "parents_specific";

type MinimalUser = { id: string; email?: string | null };

// Minimal shape of the Supabase client we depend on. Kept structural so tests
// can supply a plain fake without pulling in @supabase/supabase-js.
export type ClassNameClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: any[] | null }> | {
        not: (col: string, op: string, val: any) => Promise<{ data: any[] | null }>;
      };
    };
  };
};

/**
 * Resolve the class list for the branch.
 *  - Source of truth: `public.classes` (branch-scoped).
 *  - Fallback: distinct non-null `students.class_name` when no classes are
 *    registered yet.
 *  - Never merges `branch_settings.class_names` — that field can hold stale
 *    legacy short codes and would surface phantom classes in the picker.
 */
export async function resolveBranchClassNames(
  supabase: any,
  branchId: string
): Promise<string[]> {
  const { data: classesRows } = await supabase
    .from("classes")
    .select("class_name")
    .eq("branch_id", branchId);
  let names = Array.from(
    new Set(((classesRows ?? []) as any[]).map((c) => c.class_name).filter(Boolean))
  ) as string[];
  if (names.length === 0) {
    const { data: studentRows } = await supabase
      .from("students")
      .select("class_name")
      .eq("branch_id", branchId)
      .not("class_name", "is", null);
    names = Array.from(
      new Set(((studentRows ?? []) as any[]).map((s) => s.class_name).filter(Boolean))
    ) as string[];
  }
  names.sort((a, b) => a.localeCompare(b));
  return names.length > 0 ? names : DEFAULT_CLASS_OPTIONS;
}

export type ResolveRecipientsInput = {
  targetType: TargetType;
  branchId: string;
  targetClass?: string;
  selectedParentIds?: string[];
  selectedStaffIds?: string[];
  branchStaff?: MinimalUser[];
  branchParents?: MinimalUser[];
};

/**
 * Resolve the set of user ids that should receive the announcement.
 * Deduplicated, order not guaranteed — callers should treat as a set.
 */
export async function resolveAnnouncementRecipients(
  supabase: any,
  input: ResolveRecipientsInput
): Promise<string[]> {
  const {
    targetType,
    branchId,
    targetClass,
    selectedParentIds = [],
    selectedStaffIds = [],
    branchStaff = [],
    branchParents = [],
  } = input;

  let ids: string[] = [];
  if (targetType === "staff_all") {
    ids = branchStaff.map((s) => s.id);
  } else if (targetType === "staff_specific") {
    ids = selectedStaffIds;
  } else if (targetType === "parents_all") {
    ids = branchParents.map((p) => p.id);
  } else if (targetType === "parents_specific") {
    ids = selectedParentIds;
  } else if (targetType === "parents_class" && targetClass) {
    const { data: classStudents } = await supabase
      .from("students")
      .select("id")
      .eq("branch_id", branchId)
      .eq("class_name", targetClass);
    const classStudentIds = ((classStudents ?? []) as any[])
      .map((s) => s.id)
      .filter(Boolean);
    if (classStudentIds.length > 0) {
      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", classStudentIds);
      ids = ((links ?? []) as any[]).map((l) => l.parent_id).filter(Boolean);
    }
  }
  return Array.from(new Set(ids.filter(Boolean)));
}