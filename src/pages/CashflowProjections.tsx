import DashboardLayout from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import CashflowProjectionsTab from "@/components/billing/CashflowProjectionsTab";

export default function CashflowProjections() {
  const { selectedBranchId: selectedBranch, activeBranchIds } = useGlobalBranch();
  const branchId = selectedBranch !== "all" ? selectedBranch : activeBranchIds[0] || "";

  const { data: allInvoices } = useQuery({
    queryKey: ["invoices-cashflow", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("*").eq("branch_id", branchId).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: studentFees } = useQuery({
    queryKey: ["student-fees-cashflow", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_fees")
        .select("*, fee_packages(name, amount, fee_type)")
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: allPayments } = useQuery({
    queryKey: ["all-payments-cashflow", branchId],
    queryFn: async () => {
      const { data: invs } = await supabase.from("invoices").select("id").eq("branch_id", branchId);
      if (!invs?.length) return [];
      const ids = invs.map((i: any) => i.id);
      const { data } = await supabase.from("payments").select("*").in("invoice_id", ids).order("payment_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cashflow & Projections</h1>
          <p className="text-muted-foreground">View cashflow trends and revenue projections</p>
        </div>

        <CashflowProjectionsTab
          allInvoices={allInvoices ?? []}
          studentFees={studentFees ?? []}
          allPayments={allPayments ?? []}
        />
      </div>
    </DashboardLayout>
  );
}
