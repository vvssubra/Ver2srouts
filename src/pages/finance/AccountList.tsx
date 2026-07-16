import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/finance/constants";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Users, ChevronRight } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function AccountList() {
  const navigate = useNavigate();
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const [search, setSearch] = useState("");

  const branchIds = activeBranchIds;

  const { data: students, isLoading } = useQuery({
    queryKey: ["account-list", branchIds],
    queryFn: async () => {
      if (branchIds.length === 0) return [];
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_name, branch_id, is_active, branches(name)")
        .in("branch_id", branchIds)
        .order("first_name");
      if (!data || data.length === 0) return [];

      const studentIds = data.map((s) => s.id);
      const { data: invoices } = await supabase
        .from("invoices")
        .select("student_id, total_amount, amount_paid, status")
        .in("student_id", studentIds);

      const summaryMap: Record<string, { billed: number; paid: number; outstanding: number; invoiceCount: number }> = {};
      (invoices || []).forEach((inv: any) => {
        if (inv.status === "cancelled") return;
        if (!summaryMap[inv.student_id]) {
          summaryMap[inv.student_id] = { billed: 0, paid: 0, outstanding: 0, invoiceCount: 0 };
        }
        const s = summaryMap[inv.student_id];
        s.billed += inv.total_amount || 0;
        s.paid += inv.amount_paid || 0;
        s.outstanding += (inv.total_amount || 0) - (inv.amount_paid || 0);
        s.invoiceCount += 1;
      });

      return data.map((s: any) => ({
        ...s,
        summary: summaryMap[s.id] || { billed: 0, paid: 0, outstanding: 0, invoiceCount: 0 },
      }));
    },
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!students) return [];
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter((s: any) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.class_name?.toLowerCase().includes(q)
    );
  }, [students, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Accounts</h1>
          <p className="text-sm text-muted-foreground">View account statements and financial history per student</p>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search student name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Student</TableHead>
                <TableHead className="font-semibold">Class</TableHead>
                <TableHead className="font-semibold">Branch</TableHead>
                <TableHead className="font-semibold text-center">Invoices</TableHead>
                <TableHead className="font-semibold text-right">Total Billed</TableHead>
                <TableHead className="font-semibold text-right">Total Paid</TableHead>
                <TableHead className="font-semibold text-right">Outstanding</TableHead>
                <TableHead className="font-semibold w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading accounts...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-muted-foreground">No accounts found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s: any) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/finance/accounts/${s.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {s.first_name?.[0]}{s.last_name?.[0]}
                        </div>
                        {s.first_name} {s.last_name}
                        {!s.is_active && <Badge variant="outline" className="text-xs ml-1 text-muted-foreground">Inactive</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.class_name || "—"}</TableCell>
                    <TableCell className="text-sm">{s.branches?.name || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{s.summary.invoiceCount}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(s.summary.billed)}</TableCell>
                    <TableCell className="text-right text-sm text-success">{formatCurrency(s.summary.paid)}</TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${s.summary.outstanding > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {formatCurrency(s.summary.outstanding)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
  );
}
