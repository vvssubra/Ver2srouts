import { useState } from "react";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, TrendingDown, Users, Plus, FileText, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const EXPENSE_CATEGORIES = ["rent", "utilities", "supplies", "payroll", "other"];

export default function BranchFinancials() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/branch-financials");
  const isManager = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: "supplies", amount: "", date: format(new Date(), "yyyy-MM-dd"), description: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Get user's branch
  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const branchId = membership?.branch_id;
  const branchName = (membership?.branches as any)?.name ?? "My Branch";

  // Revenue from transactions (auto-synced from paid invoices + manual income)
  const { data: revenueTransactions = [] } = useQuery({
    queryKey: ["branch-revenue-tx", branchId, currentMonth, currentYear],
    queryFn: async () => {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const endDate = currentMonth === 12
        ? `${currentYear + 1}-01-01`
        : `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("transactions")
        .select("amount, reference_type")
        .eq("branch_id", branchId!)
        .eq("type", "income")
        .eq("status", "approved")
        .gte("transaction_date", startDate)
        .lt("transaction_date", endDate);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const revenue = revenueTransactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  // Expenses from transactions (auto-synced from expenses table + manual + refunds)
  const { data: expenseTransactions = [] } = useQuery({
    queryKey: ["branch-expense-tx", branchId, currentMonth, currentYear],
    queryFn: async () => {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
      const endDate = currentMonth === 12
        ? `${currentYear + 1}-01-01`
        : `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("transactions")
        .select("amount, reference_type, description, transaction_date, id")
        .eq("branch_id", branchId!)
        .eq("type", "expense")
        .eq("status", "approved")
        .gte("transaction_date", startDate)
        .lt("transaction_date", endDate)
        .order("transaction_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const totalExpenses = expenseTransactions.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const netProfit = revenue - totalExpenses;
  const royaltyDue = revenue * 0.08;

  // Active students count
  const { data: studentCount = 0 } = useQuery({
    queryKey: ["branch-student-count", branchId],
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId!)
        .eq("is_active", true);
      return count ?? 0;
    },
    enabled: !!branchId,
  });

  const costPerStudent = studentCount > 0 ? totalExpenses / studentCount : 0;

  // Invoices this month
  const { data: invoices = [] } = useQuery({
    queryKey: ["branch-invoices", branchId, currentMonth, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, students(first_name, last_name)")
        .eq("branch_id", branchId!)
        .eq("billing_month", currentMonth)
        .eq("billing_year", currentYear)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // LHDN compliance
  const invoicesWithUin = invoices.filter((i: any) => i.lhdn_uin).length;
  const compliancePercent = invoices.length > 0 ? Math.round((invoicesWithUin / invoices.length) * 100) : 100;

  // Add expense mutation
  const addExpense = useMutation({
    mutationFn: async () => {
      let receiptUrl = null;
      if (receiptFile) {
        const path = `${branchId}/${Date.now()}-${receiptFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("expense-receipts")
          .upload(path, receiptFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("expense-receipts").getPublicUrl(path);
        receiptUrl = urlData.publicUrl;
      }
      const { error } = await supabase.from("expenses").insert({
        branch_id: branchId!,
        category: expenseForm.category,
        amount: parseFloat(expenseForm.amount),
        date: expenseForm.date,
        description: expenseForm.description || null,
        receipt_url: receiptUrl,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense added");
      queryClient.invalidateQueries({ queryKey: ["branch-expense-tx"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setShowExpenseDialog(false);
      setExpenseForm({ category: "supplies", amount: "", date: format(new Date(), "yyyy-MM-dd"), description: "" });
      setReceiptFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      paid: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
      draft: "bg-muted text-muted-foreground",
      sent: "bg-blue-500/10 text-blue-600 border-blue-200",
      overdue: "bg-destructive/10 text-destructive border-destructive/20",
      cancelled: "bg-muted text-muted-foreground line-through",
    };
    return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{branchName} — Financial Dashboard</h1>
          <p className="text-muted-foreground">
            {format(now, "MMMM yyyy")} overview
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2"><DollarSign className="h-4 w-4 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-lg font-bold">RM {revenue.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-destructive/10 p-2"><TrendingDown className="h-4 w-4 text-destructive" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Expenses</p>
                  <p className="text-lg font-bold">RM {totalExpenses.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2"><TrendingUp className="h-4 w-4 text-primary" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Profit</p>
                  <p className={`text-lg font-bold ${netProfit < 0 ? "text-destructive" : ""}`}>
                    RM {netProfit.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2"><Users className="h-4 w-4 text-amber-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost / Student</p>
                  <p className="text-lg font-bold">RM {costPerStudent.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-500/10 p-2"><CreditCard className="h-4 w-4 text-violet-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Royalty (8%)</p>
                  <p className="text-lg font-bold">RM {royaltyDue.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Invoices */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Student Invoices</CardTitle>
                <CardDescription>{invoices.length} invoices this month</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No invoices</TableCell></TableRow>
                  ) : invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.students?.first_name} {inv.students?.last_name}</TableCell>
                      <TableCell>RM {Number(inv.total_amount).toFixed(2)}</TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell>
                        {inv.status !== "paid" && inv.status !== "cancelled" && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => toast.info("Billplz / FPX integration coming soon")}>
                            <CreditCard className="h-3 w-3 mr-1" /> Pay via Billplz / FPX
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* LHDN Compliance */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> LHDN e-Invoice Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="font-medium">{invoicesWithUin} / {invoices.length}</span>
                </div>
                <Progress value={compliancePercent} className="h-2" />
                {compliancePercent < 100 ? (
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{invoices.length - invoicesWithUin} invoices pending LHDN e-Invoice submission.</span>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 font-medium">✓ All invoices compliant</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Expenses */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Expenses</CardTitle>
                <Button size="sm" onClick={() => setShowExpenseDialog(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {expenseTransactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No expenses recorded</p>
                  ) : expenseTransactions.slice(0, 10).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(e.transaction_date), "dd MMM yyyy")}</p>
                      </div>
                      <span className="font-mono text-sm">RM {Number(e.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Log an operational cost for this branch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (RM)</Label>
              <Input type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div>
              <Label>Receipt (optional)</Label>
              <Input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
            <Button onClick={() => addExpense.mutate()} disabled={!expenseForm.amount || addExpense.isPending}>
              {addExpense.isPending ? "Saving..." : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
