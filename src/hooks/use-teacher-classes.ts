import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Hook to get the class IDs a teacher is assigned to.
 * For non-teacher roles (admin/franchisee/super_admin), returns all branch classes.
 * Returns { teacherClassIds, isTeacher, isLoading }
 */
export function useTeacherClasses(branchId: string | undefined) {
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";

  const { data: membership } = useQuery({
    queryKey: ["my-membership", branchId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("assigned_class_ids")
        .eq("user_id", user!.id)
        .eq("branch_id", branchId!)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!branchId && isTeacher,
  });

  const assignedIds = (membership as any)?.assigned_class_ids as string[] | null;

  // If teacher has assigned classes, use them. Otherwise null = all classes
  const teacherClassIds = isTeacher && assignedIds && assignedIds.length > 0
    ? assignedIds
    : null; // null means "all classes" (no filtering)

  return {
    teacherClassIds,
    isTeacher,
    hasAssignment: isTeacher && !!assignedIds && assignedIds.length > 0,
  };
}
