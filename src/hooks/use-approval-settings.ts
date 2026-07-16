import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovalConfig {
  claims_l2_enabled: boolean;
  claims_l2_threshold: number;
  leave_l2_enabled: boolean;
  ot_l2_enabled: boolean;
  use_reports_to: boolean;
  payroll_l2_enabled: boolean;
}

const DEFAULTS: ApprovalConfig = {
  claims_l2_enabled: true,
  claims_l2_threshold: 500,
  leave_l2_enabled: false,
  ot_l2_enabled: false,
  use_reports_to: true,
  payroll_l2_enabled: false,
};

export function useApprovalSettings(branchId: string | null) {
  return useQuery({
    queryKey: ["approval-settings-effective", branchId],
    queryFn: async (): Promise<ApprovalConfig> => {
      // Try branch override first
      if (branchId) {
        const { data: branchSettings } = await supabase
          .from("approval_settings")
          .select("*")
          .eq("branch_id", branchId)
          .maybeSingle();
        if (branchSettings) return branchSettings as ApprovalConfig;
      }
      // Fall back to global
      const { data: globalSettings } = await supabase
        .from("approval_settings")
        .select("*")
        .is("branch_id", null)
        .maybeSingle();
      if (globalSettings) return globalSettings as ApprovalConfig;
      return DEFAULTS;
    },
    enabled: true,
  });
}
