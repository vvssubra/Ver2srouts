import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RefundsCreditsTab from "@/components/billing/RefundsCreditsTab";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function FinanceRefunds() {
  const { role } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();

  // Auto-select single branch
  const branchId = selectedBranch;
  const canManage = role === "super_admin" || role === "franchisee" || role === "admin";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Refunds & Credits</h1>
            <p className="text-sm text-muted-foreground">Manage credit notes, refunds, and student credits</p>
          </div>
        </div>
        {branchId ? (
          <RefundsCreditsTab branchId={branchId} canManage={canManage} />
        ) : (
          <p className="text-muted-foreground text-sm py-12 text-center">Please select a branch to view refunds & credits.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
