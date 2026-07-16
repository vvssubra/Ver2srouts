import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Sparkles, Users } from "lucide-react";

interface Props { branchId: string }

type Scope = "branch" | "all";

export default function CustomLeaveTypesCard({ branchId }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", default_days: 0, paid: true, requires_attachment: false });
  const [scope, setScope] = useState<Scope>("branch");
  const [assignFor, setAssignFor] = useState<any | null>(null);
  const [assignDays, setAssignDays] = useState<number>(0);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, boolean>>({});
  const currentYear = new Date().getFullYear();

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["custom-leave-types-admin", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_leave_types" as any)
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const reset = () => {
    setForm({ code: "", name: "", default_days: 0, paid: true, requires_attachment: false });
    setScope("branch");
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const code = (form.code.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")).slice(0, 40);

      // Determine target branches
      let targetBranches: string[] = [branchId];
      if (scope === "all") {
        const { data: allBranches, error: bErr } = await supabase
          .from("branches")
          .select("id")
          .eq("is_active", true);
        if (bErr) throw bErr;
        targetBranches = (allBranches ?? []).map((b: any) => b.id);
        if (targetBranches.length === 0) targetBranches = [branchId];
      }

      let totalAssigned = 0;
      for (const bId of targetBranches) {
        // Insert (or skip if already exists for that branch+code)
        const { data: created, error: insErr } = await supabase
          .from("custom_leave_types" as any)
          .upsert({
            branch_id: bId,
            code,
            name: form.name.trim(),
            default_days: form.default_days,
            paid: form.paid,
            requires_attachment: form.requires_attachment,
            is_active: true,
          } as any, { onConflict: "branch_id,code" } as any)
          .select("id, branch_id")
          .single();
        if (insErr) throw insErr;

        // Auto-provision balances for every non-parent staff in this branch
        const { data: members } = await supabase
          .from("branch_memberships")
          .select("user_id")
          .eq("branch_id", bId);
        const userIds = [...new Set((members ?? []).map((m: any) => m.user_id))];
        if (userIds.length > 0) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", userIds);
          const parentIds = new Set((roles ?? []).filter((r: any) => r.role === "parent").map((r: any) => r.user_id));
          const staffIds = userIds.filter((u) => !parentIds.has(u));

          if (staffIds.length > 0) {
            const rows = staffIds.map((uid) => ({
              user_id: uid,
              branch_id: (created as any).branch_id,
              custom_leave_type_id: (created as any).id,
              year: currentYear,
              total: form.default_days,
              used: 0,
            }));
            const { error: balErr } = await supabase
              .from("custom_leave_balances" as any)
              .upsert(rows, { onConflict: "user_id,custom_leave_type_id,year", ignoreDuplicates: true } as any);
            if (balErr) throw balErr;
            totalAssigned += staffIds.length;
          }
        }
      }
      return { branches: targetBranches.length, staff: totalAssigned };
    },
    onSuccess: (res: any) => {
      toast({
        title: "Custom leave type added",
        description: `Provisioned for ${res?.staff ?? 0} staff across ${res?.branches ?? 1} branch(es).`,
      });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-types-admin", branchId] });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-types", branchId] });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-types"] });
      queryClient.invalidateQueries({ queryKey: ["my-custom-leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-balances"] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("custom_leave_types" as any).update({ is_active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-leave-types-admin", branchId] }),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_leave_types" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Removed" });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-types-admin", branchId] });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  // Branch staff list for bulk assignment
  const { data: branchStaff = [] } = useQuery({
    queryKey: ["branch-staff-for-leave-assign", branchId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .eq("branch_id", branchId);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids)
        .order("first_name");
      // exclude parents
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      const parentIds = new Set((roles ?? []).filter((r: any) => r.role === "parent").map((r: any) => r.user_id));
      return (profs ?? []).filter((p: any) => !parentIds.has(p.id));
    },
    enabled: !!branchId && !!assignFor,
  });

  // Existing balances for the type/year (to show who already has it)
  const { data: existingBalances = [] } = useQuery({
    queryKey: ["custom-leave-balances-by-type", assignFor?.id, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_leave_balances" as any)
        .select("user_id,total,used")
        .eq("custom_leave_type_id", assignFor!.id)
        .eq("year", currentYear);
      return (data ?? []) as any[];
    },
    enabled: !!assignFor?.id,
  });

  const openAssign = (t: any) => {
    setAssignFor(t);
    setAssignDays(t.default_days ?? 0);
    setSelectedUsers({});
  };

  const closeAssign = () => {
    setAssignFor(null);
    setSelectedUsers({});
  };

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) (branchStaff as any[]).forEach((s) => (next[s.id] = true));
    setSelectedUsers(next);
  };

  const assignedMap = new Map((existingBalances as any[]).map((b) => [b.user_id, b]));
  const selectedCount = Object.values(selectedUsers).filter(Boolean).length;

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!assignFor) return;
      const ids = Object.entries(selectedUsers).filter(([, v]) => v).map(([k]) => k);
      if (ids.length === 0) throw new Error("Select at least one employee");
      const { data, error } = await supabase.rpc("assign_custom_leave_balances" as any, {
        _type_id: assignFor.id,
        _branch_id: assignFor.branch_id ?? branchId,
        _year: currentYear,
        _user_ids: ids,
        _total: assignDays,
      });
      if (error) throw error;
      return (data as number) ?? ids.length;
    },
    onSuccess: (count) => {
      toast({ title: "Entitlements assigned", description: `${count} employee(s) updated.` });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-balances-by-type", assignFor?.id, currentYear] });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["my-custom-leave-balances"] });
      closeAssign();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Custom Leave Types</CardTitle>
          </div>
          <CardDescription>Add school-specific leave types like Birthday Leave, Study Leave, or Religious Leave.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Type</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (types as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom leave types yet. Click "Add Type" to create one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Default Days</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(types as any[]).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.code}</div>
                  </TableCell>
                  <TableCell>{t.default_days}</TableCell>
                  <TableCell>{t.paid ? <Badge variant="secondary">Paid</Badge> : <Badge variant="outline">Unpaid</Badge>}</TableCell>
                  <TableCell>{t.requires_attachment ? <Badge>Required</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Switch checked={t.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: t.id, is_active: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openAssign(t)} disabled={!t.is_active}>
                        <Users className="h-3.5 w-3.5 mr-1" /> Assign to Staff
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${t.name}"?`)) removeMut.mutate(t.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Leave Type</DialogTitle>
            <DialogDescription>
              Create a new leave category. It will be auto-assigned to all staff in the selected scope using the default days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-2">
              <Label>Apply To</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("branch")}
                  className={`text-left rounded-md border p-2 text-sm transition ${scope === "branch" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div className="font-medium">This Branch</div>
                  <div className="text-xs text-muted-foreground">Only staff in the current branch</div>
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`text-left rounded-md border p-2 text-sm transition ${scope === "all" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div className="font-medium">Whole Organization</div>
                  <div className="text-xs text-muted-foreground">All branches &amp; their staff</div>
                </button>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Birthday Leave" />
            </div>
            <div>
              <Label>Code (optional)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="birthday" />
            </div>
            <div>
              <Label>Default Days per Year</Label>
              <Input type="number" min={0} step="0.5" value={form.default_days} onChange={(e) => setForm({ ...form, default_days: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Paid Leave</Label>
                <p className="text-xs text-muted-foreground">Counts as paid time off</p>
              </div>
              <Switch checked={form.paid} onCheckedChange={(v) => setForm({ ...form, paid: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Requires Document</Label>
                <p className="text-xs text-muted-foreground">Staff must upload supporting proof</p>
              </div>
              <Switch checked={form.requires_attachment} onCheckedChange={(v) => setForm({ ...form, requires_attachment: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name.trim()}>
              {createMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk-assign dialog */}
      <Dialog open={!!assignFor} onOpenChange={(o) => { if (!o) closeAssign(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign "{assignFor?.name}" to Staff ({currentYear})</DialogTitle>
            <DialogDescription>
              Set the entitlement (days per year) for the selected employees. Existing balances will be updated; "Used" days are preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Entitled Days</Label>
                <Input
                  type="number" min={0}
                  value={assignDays}
                  onChange={(e) => setAssignDays(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id="select-all-staff"
                  checked={selectedCount > 0 && selectedCount === (branchStaff as any[]).length}
                  onCheckedChange={(c) => toggleAll(!!c)}
                />
                <Label htmlFor="select-all-staff" className="text-sm cursor-pointer">Select all</Label>
              </div>
            </div>

            <ScrollArea className="h-72 rounded-md border">
              <div className="divide-y">
                {(branchStaff as any[]).length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No staff found in this branch.</p>
                ) : (branchStaff as any[]).map((s) => {
                  const existing = assignedMap.get(s.id);
                  return (
                    <label key={s.id} className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-muted/40">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={!!selectedUsers[s.id]}
                          onCheckedChange={(c) => setSelectedUsers((prev) => ({ ...prev, [s.id]: !!c }))}
                        />
                        <div>
                          <div className="text-sm font-medium">{s.first_name} {s.last_name}</div>
                          <div className="text-xs text-muted-foreground">{s.email}</div>
                        </div>
                      </div>
                      {existing ? (
                        <Badge variant="secondary">Current: {existing.used}/{existing.total}</Badge>
                      ) : (
                        <Badge variant="outline">Not assigned</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">{selectedCount} of {(branchStaff as any[]).length} selected</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAssign}>Cancel</Button>
            <Button onClick={() => assignMut.mutate()} disabled={assignMut.isPending || selectedCount === 0}>
              {assignMut.isPending ? "Assigning…" : `Assign to ${selectedCount} staff`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}