import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BranchTeacher = {
  user_id: string;
  membership_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  assigned_class_ids: string[];
};

/** All members of the branch whose user_roles row includes 'teacher'. */
export function useBranchTeachers(branchId: string | undefined) {
  return useQuery({
    queryKey: ["branch-teachers", branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<BranchTeacher[]> => {
      const { data: members } = await supabase
        .from("branch_memberships")
        .select("id, user_id, assigned_class_ids")
        .eq("branch_id", branchId!);
      const rows = members ?? [];
      if (rows.length === 0) return [];
      const userIds = rows.map((r: any) => r.user_id);
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", userIds),
      ]);
      const teacherIds = new Set((roles ?? []).filter((r: any) => r.role === "teacher").map((r: any) => r.user_id));
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows
        .filter((m: any) => teacherIds.has(m.user_id))
        .map((m: any) => {
          const p: any = pmap.get(m.user_id) ?? {};
          return {
            user_id: m.user_id,
            membership_id: m.id,
            first_name: p.first_name ?? null,
            last_name: p.last_name ?? null,
            avatar_url: p.avatar_url ?? null,
            assigned_class_ids: Array.isArray(m.assigned_class_ids) ? m.assigned_class_ids : [],
          };
        });
    },
  });
}