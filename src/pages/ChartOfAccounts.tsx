import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const TYPES = ["revenue", "expense", "asset", "liability"];
const typeBadgeClass: Record<string, string> = {
  revenue: "bg-primary/15 text-primary hover:bg-primary/15",
  expense: "bg-destructive/15 text-destructive hover:bg-destructive/15",
  asset: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  liability: "bg-amber-100 text-amber-700 hover:bg-amber-100",
};

export default function ChartOfAccounts() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/accounting/accounts");
  const isAdmin = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "", type: "expense", category: "" });
  const [editingAcct, setEditingAcct] = useState<any>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "", type: "expense", category: "" });
  const [deletingAcct, setDeletingAcct] = useState<any>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const branchId = selectedBranch;

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").eq("branch_id", branchId).order("type").order("code");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").insert({
        branch_id: branchId, code: form.code, name: form.name, type: form.type, category: form.category || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Account created" });
      setDialogOpen(false);
      setForm({ code: "", name: "", type: "expense", category: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").update({
        code: editForm.code, name: editForm.name, category: editForm.category || null,
      }).eq("id", editingAcct.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Account updated" });
      setEditingAcct(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("accounts").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Account status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (acct: any) => {
      // Check if account has transactions
      const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", acct.id);
      if ((count ?? 0) > 0) {
        // Soft delete - deactivate
        const { error } = await supabase.from("accounts").update({ is_active: false }).eq("id", acct.id);
        if (error) throw error;
        return "deactivated";
      }
      const { error } = await supabase.from("accounts").delete().eq("id", acct.id);
      if (error) throw error;
      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: user!.id, action: "delete_account", target_type: "account",
        target_id: acct.id, target_label: `${acct.code} — ${acct.name}`,
        metadata: { type: acct.type, category: acct.category },
      });
      return "deleted";
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: result === "deactivated" ? "Account deactivated (has transactions)" : "Account deleted" });
      setDeletingAcct(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (a: any) => {
    setEditingAcct(a);
    setEditForm({ code: a.code, name: a.name, type: a.type, category: a.category || "" });
  };

  const filteredAccounts = accounts.filter((a: any) =>
    a.code.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = TYPES.map((t) => ({
    type: t,
    items: filteredAccounts.filter((a: any) => a.type === t),
  })).filter((g) => g.items.length > 0);

  const accountFormFields = (f: typeof form, setF: (v: typeof form) => void, showType = true) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Code</Label>
          <Input placeholder="e.g. 4100" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        </div>
        {showType ? (
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Input value={f.type} disabled className="capitalize" />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input placeholder="e.g. Tuition Fees" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Category (optional)</Label>
        <Input placeholder="e.g. salary, rent" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chart of Accounts</h1>
            <p className="text-sm text-muted-foreground">Manage your account categories</p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Account</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
                  {accountFormFields(form, setForm, true)}
                  <DialogFooter>
                    <Button className="w-full" disabled={!form.code || !form.name} onClick={() => createMutation.mutate()}>Create Account</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading accounts...</p>
        ) : filteredAccounts.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">{search ? "No accounts match your search." : "No accounts yet. Create your first account to get started."}</CardContent></Card>
        ) : (
          grouped.map((g) => (
            <Card key={g.type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg capitalize flex items-center gap-2">
                  {g.type}
                  <Badge variant="secondary" className="text-xs">{g.items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="w-[140px]">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((a: any) => (
                      <TableRow key={a.id} className={!a.is_active ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-sm font-medium">{a.code}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.category || "—"}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={a.is_active}
                                onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: a.id, is_active: checked })}
                              />
                              <span className="text-xs text-muted-foreground">{a.is_active ? "Active" : "Inactive"}</span>
                            </div>
                          ) : (
                            <Badge variant={a.is_active ? "default" : "secondary"} className={a.is_active ? typeBadgeClass[a.type] : ""}>
                              {a.is_active ? "Active" : "Inactive"}
                            </Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(a)} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {!a.is_system && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingAcct(a)} title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAcct} onOpenChange={(o) => { if (!o) setEditingAcct(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update account details</DialogDescription>
          </DialogHeader>
          {accountFormFields(editForm, setEditForm, false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAcct(null)}>Cancel</Button>
            <Button disabled={!editForm.code || !editForm.name || editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingAcct} onOpenChange={(o) => { if (!o) setDeletingAcct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              If "{deletingAcct?.code} — {deletingAcct?.name}" has existing transactions, it will be deactivated instead of permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deletingAcct)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
