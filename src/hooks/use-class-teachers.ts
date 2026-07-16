import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClassTeacher = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

/**
 * Returns a map of classId → teachers assigned to that class for the given branch.
 * Teacher = branch member whose user_roles row includes 'teacher' AND whose
 * assigned_class_ids includes the class.
 */
export function useClassTeachers(branchId: string | undefined) {
  return useQuery({
    queryKey: ["class-teachers", branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<Record<string, ClassTeacher[]>> => {
      const { data: members } = await supabase
        .from("branch_memberships")
        .select("user_id, assigned_class_ids")
        .eq("branch_id", branchId!);
      const rows = (members ?? []).filter((m: any) => Array.isArray(m.assigned_class_ids) && m.assigned_class_ids.length);
      if (rows.length === 0) return {};
      const userIds = rows.map((r: any) => r.user_id);
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", userIds),
      ]);
      const teacherIds = new Set((roles ?? []).filter((r: any) => r.role === "teacher").map((r: any) => r.user_id));
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const result: Record<string, ClassTeacher[]> = {};
      rows.forEach((m: any) => {
        if (!teacherIds.has(m.user_id)) return;
        const p: any = pmap.get(m.user_id) ?? {};
        const t: ClassTeacher = {
          user_id: m.user_id,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          avatar_url: p.avatar_url ?? null,
        };
        (m.assigned_class_ids as string[]).forEach((cid) => {
          (result[cid] ??= []).push(t);
        });
      });
      return result;
    },
  });
}

export function teacherInitials(t: ClassTeacher): string {
  return `${t.first_name?.[0] ?? ""}${t.last_name?.[0] ?? ""}`.trim() || "T";
}

export function teacherDisplayName(t: ClassTeacher): string {
  return `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Teacher";
}