import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveExpectedStaff, ExpectedStaffResult } from "./expected-staff";

const EMPTY: ExpectedStaffResult = {
  rows: [],
  summary: {
    active: 0, expected: 0, clockedIn: 0, stillWorking: 0, completed: 0, late: 0,
    notClockedIn: 0, onLeave: 0, publicHoliday: 0, offDay: 0, resigned: 0, future: 0,
  },
};

export function useExpectedStaff(branchId: string | null | undefined, date: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`expected-staff-${branchId}-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance", filter: `branch_id=eq.${branchId}` },
        () => qc.invalidateQueries({ queryKey: ["expected-staff"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" },
        () => qc.invalidateQueries({ queryKey: ["expected-staff"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_profiles" },
        () => qc.invalidateQueries({ queryKey: ["expected-staff"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, date, qc]);

  return useQuery({
    queryKey: ["expected-staff", branchId, date],
    queryFn: async () => {
      if (!branchId) return EMPTY;
      return await resolveExpectedStaff({ branchId, date });
    },
    enabled: !!branchId && !!date,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
