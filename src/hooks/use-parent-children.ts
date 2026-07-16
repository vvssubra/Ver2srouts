import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Shared parent → children query.
 *
 * Single canonical cache key so every parent surface (Home, Portfolio, PTM,
 * Albums, More sheet, School Documents) hits the same row in React Query
 * and stays consistent. Returns approved children only.
 *
 * The select intentionally covers the union of fields used across parent
 * pages so we never have to add a second query for one extra column.
 */
const PARENT_CHILDREN_SELECT =
  "id, student_id, status, students(id, first_name, last_name, gender, photo_url, branch_id, class_id, class_name, classes:class_id(id, class_name))";

export type ParentChild = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender?: string | null;
  photo_url?: string | null;
  branch_id?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  classes?: { id: string; class_name: string } | null;
};

export type ParentChildLink = {
  id: string;
  student_id: string;
  status: string;
  students: ParentChild | null;
};

export const PARENT_CHILDREN_QUERY_KEY = (userId: string | null | undefined) =>
  ["parent-children", userId] as const;

export function useParentChildren() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: PARENT_CHILDREN_QUERY_KEY(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_students")
        .select(PARENT_CHILDREN_SELECT)
        .eq("parent_id", user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as ParentChildLink[];
    },
  });

  const links = query.data ?? [];

  const derived = useMemo(() => {
    const approvedLinks = links.filter((l) => l.status === "approved");
    const children = approvedLinks
      .map((l) => l.students)
      .filter((s): s is ParentChild => !!s);
    const childIds = children.map((c) => c.id);
    const branchIds = Array.from(
      new Set(children.map((c) => c.branch_id).filter((v): v is string => !!v)),
    );
    const classIds = Array.from(
      new Set(children.map((c) => c.class_id).filter((v): v is string => !!v)),
    );
    return {
      links: approvedLinks,
      allLinks: links,
      children,
      firstChild: children[0],
      childIds,
      branchIds,
      classIds,
    };
  }, [links]);

  return {
    ...derived,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/**
 * Invalidate the shared parent-scoped queries after a mutation that could
 * affect what the parent app sees (e.g. acknowledging a document, paying
 * an invoice, booking a PTM). Intentionally narrow — does NOT touch chat
 * realtime queries.
 */
export function invalidateParentScope(qc: QueryClient, userId: string | null | undefined) {
  if (!userId) return;
  qc.invalidateQueries({ queryKey: PARENT_CHILDREN_QUERY_KEY(userId) });
  qc.invalidateQueries({ queryKey: ["parent-home-latest-story"] });
  qc.invalidateQueries({ queryKey: ["parent-fee-summary"] });
  qc.invalidateQueries({ queryKey: ["parent-school-docs"] });
  qc.invalidateQueries({ queryKey: ["parent-school-doc-acks"] });
  qc.invalidateQueries({ queryKey: ["my-ptm-bookings"] });
  qc.invalidateQueries({ queryKey: ["my-ptm-reports"] });
  qc.invalidateQueries({ queryKey: ["my-ptm-meetings"] });
}