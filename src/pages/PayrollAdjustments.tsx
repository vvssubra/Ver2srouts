import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import PayrollReminderBanner from "@/components/PayrollReminderBanner";
import { createManualAdjustment } from "@/lib/ot-service";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default function PayrollAdjustments() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = role === "super_admin";
  const isAdminOrAbove = role === "super_admin" || role === "admin";

  const [filter, setFilter] = useState("pending");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    staffId: "",
    branchId: "",
    sourceType: "manual_correction" as "manual_correction"|"additional_payment"|"deduction",
    amount: 0,
    reason: "",
    targetPayrollMonth: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"),
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ["payroll-adjustments", filter],
    queryFn: async () => {
      let q = supabase.from("payroll_adjustments").select("*").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data } = await q;
      const ids = [...new Set((data ?? []).map((r: any) => r.staff_id))];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, first_name, last_name").in("id", ids)
        : { data: [] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((r: any) => ({ ...r, staff: map.get(r.staff_id) }));
    },
    enabled: isAdminOrAbove,
  });

  const { data: settings } = useQuery({
    queryKey: ["reminder-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("reminder_settings").select("*").eq("kind", "ot_leave").maybeSingle();
      return data;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-for-adjustments"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "teacher", "admin"]);
      const ids = [...new Set((roles ?? []).map((r: any) => r.user_id))];
      if (!ids.length) return [];
      const [{ data: profiles }, { data: members }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name").in("id", ids),
        supabase.from("branch_memberships").select("user_id, branch_id").in("user_id", ids),
      ]);
      const branchMap = new Map((members ?? []).map((m: any) => [m.user_id, m.branch_id]));
      return (profiles ?? [])
        .map((p: any) => ({
          user_id: p.id,
          full_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.id,
          branch_id: branchMap.get(p.id) ?? null,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    enabled: isAdminOrAbove,
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payroll_adjustments")
        .update({ status: "approved", approved_by: user!.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Approved" }); qc.invalidateQueries({ queryKey: ["payroll-adjustments"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payroll_adjustments")
        .update({ status: "rejected", approved_by: user!.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Rejected" }); qc.invalidateQueries({ queryKey: ["payroll-adjustments"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const staffRow = staff.find((s: any) => s.user_id === createForm.staffId);
      if (!staffRow) throw new Error("Pick a staff member");
      if (!staffRow.branch_id) throw new Error("Selected staff has no branch assigned");
      const res = await createManualAdjustment({
        branchId: staffRow.branch_id,
        staffId: createForm.staffId,
        sourceType: createForm.sourceType,
        amount: createForm.amount,
        reason: createForm.reason,
        targetPayrollMonth: createForm.targetPayrollMonth,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "Adjustment created" });
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["payroll-adjustments"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveSettingsMut = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase
        .from("reminder_settings")
        .update({ ...patch, updated_by: user!.id })
        .eq("kind", "ot_leave");
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Reminder settings saved" }); qc.invalidateQueries({ queryKey: ["reminder-settings"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-warning/10 text-warning border-warning/25",
      approved: "bg-success/10 text-success border-success/25",
      included: "bg-info/10 text-info border-info/25",
      paid: "bg-success/20 text-success border-success/30",
      rejected: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return <Badge className={map[s] ?? ""}>{s}</Badge>;
  };

  if (!isAdminOrAbove) {
    return <DashboardLayout><p className="p-8 text-muted-foreground">Restricted.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PayrollReminderBanner />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payroll Adjustments</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Late OT, post-payroll cancellations, amendments, and manual corrections that flow into the next payroll.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>+ New Adjustment</Button>
        </div>

        <Tabs defaultValue="adjustments">
          <TabsList>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="reminders">Reminder Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="adjustments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">All Adjustments</CardTitle>
                <div className="flex gap-1 flex-wrap">
                  {["all","pending","approved","included","paid","rejected"].map((k) => (
                    <Button key={k} size="sm" variant={filter===k?"default":"outline"} onClick={() => setFilter(k)}>
                      {k.charAt(0).toUpperCase()+k.slice(1)}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {adjustments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No adjustments</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Target Payroll</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-32"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.staff?.first_name} {a.staff?.last_name}</TableCell>
                          <TableCell><Badge variant="outline">{a.source_type.replace(/_/g," ")}</Badge></TableCell>
                          <TableCell>{a.hours ?? "—"}</TableCell>
                          <TableCell>{Number(a.amount).toFixed(2)}</TableCell>
                          <TableCell>{a.target_payroll_month ? format(parseISO(a.target_payroll_month), "MMM yyyy") : "—"}</TableCell>
                          <TableCell className="max-w-[260px] truncate">{a.reason ?? "—"}</TableCell>
                          <TableCell>{statusBadge(a.status)}</TableCell>
                          <TableCell>
                            {a.status === "pending" && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => approveMut.mutate(a.id)}>Approve</Button>
                                <Button size="sm" variant="ghost" onClick={() => rejectMut.mutate(a.id)}>Reject</Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="reminders">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">OT & Leave Reminder Schedule</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Reminds all staff to update OT and Leave records. Sends both an in-app notification and an email.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {settings && (
                    <>
                      <div className="flex items-center justify-between">
                        <Label>Enabled</Label>
                        <Switch checked={settings.enabled} onCheckedChange={(v) => saveSettingsMut.mutate({ enabled: v })} />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Every (weeks)</Label>
                          <Input type="number" min={1} max={12} defaultValue={settings.frequency_weeks}
                            onBlur={(e) => saveSettingsMut.mutate({ frequency_weeks: Number(e.target.value) })} />
                        </div>
                        <div>
                          <Label>Day of week</Label>
                          <Select defaultValue={String(settings.day_of_week)} onValueChange={(v) => saveSettingsMut.mutate({ day_of_week: Number(v) })}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              {DAY_NAMES.map((n,i) => <SelectItem key={i} value={String(i)}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Time</Label>
                          <Input type="time" defaultValue={String(settings.time_of_day).slice(0,5)}
                            onBlur={(e) => saveSettingsMut.mutate({ time_of_day: e.target.value + ":00" })} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Last sent: {settings.last_sent_at ? format(new Date(settings.last_sent_at), "dd MMM yyyy HH:mm") : "Never"}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Payroll Adjustment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Staff</Label>
                <Select value={createForm.staffId} onValueChange={(v) => setCreateForm({...createForm, staffId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select staff"/></SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={createForm.sourceType} onValueChange={(v: any) => setCreateForm({...createForm, sourceType: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_correction">Manual correction</SelectItem>
                    <SelectItem value="additional_payment">Additional payment</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={createForm.amount}
                  onChange={(e) => setCreateForm({...createForm, amount: Number(e.target.value)})}/>
              </div>
              <div>
                <Label>Target Payroll Month (1st of month)</Label>
                <Input type="date" value={createForm.targetPayrollMonth}
                  onChange={(e) => setCreateForm({...createForm, targetPayrollMonth: e.target.value})}/>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea value={createForm.reason} onChange={(e) => setCreateForm({...createForm, reason: e.target.value})}/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}