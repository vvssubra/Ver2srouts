import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyUsers, getBranchManagerIds } from "@/lib/notify";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Plus, ArrowUpRight, ArrowDownLeft, Search, Filter, Pencil, Trash2, CalendarIcon, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const rm = (v: number) => `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

export default function AccountingTransactions() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/accounting/transactions");
  const isManager = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const isStaff = role === "admin" || role === "teacher";
  const canAccess = isManager || isStaff;
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [deletingTx, setDeletingTx] = useState<any>(null);

  const emptyForm = { account_id: "", type: "expense" as "income" | "expense", amount: "", description: "", transaction_date: format(new Date(), "yyyy-MM-dd"), notes: "" };
  const [form, setForm] = useState(emptyForm);

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
      const { data } = await supabase.from("accounts").select("*").eq("branch_id", branchId).eq("is_active", true).order("type").order("code");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", branchId, filterType, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, accounts(name, code, type)")
        .eq("branch_id", branchId)
        .order("transaction_date", { ascending: false })
        .limit(500);
      if (filterType !== "all") q = q.eq("type", filterType);
      if (dateFrom) q = q.gte("transaction_date", dateFrom);
      if (dateTo) q = q.lte("transaction_date", dateTo);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Pending items for manager approval
  const pendingItems = transactions.filter((t: any) => t.status === "pending_edit" || t.status === "pending_delete");
  const approvedItems = transactions.filter((t: any) => t.status === "approved" || !t.status);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("transactions").insert({
        branch_id: branchId, account_id: form.account_id, type: form.type,
        amount: parseFloat(form.amount), description: form.description,
        transaction_date: form.transaction_date, notes: form.notes || null,
        reference_type: "manual", created_by: user!.id,
        status: "approved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Transaction recorded" });
      // Notify managers
      if (branchId) {
        getBranchManagerIds(branchId).then((mgrIds) => {
          const filtered = mgrIds.filter((id) => id !== user?.id);
          if (filtered.length) notifyUsers(filtered, "New Transaction", `${form.type === "income" ? "Income" : "Expense"} of ${rm(parseFloat(form.amount))} recorded: ${form.description}`, "transaction", undefined, "/accounting/transactions");
        });
      }
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (isStaff) {
        // Staff: request edit approval
        const { error } = await supabase.from("transactions").update({
          status: "pending_edit",
          requested_by: user!.id,
          pending_data: {
            account_id: form.account_id, type: form.type,
            amount: parseFloat(form.amount), description: form.description,
            transaction_date: form.transaction_date, notes: form.notes || null,
          },
        }).eq("id", editingTx.id);
        if (error) throw error;
      } else {
        // Manager: direct edit
        const { error } = await supabase.from("transactions").update({
          account_id: form.account_id, type: form.type,
          amount: parseFloat(form.amount), description: form.description,
          transaction_date: form.transaction_date, notes: form.notes || null,
        }).eq("id", editingTx.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: isStaff ? "Edit request submitted for approval" : "Transaction updated" });
      // If staff submitted for approval, notify managers
      if (isStaff && branchId) {
        getBranchManagerIds(branchId).then((mgrIds) => {
          notifyUsers(mgrIds, "Transaction Edit Requested", `A staff member has requested to edit a transaction: ${form.description}`, "transaction", editingTx?.id, "/accounting/transactions");
        });
      }
      setEditingTx(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (tx: any) => {
      if (isStaff) {
        // Staff: request deletion approval
        const { error } = await supabase.from("transactions").update({
          status: "pending_delete",
          requested_by: user!.id,
        }).eq("id", tx.id);
        if (error) throw error;
      } else {
        // Manager: direct delete
        const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: user!.id, action: "delete_transaction", target_type: "transaction",
          target_id: tx.id, target_label: tx.description,
          metadata: { amount: tx.amount, type: tx.type, date: tx.transaction_date },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: isStaff ? "Deletion request submitted for approval" : "Transaction deleted" });
      if (isStaff && branchId && deletingTx) {
        getBranchManagerIds(branchId).then((mgrIds) => {
          notifyUsers(mgrIds, "Transaction Delete Requested", `A staff member has requested to delete a transaction: ${deletingTx.description}`, "transaction", deletingTx.id, "/accounting/transactions");
        });
      }
      setDeletingTx(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Manager approval mutations
  const approveMutation = useMutation({
    mutationFn: async (tx: any) => {
      if (tx.status === "pending_delete") {
        const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: user!.id, action: "approve_delete_transaction", target_type: "transaction",
          target_id: tx.id, target_label: tx.description,
          metadata: { amount: tx.amount, type: tx.type, requested_by: tx.requested_by },
        });
      } else if (tx.status === "pending_edit") {
        const pd = tx.pending_data as any;
        const { error } = await supabase.from("transactions").update({
          account_id: pd.account_id, type: pd.type,
          amount: pd.amount, description: pd.description,
          transaction_date: pd.transaction_date, notes: pd.notes,
          status: "approved", pending_data: null, requested_by: null,
        }).eq("id", tx.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          actor_id: user!.id, action: "approve_edit_transaction", target_type: "transaction",
          target_id: tx.id, target_label: tx.description,
          metadata: { pending_data: pd, requested_by: tx.requested_by },
        });
      }
    },
    onSuccess: (_: any, tx: any) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Request approved" });
      // Notify the requesting staff member
      if (tx.requested_by) {
        notifyUsers([tx.requested_by], "Transaction Request Approved", `Your ${tx.status === "pending_delete" ? "deletion" : "edit"} request for "${tx.description}" has been approved.`, "transaction", tx.id, "/accounting/transactions");
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (tx: any) => {
      const { error } = await supabase.from("transactions").update({
        status: "approved", pending_data: null, requested_by: null,
      }).eq("id", tx.id);
      if (error) throw error;
    },
    onSuccess: (_: any, tx: any) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Request rejected" });
      if (tx.requested_by) {
        notifyUsers([tx.requested_by], "Transaction Request Rejected", `Your ${tx.status === "pending_delete" ? "deletion" : "edit"} request for "${tx.description}" has been rejected.`, "transaction", tx.id, "/accounting/transactions");
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (tx: any) => {
    setEditingTx(tx);
    setForm({
      account_id: tx.account_id, type: tx.type, amount: String(tx.amount),
      description: tx.description || "", transaction_date: tx.transaction_date,
      notes: tx.notes || "",
    });
  };

  const filtered = approvedItems.filter((t: any) =>
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.accounts?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalIncome = approvedItems.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = approvedItems.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);

  const txFormFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any, account_id: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Account</Label>
        <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
          <SelectContent>
            {accounts.filter((a: any) => form.type === "income" ? a.type === "revenue" : a.type === "expense")
              .map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Amount (RM)</Label>
        <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );

  const renderStatusBadge = (tx: any) => {
    if (tx.status === "pending_edit") return <Badge variant="outline" className="text-xs border-amber-500 text-amber-600"><Clock className="h-3 w-3 mr-1" />Pending Edit</Badge>;
    if (tx.status === "pending_delete") return <Badge variant="outline" className="text-xs border-destructive text-destructive"><Clock className="h-3 w-3 mr-1" />Pending Delete</Badge>;
    return null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
            <p className="text-sm text-muted-foreground">Record and track income & expenses</p>
          </div>
          <div className="flex items-center gap-3">
            {canAccess && (
              <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setForm(emptyForm); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />Add Transaction</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
                  {txFormFields}
                  <DialogFooter>
                    <Button className="w-full" disabled={!form.account_id || !form.amount || !form.description} onClick={() => createMutation.mutate()}>
                      Save Transaction
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Pending Approvals — visible to managers */}
        {isManager && pendingItems.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending Approvals ({pendingItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map((t: any) => {
                    const pd = t.pending_data as any;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm">{format(new Date(t.transaction_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-sm font-medium">{t.description}</TableCell>
                        <TableCell>{renderStatusBadge(t)}</TableCell>
                        <TableCell className="text-right font-semibold">{rm(Number(t.amount))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.status === "pending_edit" && pd ? (
                            <span>New: {pd.description} — {rm(pd.amount)}</span>
                          ) : (
                            <span>Requested deletion</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary" onClick={() => approveMutation.mutate(t)} title="Approve">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => rejectMutation.mutate(t)} title="Reject">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-primary/60">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ArrowDownLeft className="h-4 w-4 text-primary" /> Total Income
              </div>
              <p className="text-2xl font-bold text-primary">{rm(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-destructive/60">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ArrowUpRight className="h-4 w-4 text-destructive" /> Total Expenses
              </div>
              <p className="text-2xl font-bold text-destructive">{rm(totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-foreground/30">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Net</div>
              <p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? "text-primary" : "text-destructive"}`}>
                {rm(totalIncome - totalExpense)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[140px]" placeholder="From" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[140px]" placeholder="To" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
            )}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canAccess && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                ) : (
                  filtered.map((t: any) => {
                    const isManual = t.reference_type === "manual";
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm">{format(new Date(t.transaction_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant={t.type === "income" ? "default" : "destructive"} className={t.type === "income" ? "bg-primary/15 text-primary hover:bg-primary/15" : ""}>
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{(t as any).accounts?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{t.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{t.reference_type ?? "manual"}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${t.type === "income" ? "text-primary" : "text-destructive"}`}>
                          {t.type === "income" ? "+" : "-"}{rm(Number(t.amount))}
                        </TableCell>
                        {canAccess && (
                          <TableCell>
                            {isManual ? (
                              <div className="flex gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)} title={isStaff ? "Request Edit" : "Edit"}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">{isStaff ? "Request Edit (requires approval)" : "Edit"}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingTx(t)} title={isStaff ? "Request Deletion" : "Delete"}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">{isStaff ? "Request Deletion (requires approval)" : "Delete"}</p></TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground cursor-help">Auto</span>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs">Auto-synced from {t.reference_type}. Cannot edit or delete.</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
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

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(o) => { if (!o) { setEditingTx(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isStaff ? "Request Edit" : "Edit Transaction"}</DialogTitle>
            <DialogDescription>
              {isStaff ? "Your changes will be submitted for manager approval before being applied." : "Update this manual transaction"}
            </DialogDescription>
          </DialogHeader>
          {txFormFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button disabled={!form.account_id || !form.amount || !form.description || editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? "Saving…" : isStaff ? "Submit for Approval" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTx} onOpenChange={(o) => { if (!o) setDeletingTx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isStaff ? "Request Deletion?" : "Delete Transaction?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isStaff
                ? `This will submit a deletion request for "${deletingTx?.description}" (${rm(Number(deletingTx?.amount ?? 0))}). A manager must approve before it is removed.`
                : `This will permanently remove "${deletingTx?.description}" (${rm(Number(deletingTx?.amount ?? 0))}). This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletingTx)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isStaff ? "Submit Request" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
