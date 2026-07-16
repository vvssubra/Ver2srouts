import { useState } from "react";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Building2, TrendingUp, Landmark } from "lucide-react";

export default function RoyaltyDashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // All branches
  const { data: branches = [] } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Revenue per branch for selected month
  const { data: branchRevenues = [] } = useQuery({
    queryKey: ["branch-revenues", month, year],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("branch_id, total_amount")
        .eq("status", "paid")
        .eq("billing_month", month)
        .eq("billing_year", year);

      const map: Record<string, number> = {};
      (data ?? []).forEach((inv) => {
        map[inv.branch_id] = (map[inv.branch_id] || 0) + Number(inv.total_amount);
      });
      return Object.entries(map).map(([branch_id, revenue]) => ({
        branch_id,
        revenue,
        royalty: revenue * 0.08,
      }));
    },
  });

  const revenueMap = Object.fromEntries(branchRevenues.map((r) => [r.branch_id, r]));
  const totalRevenue = branchRevenues.reduce((s, r) => s + r.revenue, 0);
  const totalRoyalty = branchRevenues.reduce((s, r) => s + r.royalty, 0);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">HQ Royalty Dashboard</h1>
            <p className="text-muted-foreground">Network-wide branch royalty overview</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 1, year, year + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2"><TrendingUp className="h-4 w-4 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Network Revenue</p>
                  <p className="text-xl font-bold">RM {totalRevenue.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-500/10 p-2"><Landmark className="h-4 w-4 text-violet-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Royalties Due (8%)</p>
                  <p className="text-xl font-bold">RM {totalRoyalty.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2"><Building2 className="h-4 w-4 text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Branches</p>
                  <p className="text-xl font-bold">{branches.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Branch Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Royalty Breakdown</CardTitle>
            <CardDescription>{months[month - 1]} {year}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch Name</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead className="text-right">Royalty Due (8%)</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No branches</TableCell></TableRow>
                ) : branches.map((b: any) => {
                  const rev = revenueMap[b.id];
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        RM {(rev?.revenue ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        RM {(rev?.royalty ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={rev?.revenue ? "bg-amber-500/10 text-amber-600 border-amber-200" : "bg-muted text-muted-foreground"}>
                          {rev?.revenue ? "Pending" : "No revenue"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
