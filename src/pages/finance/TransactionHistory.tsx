import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { LedgerTable } from "@/components/finance/LedgerTable";
import { LedgerFilters } from "@/components/finance/LedgerFilters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Download } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function TransactionHistory() {
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const branchIds = activeBranchIds;

  const { data: entries, isLoading } = useQuery({
    queryKey: ["billing-ledger", branchIds, typeFilter, dateFrom, dateTo],
    queryFn: async () => {
      if (branchIds.length === 0) return [];
      let query = supabase
        .from("billing_ledger")
        .select("*")
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (typeFilter !== "all") {
        query = query.eq("entry_type", typeFilter);
      }
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

      const { data } = await query;
      return data || [];
    },
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      (e.description || "").toLowerCase().includes(q) ||
      (e.reference_number || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const withBalance = useMemo(() => {
    if (!filtered) return [];
    const sorted = [...filtered].reverse();
    let balance = 0;
    const result = sorted.map((e) => {
      balance += (e.debit || 0) - (e.credit || 0);
      return { ...e, running_balance: balance };
    });
    return result.reverse();
  }, [filtered]);

  const handleExportCSV = () => {
    if (!withBalance.length) return;
    const headers = ["Date", "Type", "Description", "Reference", "Debit", "Credit", "Balance"];
    const rows = withBalance.map((e) => [
      e.created_at ? new Date(e.created_at).toLocaleDateString() : "",
      e.entry_type, e.description || "", e.reference_number || "",
      String(e.debit || 0), String(e.credit || 0), String(e.running_balance || 0),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `transaction-ledger.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transaction Ledger</h1>
            <p className="text-sm text-muted-foreground">Append-only financial activity log — every entry is permanent</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportCSV} disabled={!withBalance.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        <LedgerFilters
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          selectedBranch={selectedBranch}
          onBranchChange={(v) => {
setPage(1); }}
          typeFilter={typeFilter}
          onTypeChange={(v) => { setTypeFilter(v); setPage(1); }}
          branches={branches}
        />

        {/* Date Range Filter */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Date Range:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
            )}
          </div>
        </Card>

        <LedgerTable
          entries={withBalance}
          isLoading={isLoading}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </DashboardLayout>
  );
}