import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Branch {
  id: string;
  name: string;
}

/**
 * Shared hook for fetching user-accessible branches.
 * Super admins see all active branches; other roles see only their memberships.
 */
export function useBranches() {
  const { user, role } = useAuth();

  const { data: branches, isLoading } = useQuery({
    queryKey: ["user-branches", user?.id, role],
    queryFn: async (): Promise<Branch[]> => {
      if (role === "super_admin") {
        const { data } = await supabase
          .from("branches")
          .select("id, name")
          .eq("is_active", true)
          .order("name");
        return (data || []) as Branch[];
      }
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return (data?.map((bm: any) => bm.branches).filter(Boolean) || []) as Branch[];
    },
    enabled: !!user,
  });

  return { branches: branches || [], isLoading };
}

/**
 * Given a selectedBranch filter value ("all" or a specific ID),
 * returns the resolved list of branch IDs to query against.
 * @deprecated Use useGlobalBranch().activeBranchIds instead
 */
export function useActiveBranchIds(selectedBranch: string) {
  const { branches } = useBranches();

  return useMemo(() => {
    if (selectedBranch !== "all") return [selectedBranch];
    return branches.map((b) => b.id);
  }, [selectedBranch, branches]);
}
