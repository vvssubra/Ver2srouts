import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowRight, CreditCard, Search } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency, PAYMENT_METHODS } from "@/lib/finance/constants";
import { getUnallocatedPayments } from "@/lib/finance/allocation-service";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function UnallocatedPayments({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { branches } = useGlobalBranch();
  const activeBranchId = branches[0]?.id;
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["unallocated-payments", activeBranchId],
    queryFn: () => getUnallocatedPayments(activeBranchId!),
    enabled: !!activeBranchId,
  });

  const filtered = useMemo(() => {
    if (!payments) return [];
    return payments.filter((p) => {
      if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.payment_reference?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q) ||
          p.amount.toString().includes(q)
        );
      }
      return true;
    });
  }, [payments, methodFilter, search]);

  const totalUnallocated = filtered.reduce((s, p) => s + p.unallocated, 0);

  const content = (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unallocated Payments</h1>
          <p className="text-sm text-muted-foreground">
            Payments received but not yet fully allocated to invoices
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="bg-warning/5 border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pending Allocation</p>
                  <p className="text-lg font-bold text-warning">{filtered.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-destructive/5 border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Unallocated</p>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(totalUnallocated)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Queue Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold w-[130px]">Date</TableHead>
                <TableHead className="font-semibold w-[130px]">Method</TableHead>
                <TableHead className="font-semibold">Reference</TableHead>
                <TableHead className="font-semibold text-right w-[120px]">Total Amount</TableHead>
                <TableHead className="font-semibold text-right w-[120px]">Allocated</TableHead>
                <TableHead className="font-semibold text-right w-[120px]">Unallocated</TableHead>
                <TableHead className="font-semibold w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <CreditCard className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-muted-foreground">No unallocated payments</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} className="text-sm cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/finance/payments/${p.id}`)}>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(p.payment_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {PAYMENT_METHODS.find((m) => m.value === p.payment_method)?.label || p.payment_method}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.payment_reference || "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{formatCurrency(p.allocated)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-warning">{formatCurrency(p.unallocated)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        Allocate <ArrowRight className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
