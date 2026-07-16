import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Plus, CheckCircle2, XCircle, Pencil, Ban, Edit3 } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import PayrollReminderBanner from "@/components/PayrollReminderBanner";
import {
  submitOt, editPendingOt, cancelPendingOt, requestAmendment, requestCancellation,
  approveOt, rejectOt, approveAmendment, approveCancellation,
  computePayrollMonth, OT_BLOCKED_MESSAGE,
} from "@/lib/ot-service";

/**
 * When staff request an amendment we insert a child row (status='amendment_requested')
 * that points to the original via parent_request_id. The user-facing list should show
 * only the amended row, not the original, while the amendment is pending.
 */
function hideSupersededByAmendment(rows: any[]): any[] {
  const supersededParentIds = new Set(
    rows
      .filter((r) => r?.status === "amendment_requested" && r?.parent_request_id)
      .map((r) => r.parent_request_id),
  );
  return rows.filter((r) => !supersededParentIds.has(r.id));
}

/**
 * Display OT hours with exact stored precision (up to 2 decimals, trailing
 * zeros trimmed). The OT Request module is the single source of truth for
 * approved hours, so this must match exactly what Payroll consumes — no
 * rounding to a single decimal.
 */
function formatHours(h: number | string | null | undefined): string {
  const n = Number(h ?? 0);
  if (!Number.isFinite(n)) return "0h";
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toString().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}h`;
}

export default function OvertimeRequests() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/overtime");
  const isAdmin = role === "admin";
  // Only HR (admin) and Super Admin can view/approve others' OT requests.
  // Franchisees see only their own OT, like regular staff.
  const isManager = (role === "super_admin" || isAdmin) && !isRestrictedAdmin;
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newOT, setNewOT] = useState({ date: format(new Date(), "yyyy-MM-dd"), start_time: "", end_time: "", reason: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: "", message: "" });
  const showError = (title: string, message: string) => setErrorDialog({ open: true, title, message });
  const [amendDialog, setAmendDialog] = useState<any>(null);
  const [amendValues, setAmendValues] = useState({ start_time: "", end_time: "", reason: "" });
  const [cancelDialog, setCancelDialog] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [myFilter, setMyFilter] = useState<string>("active");
  const [branchFilter, setBranchFilter] = useState<string>("active");

  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ["ot-branches"],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data } = await supabase.from("branches").select("id, name").order("name");
        return data ?? [];
      }
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(id, name)").eq("user_id", user!.id);
      return data?.map((m: any) => m.branches).filter(Boolean) ?? [];
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;

  // Fetch own OT requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ["my-ot-requests", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("overtime_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("date", { ascending: false });
      return hideSupersededByAmendment(data ?? []);
    },
    enabled: !!user,
  });

  // Fetch branch OT requests (admin)
  const { data: branchRequests = [] } = useQuery({
    queryKey: ["branch-ot-requests", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("overtime_requests")
        .select("*")
        .eq("branch_id", branchId)
        .order("date", { ascending: false });
      // Split-query pattern for profiles
      const visible = hideSupersededByAmendment(data ?? []);
      const userIds = [...new Set(visible.map((r: any) => r.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return visible.map((r: any) => ({ ...r, profiles: profileMap.get(r.user_id) || null }));
    },
    enabled: !!branchId && isManager,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!newOT.start_time || !newOT.end_time) throw new Error("Please fill start and end time");
      const startTs = new Date(`${newOT.date}T${newOT.start_time}:00`).toISOString();
      const endTs = new Date(`${newOT.date}T${newOT.end_time}:00`).toISOString();
      if (new Date(endTs).getTime() <= new Date(startTs).getTime()) {
        throw new Error("End time must be after start time");
      }
      const hours = Math.max(0, (new Date(endTs).getTime() - new Date(startTs).getTime()) / 3600000);
      if (editingId) {
        const res = await editPendingOt(editingId, {
          date: newOT.date,
          start_time: startTs,
          end_time: endTs,
          hours: Math.round(hours * 100) / 100,
          reason: newOT.reason || undefined,
        });
        if (!res.ok) throw new Error(res.error || "Failed to update");
      } else {
        const meta = (user!.user_metadata as any) || {};
        const requesterName = meta.first_name
          ? `${meta.first_name} ${meta.last_name ?? ""}`.trim()
          : (user!.email ?? "Staff");
        const res = await submitOt({
          userId: user!.id,
          branchId: branchId!,
          date: newOT.date,
          startTime: startTs,
          endTime: endTs,
          hours: Math.round(hours * 100) / 100,
          reason: newOT.reason || undefined,
          requesterName,
        });
        if (!res.ok) throw new Error(res.error || "Failed to submit");
        return res;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "OT request updated" : "OT request submitted" });
      queryClient.invalidateQueries({ queryKey: ["my-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["branch-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-ot-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      setShowNewDialog(false);
      setEditingId(null);
      setNewOT({ date: format(new Date(), "yyyy-MM-dd"), start_time: "", end_time: "", reason: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, row }: { id: string; status: string; row?: any }) => {
      // Branch out by row.status to support amendments / cancellations too.
      if (row?.status === "amendment_requested") {
        const res = status === "approved" ? await approveAmendment(id) : await rejectOt(id, reviewNotes || "Amendment rejected");
        if (!res.ok) throw new Error(res.error);
        return;
      }
      if (row?.status === "cancellation_requested") {
        const res = status === "approved" ? await approveCancellation(id) : await rejectOt(id, reviewNotes || "Cancellation rejected");
        if (!res.ok) throw new Error(res.error);
        return;
      }
      const res = status === "approved" ? await approveOt(id, reviewNotes || undefined) : await rejectOt(id, reviewNotes || "No reason provided");
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "OT request updated" });
      queryClient.invalidateQueries({ queryKey: ["branch-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-ot-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const amendMutation = useMutation({
    mutationFn: async () => {
      if (!amendDialog) return;
      const start = amendValues.start_time
        ? new Date(`${amendDialog.date}T${amendValues.start_time}:00`).toISOString()
        : undefined;
      const end = amendValues.end_time
        ? new Date(`${amendDialog.date}T${amendValues.end_time}:00`).toISOString()
        : undefined;
      const hours = start && end
        ? Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3600000)
        : undefined;
      const res = await requestAmendment(amendDialog.id, {
        start_time: start,
        end_time: end,
        hours,
        reason: amendValues.reason || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "Amendment requested" });
      setAmendDialog(null);
      queryClient.invalidateQueries({ queryKey: ["my-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["branch-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-ot-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!cancelDialog) return;
      if (!cancelReason.trim()) throw new Error("Please provide a cancellation reason");
      const res = await requestCancellation(cancelDialog.id, cancelReason);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "Cancellation requested" });
      setCancelDialog(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["my-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["branch-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-ot-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelPendingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await cancelPendingOt(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast({ title: "Request cancelled" });
      queryClient.invalidateQueries({ queryKey: ["my-ot-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-ot-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusBadge = (statusOrRow: any) => {
    const row: any = typeof statusOrRow === "string" ? { status: statusOrRow } : statusOrRow;
    const status: string = row.status;
    const isAmendment = !!row.parent_request_id;
    // Has the payroll cycle for this row reached the current month? (payroll processing begun)
    const payrollBegun = (() => {
      const ref = row.payroll_month ?? row.ot_month ?? row.date ?? null;
      if (!ref) return false;
      const d = parseISO(ref);
      const now = new Date();
      const refMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const currMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return refMonth <= currMonth;
    })();
    const map: Record<string, string> = {
      approved: "bg-success/10 text-success border-success/25",
      pending_payroll: "bg-success/10 text-success border-success/25",
      assigned_next_payroll: "bg-info/10 text-info border-info/25",
      paid: "bg-success/20 text-success border-success/30",
      rejected: "bg-destructive/10 text-destructive border-destructive/20",
      cancelled: "bg-muted text-muted-foreground border-border",
      cancellation_requested: "bg-warning/10 text-warning border-warning/25",
      amendment_requested: "bg-warning/10 text-warning border-warning/25",
      late_pending_approval: "bg-warning/10 text-warning border-warning/25",
    };
    const label: Record<string, string> = {
      approved: "Accepted",
      pending_payroll: "Accepted",
      assigned_next_payroll: "Accepted",
      paid: "Accepted",
      rejected: "Rejected",
      cancelled: "Cancelled",
      cancellation_requested: "Cancel Requested",
      amendment_requested: "Amended",
      late_pending_approval: "Late • Pending",
      pending_approval: "Pending",
      pending: "Pending",
    };
    if (isAmendment) {
      if (status === "amendment_requested") {
        return <Badge className="bg-warning/10 text-warning border-warning/25">Amended</Badge>;
      }
      if (["approved", "pending_payroll", "assigned_next_payroll"].includes(status)) {
        // Past payroll month → treat as Paid; current month → Pending Payroll;
        // future month → Amended Accepted (awaiting cycle).
        const ref = row.payroll_month ?? row.ot_month ?? row.date ?? null;
        if (ref) {
          const d = parseISO(ref);
          const now = new Date();
          const refM = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
          const curM = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          if (refM < curM) return <Badge className="bg-success/20 text-success border-success/30">Paid</Badge>;
          if (refM === curM) return <Badge className="bg-info/10 text-info border-info/25">Pending Payroll</Badge>;
        }
        return <Badge className="bg-success/10 text-success border-success/25">Amended Accepted</Badge>;
      }
    }
    const cls = map[status] ?? "bg-warning/10 text-warning border-warning/25";
    return <Badge className={cls}>{label[status] ?? status}</Badge>;
  };

  const paymentBadge = (r: any) => {
    if (r.status === "cancelled" || r.status === "rejected") {
      return <Badge variant="outline" className="border-muted-foreground/30">—</Badge>;
    }
    if (r.payment_status === "paid" || r.status === "paid") {
      return <Badge variant="outline" className="border-success/30 text-success">Paid</Badge>;
    }
    // Only the CURRENT payroll month should display "Pending Payroll".
    // Any approved OT whose payroll month is strictly before the current
    // calendar month is automatically shown as Paid (payroll cycle closed).
    if (["approved", "pending_payroll", "assigned_next_payroll"].includes(r.status)) {
      if (isPastPayrollMonth(r)) {
        return <Badge variant="outline" className="border-success/30 text-success">Paid</Badge>;
      }
      return <Badge variant="outline">Pending Payroll</Badge>;
    }
    return <Badge variant="outline">—</Badge>;
  };

  // Compare the row's payroll month against the current calendar month.
  const isPastPayrollMonth = (r: any) => {
    const ref = r.payroll_month ?? r.ot_month ?? r.date ?? null;
    if (!ref) return false;
    const d = parseISO(ref);
    const now = new Date();
    const refMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const currMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return refMonth < currMonth;
  };
  // A row counts as "Paid" when payroll has been processed OR when the
  // payroll month it belongs to has already passed (previous months are
  // treated as closed / paid automatically).
  const isPaidRow = (r: any) => {
    if (r.status === "paid" || r.payment_status === "paid") return true;
    if (["approved", "pending_payroll", "assigned_next_payroll"].includes(r.status)) {
      return isPastPayrollMonth(r);
    }
    return false;
  };
  const isPendingPayrollRow = (r: any) =>
    ["approved", "pending_payroll", "assigned_next_payroll"].includes(r.status) &&
    !isPaidRow(r);

  const filterRow = (r: any, f: string) => {
    if (f === "all") return true;
    if (f === "rejected") return r.status === "rejected";
    if (f === "paid") return isPaidRow(r);
    if (f === "active") {
      // Hide rejected, cancelled, and already-paid rows from the main list.
      if (r.status === "rejected" || r.status === "cancelled") return false;
      if (isPaidRow(r)) return false;
      return true;
    }
    if (f === "pending") return ["pending_approval", "pending", "late_pending_approval", "amendment_requested", "cancellation_requested"].includes(r.status);
    if (f === "late") return r.is_late_submission || r.status === "late_pending_approval";
    if (f === "pending_payroll") return isPendingPayrollRow(r);
    if (f === "approved") return r.status === "approved" && !isPaidRow(r) && !isPendingPayrollRow(r);
    if (f === "cancelled") return r.status === "cancelled";
    return true;
  };

  const monthLabel = (d?: string | null) => d ? format(parseISO(d), "MMM yyyy") : "—";

  // Allowed OT date range: [first of previous month .. last of next month]
  const today = new Date();
  const firstOfPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastOfNext = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const minOtDate = format(firstOfPrev, "yyyy-MM-dd");
  const maxOtDate = format(lastOfNext, "yyyy-MM-dd");
  const previewedComputed = newOT.date ? computePayrollMonth(new Date(newOT.date)) : null;

  const formatTime = (ts: string) => format(new Date(ts), "hh:mm a");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PayrollReminderBanner />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(location.state as any)?.from === "/staff-attendance" && (
              <Button variant="ghost" size="sm" onClick={() => nav("/staff-attendance")}>← Back</Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">Overtime Requests</h1>
              <p className="text-sm text-muted-foreground mt-1">Submit and manage overtime requests</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowNewDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> New OT Request
            </Button>
          </div>
        </div>

        <Tabs defaultValue={isManager ? "branch" : "my"}>
          <TabsList>
            {isManager && <TabsTrigger value="branch">Branch Requests</TabsTrigger>}
            <TabsTrigger value="my">My Requests</TabsTrigger>
          </TabsList>

          {isManager && (
            <TabsContent value="branch">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">Branch OT Requests</CardTitle>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      ["all","All"],["active","Active"],["pending","Pending"],["late","Late Submission"],
                      ["approved","Accepted"],["pending_payroll","Pending Payroll"],
                      ["paid","Paid"],["rejected","Rejected"],["cancelled","Cancelled"],
                    ].map(([k,l]) => (
                      <Button key={k} size="sm" variant={branchFilter===k?"default":"outline"} onClick={() => setBranchFilter(k as string)}>{l}</Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {branchRequests.filter((r:any)=>filterRow(r,branchFilter)).length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No overtime requests</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>OT Date</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>OT Month</TableHead>
                          <TableHead>Payroll Month</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Hours</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead className="w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchRequests.filter((r:any)=>filterRow(r,branchFilter)).map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <p className="font-medium text-foreground">{r.profiles?.first_name} {r.profiles?.last_name}</p>
                            </TableCell>
                            <TableCell>{format(parseISO(r.date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.submitted_at ? format(new Date(r.submitted_at), "dd MMM") : "—"}</TableCell>
                            <TableCell>{monthLabel(r.ot_month)}</TableCell>
                            <TableCell className={r.is_late_submission ? "font-medium text-warning" : ""}>{monthLabel(r.payroll_month)}</TableCell>
                            <TableCell>{formatTime(r.start_time)} – {formatTime(r.end_time)}</TableCell>
                            <TableCell>{formatHours(r.hours)}</TableCell>
                            <TableCell>{statusBadge(r)}</TableCell>
                            <TableCell>{paymentBadge(r)}</TableCell>
                            <TableCell>
                              {["pending_approval","pending","late_pending_approval","amendment_requested","cancellation_requested"].includes(r.status) && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="text-success" onClick={() => { setReviewDialog(r); setReviewNotes(""); }}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => reviewMutation.mutate({ id: r.id, status: "rejected", row: r })}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
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
          )}

          <TabsContent value="my">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">My OT Requests</CardTitle>
                <div className="flex gap-1 flex-wrap">
                  {[
                    ["all","All"],["active","Active"],["pending","Pending"],["late","Late Submission"],
                    ["approved","Accepted"],["pending_payroll","Pending Payroll"],
                    ["paid","Paid"],["rejected","Rejected"],["cancelled","Cancelled"],
                  ].map(([k,l]) => (
                    <Button key={k} size="sm" variant={myFilter===k?"default":"outline"} onClick={() => setMyFilter(k as string)}>{l}</Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {myRequests.filter((r:any)=>filterRow(r,myFilter)).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No overtime requests yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OT Date</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>OT Month</TableHead>
                        <TableHead>Payroll Month</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="w-32"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequests.filter((r:any)=>filterRow(r,myFilter)).map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>{format(parseISO(r.date), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.submitted_at ? format(new Date(r.submitted_at), "dd MMM") : "—"}</TableCell>
                          <TableCell>{monthLabel(r.ot_month)}</TableCell>
                          <TableCell className={r.is_late_submission ? "font-medium text-warning" : ""}>{monthLabel(r.payroll_month)}</TableCell>
                          <TableCell>{formatTime(r.start_time)} – {formatTime(r.end_time)}</TableCell>
                          <TableCell>{formatHours(r.hours)}</TableCell>
                          <TableCell>{statusBadge(r)}</TableCell>
                          <TableCell>{paymentBadge(r)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {["pending_approval","pending","late_pending_approval"].includes(r.status) && (
                                <>
                                  <Button
                                    size="icon"
                                variant="ghost"
                                title="Edit request"
                                onClick={() => {
                                  setEditingId(r.id);
                                  setNewOT({
                                    date: r.date,
                                    start_time: format(new Date(r.start_time), "HH:mm"),
                                    end_time: format(new Date(r.end_time), "HH:mm"),
                                    reason: r.reason ?? "",
                                  });
                                  setShowNewDialog(true);
                                }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" title="Cancel" onClick={() => cancelPendingMutation.mutate(r.id)}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {["approved","pending_payroll","assigned_next_payroll","paid"].includes(r.status) && (
                                <>
                                  <Button size="icon" variant="ghost" title="Request amendment" onClick={() => {
                                    setAmendDialog(r);
                                    setAmendValues({
                                      start_time: format(new Date(r.start_time), "HH:mm"),
                                      end_time: format(new Date(r.end_time), "HH:mm"),
                                      reason: r.reason ?? "",
                                    });
                                  }}>
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" title="Request cancellation" onClick={() => { setCancelDialog(r); setCancelReason(""); }}>
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New OT Request Dialog */}
        <Dialog open={showNewDialog} onOpenChange={(open) => {
          setShowNewDialog(open);
          if (open && !editingId) {
            setNewOT({ date: format(new Date(), "yyyy-MM-dd"), start_time: "", end_time: "", reason: "" });
          }
          if (!open) {
            setEditingId(null);
          }
        }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Overtime Request" : "New Overtime Request"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>OT Date</Label>
                <Input
                  type="date"
                  min={minOtDate}
                  max={maxOtDate}
                  value={newOT.date}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    const c = computePayrollMonth(new Date(next));
                    if (!c.is_allowed) {
                      showError("Outside submission period", OT_BLOCKED_MESSAGE);
                      return;
                    }
                    setNewOT({ ...newOT, date: next });
                  }}
                />
                {previewedComputed && (
                  <div className="mt-2 text-xs space-y-1">
                    <p className="text-muted-foreground">
                      <span className="font-medium">Payroll month:</span> {previewedComputed.payroll_month ? format(parseISO(previewedComputed.payroll_month), "MMM yyyy") : "—"}
                    </p>
                    {previewedComputed.is_late && (
                      <Badge className="bg-warning/10 text-warning border-warning/25">
                        Late submission — will be paid in next payroll
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={newOT.start_time}
                    onChange={(e) => setNewOT({ ...newOT, start_time: e.target.value })} />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={newOT.end_time}
                    onChange={(e) => setNewOT({ ...newOT, end_time: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                You may submit OT for the previous, current, or next month. Previous-month OT becomes a Late
                Submission only if that month's payroll has already been paid; otherwise it stays in the
                still-open previous payroll cycle.
              </p>
              {newOT.start_time && newOT.end_time && (
                (() => {
                  const diff = (new Date(`2000-01-01T${newOT.end_time}`).getTime() - new Date(`2000-01-01T${newOT.start_time}`).getTime()) / 3600000;
                  if (diff <= 0) {
                    return (
                      <p className="text-sm text-destructive">
                        End time must be after start time.
                      </p>
                    );
                  }
                  return (
                    <p className="text-sm text-muted-foreground">Hours: {formatHours(diff)}</p>
                  );
                })()
              )}
              <div><Label>Reason</Label><Textarea value={newOT.reason} onChange={(e) => setNewOT({ ...newOT, reason: e.target.value })} placeholder="Optional reason for overtime" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowNewDialog(false); setEditingId(null); }}>Cancel</Button>
              <Button onClick={() => {
                const c = computePayrollMonth(new Date(newOT.date));
                if (!c.is_allowed) { showError("Outside submission period", OT_BLOCKED_MESSAGE); return; }
                if (newOT.start_time && newOT.end_time && newOT.end_time <= newOT.start_time) {
                  showError("Invalid time range", "End time must be after the start time.");
                  return;
                }
                submitMutation.mutate();
              }} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? (editingId ? "Saving..." : "Submitting...") : (editingId ? "Save Changes" : "Submit Request")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Error dialog */}
        <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((s) => ({ ...s, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{errorDialog.title || "Invalid selection"}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{errorDialog.message}</p>
            <DialogFooter>
              <Button onClick={() => setErrorDialog((s) => ({ ...s, open: false }))}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && setReviewDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reviewDialog?.status === "amendment_requested" ? "Review Amendment Request"
                  : reviewDialog?.status === "cancellation_requested" ? "Review Cancellation Request"
                  : reviewDialog?.is_late_submission || reviewDialog?.status === "late_pending_approval" ? "Approve Late OT"
                  : "Approve Overtime Request"}
              </DialogTitle>
            </DialogHeader>
            {reviewDialog && (
              <div className="space-y-3">
                <p className="text-sm"><strong>Staff:</strong> {reviewDialog.profiles?.first_name} {reviewDialog.profiles?.last_name}</p>
                <p className="text-sm"><strong>Date:</strong> {format(parseISO(reviewDialog.date), "dd MMM yyyy")}</p>
                <p className="text-sm"><strong>Hours:</strong> {formatHours(reviewDialog.hours)}</p>
                <p className="text-sm"><strong>OT Month:</strong> {monthLabel(reviewDialog.ot_month)}</p>
                <p className="text-sm"><strong>Payroll Month:</strong> {monthLabel(reviewDialog.payroll_month)}</p>
                {reviewDialog.is_late_submission && (
                  <Badge className="bg-warning/10 text-warning border-warning/25">LATE SUBMISSION — will be paid in next payroll</Badge>
                )}
                {reviewDialog.cancellation_reason && (
                  <p className="text-sm"><strong>Cancellation reason:</strong> {reviewDialog.cancellation_reason}</p>
                )}
                <p className="text-sm"><strong>Reason:</strong> {reviewDialog.reason || "—"}</p>
                <div><Label>Review Notes</Label><Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Optional notes" /></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => reviewMutation.mutate({ id: reviewDialog?.id, status: "rejected", row: reviewDialog })} disabled={reviewMutation.isPending}>
                Reject
              </Button>
              <Button onClick={() => reviewMutation.mutate({ id: reviewDialog?.id, status: "approved", row: reviewDialog })} disabled={reviewMutation.isPending}>
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Amendment request dialog */}
        <Dialog open={!!amendDialog} onOpenChange={(o) => !o && setAmendDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request OT Amendment</DialogTitle></DialogHeader>
            {amendDialog && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Original OT will be preserved. The amendment requires HR approval.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>New Start Time</Label>
                    <Input type="time" value={amendValues.start_time} onChange={(e)=>setAmendValues({...amendValues,start_time:e.target.value})}/>
                  </div>
                  <div>
                    <Label>New End Time</Label>
                    <Input type="time" value={amendValues.end_time} onChange={(e)=>setAmendValues({...amendValues,end_time:e.target.value})}/>
                  </div>
                </div>
                <div>
                  <Label>Note to approver</Label>
                  <Textarea value={amendValues.reason} onChange={(e)=>setAmendValues({...amendValues,reason:e.target.value})}/>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={()=>setAmendDialog(null)}>Cancel</Button>
              <Button onClick={()=>amendMutation.mutate()} disabled={amendMutation.isPending}>Submit Amendment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancellation request dialog */}
        <Dialog open={!!cancelDialog} onOpenChange={(o) => !o && setCancelDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request OT Cancellation</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">
              If this OT is already paid, a reversing payroll adjustment will be applied in the next payroll.
            </p>
            <div className="space-y-3">
              <Label>Cancellation reason *</Label>
              <Textarea value={cancelReason} onChange={(e)=>setCancelReason(e.target.value)} placeholder="Why is this OT being cancelled?"/>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={()=>setCancelDialog(null)}>Close</Button>
              <Button onClick={()=>cancelMutation.mutate()} disabled={cancelMutation.isPending}>Submit Cancellation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
