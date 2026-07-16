import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rm = (v: number) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const currentYear = new Date().getFullYear();

export default function AccountingBudget() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/accounting/budget");
  const isAdmin = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ account_id: "", amount: "" });
  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [deletingBudget, setDeletingBudget] = useState<any>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const branchId = selectedBranch;

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").eq("branch_id", branchId).eq("is_active", true).order("code");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ["budgets", branchId, year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from("budgets")
        .select("*, accounts(name, code, type)")
        .eq("branch_id", branchId)
        .eq("year", year)
        .eq("month", month);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: actuals = [] } = useQuery({
    queryKey: ["actuals", branchId, year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("transactions")
        .select("account_id, amount")
        .eq("branch_id", branchId)
        .gte("transaction_date", startDate)
        .lt("transaction_date", endDate);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const actualsByAccount: Record<string, number> = {};
  actuals.forEach((t: any) => {
    actualsByAccount[t.account_id] = (actualsByAccount[t.account_id] || 0) + Number(t.amount);
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("budgets").upsert({
        branch_id: branchId,
        account_id: form.account_id,
        year,
        month,
        amount: parseFloat(form.amount),
      }, { onConflict: "branch_id,account_id,year,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: editingBudget ? "Budget updated" : "Budget saved" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (budget: any) => {
      const { error } = await supabase.from("budgets").delete().eq("id", budget.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: user!.id,
        action: "delete_budget",
        target_type: "budget",
        target_id: budget.id,
        target_label: `${(budget as any).accounts?.code} — ${(budget as any).accounts?.name}`,
        metadata: { amount: budget.amount, year, month },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({ title: "Budget deleted" });
      setDeletingBudget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingBudget(null);
    setForm({ account_id: "", amount: "" });
  };

  const startEdit = (b: any) => {
    setEditingBudget(b);
    setForm({ account_id: b.account_id, amount: String(b.amount) });
    setDialogOpen(true);
  };

  const totalBudget = budgets.reduce((s: number, b: any) => s + Number(b.amount), 0);
  const totalActual = budgets.reduce((s: number, b: any) => s + (actualsByAccount[b.account_id] || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Budget Management</h1>
            <p className="text-sm text-muted-foreground">Set and track monthly budgets by account</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[currentYear - 1, currentYear, currentYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />{editingBudget ? "Edit" : "Set"} Budget</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editingBudget ? "Edit" : "Set"} Budget for {MONTHS[month - 1]} {year}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Account</Label>
                      <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })} disabled={!!editingBudget}>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>{accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Budget Amount (RM)</Label>
                      <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <Button className="w-full" disabled={!form.account_id || !form.amount || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                      {saveMutation.isPending ? "Saving…" : editingBudget ? "Update Budget" : "Save"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Total Budget</p>
              <p className="text-2xl font-bold text-foreground">{rm(totalBudget)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Total Actual</p>
              <p className="text-2xl font-bold text-foreground">{rm(totalActual)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Utilization</p>
              <p className="text-2xl font-bold text-foreground">{totalBudget ? Math.round((totalActual / totalBudget) * 100) : 0}%</p>
              <Progress value={totalBudget ? Math.min((totalActual / totalBudget) * 100, 100) : 0} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Budget table */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Budget vs Actual — {MONTHS[month - 1]} {year}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="w-[120px]">Usage</TableHead>
                  {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">No budgets set for this period</TableCell></TableRow>
                ) : (
                  budgets.map((b: any) => {
                    const actual = actualsByAccount[b.account_id] || 0;
                    const variance = Number(b.amount) - actual;
                    const pct = Number(b.amount) ? Math.round((actual / Number(b.amount)) * 100) : 0;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{(b as any).accounts?.code} — {(b as any).accounts?.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">{(b as any).accounts?.type}</TableCell>
                        <TableCell className="text-right">{rm(Number(b.amount))}</TableCell>
                        <TableCell className="text-right">{rm(actual)}</TableCell>
                        <TableCell className={`text-right font-medium ${variance >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {variance >= 0 ? "+" : ""}{rm(variance)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(pct, 100)} className="flex-1" />
                            <span className={`text-xs font-medium ${pct > 100 ? "text-destructive" : "text-muted-foreground"}`}>{pct}%</span>
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(b)} title="Edit budget">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingBudget(b)} title="Delete budget">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Delete Budget Confirmation */}
      <AlertDialog open={!!deletingBudget} onOpenChange={(o) => { if (!o) setDeletingBudget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the {rm(Number(deletingBudget?.amount ?? 0))} budget for "{(deletingBudget as any)?.accounts?.code} — {(deletingBudget as any)?.accounts?.name}" in {MONTHS[month - 1]} {year}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletingBudget)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
