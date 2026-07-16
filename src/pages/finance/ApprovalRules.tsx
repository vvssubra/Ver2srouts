import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  APPROVAL_ACTION_TYPES,
  APPROVAL_ACTION_LABELS,
  type ApprovalActionType,
  type ApprovalRule,
  formatCurrency,
} from "@/lib/finance";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  franchisee: "Branch Manager",
  admin: "Admin",
};

export default function ApprovalRules({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);

  // Form state
  const [form, setForm] = useState({
    branch_id: "" as string,
    action_type: "payment_reversal" as ApprovalActionType,
    amount_threshold: "0",
    required_approver_role: "super_admin",
    requires_second_approval: false,
    second_approver_role: "",
    description: "",
  });

  const branchIds = selectedBranch === "all" ? branches.map((b) => b.id) : [selectedBranch];

  const { data: rules, isLoading } = useQuery({
    queryKey: ["approval-rules", branchIds],
    queryFn: async () => {
      const orClauses = branchIds.map((id) => `branch_id.eq.${id}`).join(",") + ",branch_id.is.null";
      const { data } = await supabase
        .from("approval_rules")
        .select("*")
        .or(orClauses)
        .eq("is_active", true)
        .order("action_type")
        .order("amount_threshold", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: branchIds.length > 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: Record<string, unknown>) => {
      if (editingRule) {
        const { error } = await supabase.from("approval_rules").update(rule as any).eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("approval_rules").insert(rule as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
      setDialogOpen(false);
      setEditingRule(null);
      toast({ title: editingRule ? "Rule updated" : "Rule created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("approval_rules").update({ is_active: false } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
      toast({ title: "Rule deactivated" });
    },
  });

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      branch_id: branches[0]?.id ?? "",
      action_type: "payment_reversal",
      amount_threshold: "0",
      required_approver_role: "super_admin",
      requires_second_approval: false,
      second_approver_role: "",
      description: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (rule: any) => {
    setEditingRule(rule);
    setForm({
      branch_id: rule.branch_id ?? "",
      action_type: rule.action_type,
      amount_threshold: String(rule.amount_threshold),
      required_approver_role: rule.required_approver_role,
      requires_second_approval: rule.requires_second_approval,
      second_approver_role: rule.second_approver_role ?? "",
      description: rule.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      branch_id: form.branch_id || null,
      action_type: form.action_type,
      amount_threshold: parseFloat(form.amount_threshold) || 0,
      required_approver_role: form.required_approver_role,
      requires_second_approval: form.requires_second_approval,
      second_approver_role: form.requires_second_approval ? form.second_approver_role || null : null,
      description: form.description || null,
      is_active: true,
      created_by: user!.id,
      updated_at: new Date().toISOString(),
    });
  };

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Approval Matrix
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure approval rules for controlled financial actions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Add Rule
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active Approval Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-6 text-center">Loading...</p>
            ) : !rules?.length ? (
              <div className="text-center py-12 space-y-2">
                <Shield className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm">No approval rules configured</p>
                <p className="text-xs text-muted-foreground">
                  Add rules to require approvals for sensitive financial actions
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action Type</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Approver</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule: any) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {APPROVAL_ACTION_LABELS[rule.action_type as ApprovalActionType] ?? rule.action_type}
                        </Badge>
                        {rule.description && (
                          <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {rule.amount_threshold > 0 ? `≥ ${formatCurrency(rule.amount_threshold)}` : "Any amount"}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{ROLE_LABELS[rule.required_approver_role] ?? rule.required_approver_role}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.requires_second_approval ? "default" : "secondary"} className="text-xs">
                          {rule.requires_second_approval ? "2-step" : "1-step"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rule.branch_id
                          ? branches.find((b) => b.id === rule.branch_id)?.name ?? "—"
                          : "Global"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(rule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Approval Rule" : "New Approval Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Action Type</Label>
                <Select value={form.action_type} onValueChange={(v) => setForm((f) => ({ ...f, action_type: v as ApprovalActionType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPROVAL_ACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{APPROVAL_ACTION_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount Threshold (RM)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.amount_threshold}
                  onChange={(e) => setForm((f) => ({ ...f, amount_threshold: e.target.value }))}
                  placeholder="0 = any amount"
                />
              </div>
            </div>

            <div>
              <Label>Branch</Label>
              <Select value={form.branch_id} onValueChange={(v) => setForm((f) => ({ ...f, branch_id: v === "__global__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (all branches)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Required Approver Role</Label>
              <Select value={form.required_approver_role} onValueChange={(v) => setForm((f) => ({ ...f, required_approver_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="franchisee">Branch Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.requires_second_approval}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requires_second_approval: v }))}
              />
              <Label>Require 2-step approval</Label>
            </div>

            {form.requires_second_approval && (
              <div>
                <Label>Second Approver Role</Label>
                <Select value={form.second_approver_role} onValueChange={(v) => setForm((f) => ({ ...f, second_approver_role: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="franchisee">Branch Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Reversals above RM500 need HQ approval"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
