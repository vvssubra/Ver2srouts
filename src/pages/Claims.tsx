import { useState } from "react";
import { notifyBranchApprovers, notifyWorkflowApprovers, notifyAndEmailWorkflowApprovers, notifyAndEmailSubmitterDecision, notifyUsers } from "@/lib/notify";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApprovalSettings } from "@/hooks/use-approval-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Plus, Check, X, Upload, ExternalLink, Banknote, Clock, CalendarDays, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const claimTypeLabels: Record<string, string> = {
  transport: "Transport",
  meal: "Meal",
  medical: "Medical",
  training: "Training",
  equipment: "Equipment",
  other: "Other",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getClaimStatus(r: any) {
  if (r.status === "rejected" || r.status === "cancelled") return r.status;
  if (r.level1_status === "rejected" || r.level2_status === "rejected") return "rejected";
  if (r.level2_status === "approved") return "approved";
  if (r.level1_status === "approved" && r.level2_status === "pending") return "l1_approved";
  return "pending";
}

function getPaymentLabel(r: any) {
  if (r.paid_via === "early_payment" && r.paid_at) return `Paid Early ${format(parseISO(r.paid_at), "d MMM")}`;
  if (r.paid_via === "payroll" && r.paid_at) return `Payroll (${MONTHS[(r.payroll_month || 1) - 1]})`;
  if (r.payroll_month && r.payroll_year) return `Assigned → ${MONTHS[(r.payroll_month || 1) - 1]} ${r.payroll_year}`;
  const st = getClaimStatus(r);
  if (st === "approved") return "Pending Payroll";
  return "—";
}

/** Compute which payroll month/year a claim should be assigned to based on cutoff rules */
async function computePayrollPeriod(claimDate: string, submittedAt: string, branchId: string) {
  const claim = parseISO(claimDate);
  const claimMonth = claim.getMonth() + 1; // 1-indexed
  const claimYear = claim.getFullYear();
  
  // Fetch cutoff policy
  const { data: cutoffData } = await supabase.from("hr_policies").select("policy_data").eq("branch_id", branchId).eq("policy_type", "payroll_cutoff").maybeSingle();
  const cutoff = cutoffData?.policy_data as any;
  const cutoffEnabled = cutoff?.enabled === true;
  const cutoffDay = cutoff?.claim_cutoff_day || 6;
  
  if (!cutoffEnabled) {
    // No cutoff → assign to the month of the claim date
    return { payroll_month: claimMonth, payroll_year: claimYear };
  }
  
  // Cutoff deadline: the cutoff day of the month AFTER the claim month
  const cutoffDate = new Date(claimYear, claimMonth, cutoffDay, 23, 59, 59); // month is 0-indexed, so claimMonth = next month
  const submitted = new Date(submittedAt);
  
  if (submitted <= cutoffDate) {
    // Submitted before cutoff → assign to claim's month
    return { payroll_month: claimMonth, payroll_year: claimYear };
  } else {
    // Submitted after cutoff → roll to next month
    const nextMonth = claimMonth === 12 ? 1 : claimMonth + 1;
    const nextYear = claimMonth === 12 ? claimYear + 1 : claimYear;
    return { payroll_month: nextMonth, payroll_year: nextYear };
  }
}

const statusBadge: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  l1_approved: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  pending: "Pending L1",
  l1_approved: "Pending L2",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function Claims() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const location = useLocation();
  const nav = useNavigate();
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [payNowDialog, setPayNowDialog] = useState<any>(null);
  const [payNowNotes, setPayNowNotes] = useState("");
  const [detailDialog, setDetailDialog] = useState<any>(null);
  const [reverseDialog, setReverseDialog] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");

  // Form
  const [claimType, setClaimType] = useState("transport");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const isSuperAdmin = role === "super_admin";
  const isFranchisee = role === "franchisee";
  const isAdmin = role === "admin";
  const isRestrictedAdmin = isAdmin && allowedRoutes.length > 0 && !managedRoutes.includes("/claims");
  const isManager = (isSuperAdmin || isFranchisee || isAdmin) && !isRestrictedAdmin;

  const { data: branches = [] } = useQuery({
    queryKey: ["my-branches-claims"],
    queryFn: async () => {
      if (isSuperAdmin) {
        const { data } = await supabase.from("branches").select("id, name").order("name");
        return data ?? [];
      }
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return data?.map((m: any) => m.branches).filter(Boolean) ?? [];
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;

  const { data: approvalConfig } = useApprovalSettings(branchId || null);
  const claimsL2Enabled = approvalConfig?.claims_l2_enabled ?? true;
  const claimsL2Threshold = approvalConfig?.claims_l2_threshold ?? 500;

  const { data: myClaims = [] } = useQuery({
    queryKey: ["my-claims", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_claims")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: branchClaims = [] } = useQuery({
    queryKey: ["branch-claims", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_claims")
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Fetch profiles separately (split-query pattern)
      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((r: any) => ({ ...r, profiles: profileMap.get(r.user_id) || null }));
    },
    enabled: !!branchId && isManager,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch");
      let receiptUrl: string | null = null;

      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop();
        const path = `${user!.id}/${Date.now()}.${ext}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        receiptUrl = await uploadAndSign("staff-claims", path, receiptFile);
      }

      const { error } = await supabase.from("staff_claims").insert({
        user_id: user!.id,
        branch_id: branchId,
        claim_type: claimType,
        description,
        amount: parseFloat(amount),
        claim_date: claimDate || new Date().toISOString().split("T")[0],
        receipt_url: receiptUrl,
      });
      if (error) throw error;

      // Notify + email resolved approvers (staff override -> reports_to -> branch managers)
      const requesterName = user!.user_metadata?.first_name
        ? `${user!.user_metadata.first_name} ${user!.user_metadata.last_name ?? ""}`.trim()
        : (user!.email ?? "A team member");
      notifyAndEmailWorkflowApprovers({
        submitterUserId: user!.id,
        branchId,
        workflow: "claim",
        title: "New Expense Claim",
        message: `${requesterName} submitted a ${claimTypeLabels[claimType]} claim of RM${amount}`,
        type: "claim_request",
        actionUrl: "/claims",
        groupKey: `claim-pending-${branchId}`,
        priority: "high",
        requesterName,
        requestType: "Claim",
        summary: `${claimTypeLabels[claimType]} • RM ${amount}`,
        details: [
          { label: "Type", value: claimTypeLabels[claimType] },
          { label: "Amount", value: `RM ${amount}` },
          ...(description ? [{ label: "Description", value: description }] : []),
          ...(claimDate ? [{ label: "Date", value: claimDate }] : []),
        ],
        emailIdempotencyKey: `claim-pending-${branchId}-${Date.now()}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      setShowSubmitDialog(false);
      setDescription(""); setAmount(""); setClaimDate(""); setReceiptFile(null); setClaimType("transport");
      toast({ title: "Claim submitted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, level }: { id: string; action: "approve" | "reject"; level: 1 | 2 }) => {
      const req = reviewDialog;
      const update: any = {};
      const claimAmount = parseFloat(req.amount) || 0;
      const needsL2 = claimsL2Enabled && claimAmount > claimsL2Threshold;
      
      if (level === 1) {
        update.level1_approved_by = user!.id;
        update.level1_approved_at = new Date().toISOString();
        update.level1_status = action === "approve" ? "approved" : "rejected";
        update.level1_notes = reviewNotes || null;
        if (action === "reject") {
          update.status = "rejected";
        } else if (!needsL2) {
          update.status = "approved";
          update.level2_status = "approved";
          update.level2_approved_by = user!.id;
          update.level2_approved_at = new Date().toISOString();
        }
      } else {
        update.level2_approved_by = user!.id;
        update.level2_approved_at = new Date().toISOString();
        update.level2_status = action === "approve" ? "approved" : "rejected";
        update.level2_notes = reviewNotes || null;
        update.status = action === "approve" ? "approved" : "rejected";
      }

      // Assign payroll month on full approval
      const isFullyApproved = (action === "approve" && level === 2) || (action === "approve" && level === 1 && !needsL2);
      if (isFullyApproved && req.branch_id) {
        const period = await computePayrollPeriod(req.claim_date, req.created_at, req.branch_id);
        update.payroll_month = period.payroll_month;
        update.payroll_year = period.payroll_year;
      }

      const { error } = await supabase.from("staff_claims").update(update).eq("id", id);
      if (error) throw error;

      // Notify + email submitter on every status change (in-app always; email only on final status)
      const finalStatus = isFullyApproved ? "approved" : action === "reject" ? "rejected" : null;
      await supabase.from("notifications").insert({
        user_id: req.user_id,
        title: `Claim ${action === "approve" ? "Approved" : "Rejected"}`,
        message: `Your ${claimTypeLabels[req.claim_type]} claim of RM${req.amount} has been ${isFullyApproved ? "fully approved" : action === "approve" ? "approved by L1" : "rejected"}.${isFullyApproved && update.payroll_month ? ` Assigned to ${MONTHS[(update.payroll_month || 1) - 1]} ${update.payroll_year} payroll.` : ""}`,
        type: action === "approve" ? "claim_approved" : "claim_rejected",
        action_url: "/claims",
      });
      if (finalStatus) {
        await notifyAndEmailSubmitterDecision({
          submitterUserId: req.user_id,
          title: `Claim ${finalStatus}`,
          message: `Your ${claimTypeLabels[req.claim_type]} claim of RM${req.amount} has been ${finalStatus}.`,
          type: action === "approve" ? "claim_approved" : "claim_rejected",
          actionUrl: "/claims",
          referenceId: id,
          templateName: "claim-status",
          templateData: {
            status: finalStatus as any,
            claimType: claimTypeLabels[req.claim_type],
            claimTitle: req.description || claimTypeLabels[req.claim_type],
            amount: Number(req.amount).toFixed(2),
            currency: "RM",
            approverNote: reviewNotes || undefined,
          },
          emailIdempotencyKey: `claim-status-${id}-${finalStatus}`,
        });
      }

      // L2 escalation — use resolve_approvers to honour per-staff routing instead of hardcoded super_admin
      if (action === "approve" && level === 1 && needsL2) {
        await notifyAndEmailWorkflowApprovers({
          submitterUserId: req.user_id,
          branchId: req.branch_id,
          workflow: "claim",
          title: "Claim Pending L2 Approval",
          message: `${req.profiles?.first_name || ""}'s ${claimTypeLabels[req.claim_type]} claim (RM${req.amount}) needs final approval`,
          type: "claim_request",
          actionUrl: "/claims",
          referenceId: id,
          groupKey: `claim-l2-${id}`,
          priority: "high",
          requesterName: `${req.profiles?.first_name || ""} ${req.profiles?.last_name || ""}`.trim() || "Staff",
          requestType: "Claim (L2 review)",
          summary: `${claimTypeLabels[req.claim_type]} • RM ${req.amount}`,
          details: [
            { label: "Type", value: claimTypeLabels[req.claim_type] },
            { label: "Amount", value: `RM ${req.amount}` },
            { label: "Status", value: "L1 approved — awaiting L2" },
          ],
          emailIdempotencyKey: `claim-l2-${id}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-claims"] });
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      setReviewDialog(null); setReviewNotes("");
      toast({ title: "Claim updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Pay Now mutation for early/manual payment
  const payNowMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("staff_claims").update({
        paid_at: new Date().toISOString(),
        paid_by: user!.id,
        paid_via: "early_payment",
        payment_notes: notes || null,
      }).eq("id", id);
      if (error) throw error;
      // Notify employee
      const claim = payNowDialog;
      await supabase.from("notifications").insert({
        user_id: claim.user_id,
        title: "Claim Paid Early",
        message: `Your ${claimTypeLabels[claim.claim_type]} claim of RM${claim.amount} has been paid early.`,
        type: "claim_approved",
        action_url: "/claims",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-claims"] });
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      setPayNowDialog(null); setPayNowNotes("");
      toast({ title: "Payment recorded", description: "Claim marked as paid early. It will be excluded from payroll." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_claims").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      toast({ title: "Claim cancelled" });
    },
  });

  // Reverse early payment mutation
  const reversePaymentMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("staff_claims").update({
        paid_at: null,
        paid_by: null,
        paid_via: null,
        payment_notes: null,
      }).eq("id", id);
      if (error) throw error;
      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: user!.id,
        action: "reverse_claim_payment",
        target_type: "staff_claim",
        target_id: id,
        target_label: `Reversed early payment: ${reason}`,
        metadata: { reason },
      } as any);
      // Notify employee
      const claim = reverseDialog;
      if (claim?.user_id) {
        await supabase.from("notifications").insert({
          user_id: claim.user_id,
          title: "Claim Payment Reversed",
          message: `Your ${claimTypeLabels[claim.claim_type]} claim of RM${claim.amount} early payment has been reversed. Reason: ${reason}`,
          type: "claim_rejected",
          action_url: "/claims",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-claims"] });
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      setReverseDialog(null);
      setReverseReason("");
      toast({ title: "Payment reversed", description: "The early payment has been reversed and accounting updated." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function getActionButtons(r: any) {
    const display = getClaimStatus(r);
    const claimAmount = parseFloat(r.amount) || 0;
    const needsL2 = claimsL2Enabled && claimAmount > claimsL2Threshold;
    const approveLabel = needsL2 ? "L1" : "Approve";
    
    // L1 approval: franchisee, admin, or super_admin can approve pending
    if ((isFranchisee || isAdmin || isSuperAdmin) && display === "pending") {
      return (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="text-success" onClick={() => { setReviewDialog({ ...r, _level: 1, _action: "approve" }); setReviewNotes(""); }}>
            <Check className="h-3 w-3 mr-1" /> {approveLabel}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReviewDialog({ ...r, _level: 1, _action: "reject" }); setReviewNotes(""); }}>
            <X className="h-3 w-3 mr-1" /> Reject
          </Button>
        </div>
      );
    }
    // L2 approval: only super_admin, only when needed
    if (isSuperAdmin && display === "l1_approved") {
      return (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="text-success" onClick={() => { setReviewDialog({ ...r, _level: 2, _action: "approve" }); setReviewNotes(""); }}>
            <Check className="h-3 w-3 mr-1" /> L2
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReviewDialog({ ...r, _level: 2, _action: "reject" }); setReviewNotes(""); }}>
            <X className="h-3 w-3 mr-1" /> Reject
          </Button>
        </div>
      );
    }
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(location.state as any)?.from === "/staff-attendance" && (
              <Button variant="ghost" size="sm" onClick={() => nav("/staff-attendance")}>← Back</Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">Expense Claims</h1>
              <p className="text-sm text-muted-foreground mt-1">Submit and manage expense claims with receipt uploads</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowSubmitDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Submit Claim
            </Button>
          </div>
        </div>

        <Tabs defaultValue={isManager ? "team" : "my"}>
          <TabsList>
            <TabsTrigger value="my">My Claims</TabsTrigger>
            {isManager && <TabsTrigger value="team">Team Claims</TabsTrigger>}
          </TabsList>

          <TabsContent value="my">
            <Card>
              <CardContent className="p-0">
                {myClaims.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No claims yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payroll</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myClaims.map((r: any) => {
                        const display = getClaimStatus(r);
                        return (
                          <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailDialog(r)}>
                            <TableCell className="font-medium">{claimTypeLabels[r.claim_type] || r.claim_type}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">{r.description}</TableCell>
                            <TableCell>RM {parseFloat(r.amount).toFixed(2)}</TableCell>
                            <TableCell className="text-sm">{format(parseISO(r.claim_date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="text-sm">
                              {r.payroll_month ? (
                                <span className="text-xs">{MONTHS[(r.payroll_month || 1) - 1]} {r.payroll_year}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.paid_at ? "default" : "outline"} className="text-xs">
                                {r.paid_via === "early_payment" && r.paid_at ? (
                                  <><Banknote className="h-3 w-3 mr-1" /> Early</>
                                ) : r.paid_at ? (
                                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Payroll</>
                                ) : display === "approved" ? (
                                  <><Clock className="h-3 w-3 mr-1" /> Pending</>
                                ) : "—"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${statusBadge[display] || ""}`}>{statusLabel[display] || display}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {display === "pending" && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(r.id); }}>Cancel</Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isManager && (
            <TabsContent value="team">
              <Card>
                <CardContent className="p-0">
                  {branchClaims.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No claims for this branch</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Payroll</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchClaims.map((r: any) => {
                          const display = getClaimStatus(r);
                          return (
                            <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailDialog(r)}>
                              <TableCell>
                                <p className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</p>
                                <p className="text-xs text-muted-foreground">{r.profiles?.email}</p>
                              </TableCell>
                              <TableCell>{claimTypeLabels[r.claim_type] || r.claim_type}</TableCell>
                              <TableCell>RM {parseFloat(r.amount).toFixed(2)}</TableCell>
                              <TableCell className="text-sm">{format(parseISO(r.claim_date), "dd MMM yyyy")}</TableCell>
                              <TableCell className="text-sm">
                                {r.payroll_month ? (
                                  <span className="text-xs">{MONTHS[(r.payroll_month || 1) - 1]} {r.payroll_year}</span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                {r.paid_via === "early_payment" && r.paid_at ? (
                                  <div className="flex items-center gap-1">
                                    <Badge variant="default" className="text-xs"><Banknote className="h-3 w-3 mr-1" /> Early</Badge>
                                    {isManager && (
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-destructive px-1" onClick={(e) => { e.stopPropagation(); setReverseDialog(r); setReverseReason(""); }}>
                                        Reverse
                                      </Button>
                                    )}
                                  </div>
                                ) : r.paid_at ? (
                                  <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Payroll</Badge>
                                ) : display === "approved" && !r.paid_at ? (
                                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={(e) => { e.stopPropagation(); setPayNowDialog(r); setPayNowNotes(""); }}>
                                    <Banknote className="h-3 w-3" /> Pay Now
                                  </Button>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge className={`text-xs ${statusBadge[display] || ""}`}>{statusLabel[display] || display}</Badge>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>{getActionButtons(r)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Submit Claim Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Expense Claim</DialogTitle>
            <DialogDescription>Upload receipt and enter claim details. Requires L1 + L2 approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Claim Type</Label>
              <Select value={claimType} onValueChange={setClaimType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(claimTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the expense..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (RM)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Receipt (Photo/PDF)</Label>
              <div className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input p-3 hover:bg-muted/50">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{receiptFile ? receiptFile.name : "Click to upload receipt"}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>Cancel</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={!amount || !description || submitMutation.isPending}>
              {submitMutation.isPending ? "Submitting..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDialog?._action === "reject" ? "Reject" : "Approve"} Claim — Level {reviewDialog?._level}</DialogTitle>
            <DialogDescription>
              {reviewDialog?.profiles?.first_name} {reviewDialog?.profiles?.last_name} — {claimTypeLabels[reviewDialog?.claim_type] || ""} (RM{reviewDialog?.amount})
            </DialogDescription>
          </DialogHeader>
          {reviewDialog?.receipt_url && (
            <a href={reviewDialog.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> View Receipt
            </a>
          )}
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add a note..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
            <Button
              variant={reviewDialog?._action === "reject" ? "destructive" : "default"}
              onClick={() => reviewDialog && reviewMutation.mutate({ id: reviewDialog.id, action: reviewDialog._action, level: reviewDialog._level })}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? "Processing..." : reviewDialog?._action === "reject" ? "Reject" : `Approve L${reviewDialog?._level}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Now Dialog */}
      <Dialog open={!!payNowDialog} onOpenChange={() => setPayNowDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Early Payment</DialogTitle>
            <DialogDescription>
              {payNowDialog?.profiles?.first_name} {payNowDialog?.profiles?.last_name} — {claimTypeLabels[payNowDialog?.claim_type] || ""} (RM{payNowDialog?.amount})
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <p><span className="font-medium">Claim Date:</span> {payNowDialog?.claim_date ? format(parseISO(payNowDialog.claim_date), "dd MMM yyyy") : ""}</p>
            <p><span className="font-medium">Assigned Payroll:</span> {payNowDialog?.payroll_month ? `${MONTHS[(payNowDialog.payroll_month || 1) - 1]} ${payNowDialog.payroll_year}` : "Not yet assigned"}</p>
            <p className="text-xs text-muted-foreground mt-2">This claim will be marked as paid early and <strong>excluded from payroll</strong> generation.</p>
          </div>
          <div>
            <Label>Payment Notes (optional)</Label>
            <Textarea value={payNowNotes} onChange={(e) => setPayNowNotes(e.target.value)} placeholder="e.g. Paid via bank transfer, Ref: TXN123..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayNowDialog(null)}>Cancel</Button>
            <Button onClick={() => payNowDialog && payNowMutation.mutate({ id: payNowDialog.id, notes: payNowNotes })} disabled={payNowMutation.isPending}>
              {payNowMutation.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Detail / Audit Trail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Claim Details</DialogTitle>
            <DialogDescription>
              {claimTypeLabels[detailDialog?.claim_type] || detailDialog?.claim_type} — RM {parseFloat(detailDialog?.amount || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Claim Date</span><p className="font-medium">{format(parseISO(detailDialog.claim_date), "dd MMM yyyy")}</p></div>
                <div><span className="text-muted-foreground">Submitted</span><p className="font-medium">{format(parseISO(detailDialog.created_at), "dd MMM yyyy, HH:mm")}</p></div>
                <div><span className="text-muted-foreground">Description</span><p className="font-medium">{detailDialog.description}</p></div>
                {detailDialog.receipt_url && (
                  <div>
                    <span className="text-muted-foreground">Receipt</span>
                    <p><a href={detailDialog.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1"><ExternalLink className="h-3 w-3" /> View</a></p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Audit Timeline */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Audit Trail</p>
                <div className="space-y-3">
                  <TimelineStep icon={<CalendarDays className="h-3.5 w-3.5" />} label="Submitted" date={detailDialog.created_at} active />
                  
                  {detailDialog.level1_approved_at && (
                    <TimelineStep
                      icon={detailDialog.level1_status === "approved" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      label={`L1 ${detailDialog.level1_status === "approved" ? "Approved" : "Rejected"}`}
                      date={detailDialog.level1_approved_at}
                      note={detailDialog.level1_notes}
                      active
                      variant={detailDialog.level1_status === "approved" ? "success" : "destructive"}
                    />
                  )}

                  {detailDialog.level2_approved_at && (
                    <TimelineStep
                      icon={detailDialog.level2_status === "approved" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      label={`L2 ${detailDialog.level2_status === "approved" ? "Approved" : "Rejected"}`}
                      date={detailDialog.level2_approved_at}
                      note={detailDialog.level2_notes}
                      active
                      variant={detailDialog.level2_status === "approved" ? "success" : "destructive"}
                    />
                  )}

                  {detailDialog.payroll_month && (
                    <TimelineStep
                      icon={<CalendarDays className="h-3.5 w-3.5" />}
                      label={`Assigned to ${MONTHS[(detailDialog.payroll_month || 1) - 1]} ${detailDialog.payroll_year} Payroll`}
                      active
                    />
                  )}

                  {detailDialog.paid_at && (
                    <TimelineStep
                      icon={<Banknote className="h-3.5 w-3.5" />}
                      label={detailDialog.paid_via === "early_payment" ? "Paid Early" : "Paid via Payroll"}
                      date={detailDialog.paid_at}
                      note={detailDialog.payment_notes}
                      active
                      variant="success"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Reverse Early Payment Dialog */}
      <Dialog open={!!reverseDialog} onOpenChange={() => setReverseDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Early Payment</DialogTitle>
            <DialogDescription>
              {reverseDialog?.profiles?.first_name} {reverseDialog?.profiles?.last_name} — {claimTypeLabels[reverseDialog?.claim_type] || ""} (RM{reverseDialog?.amount})
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
            <p className="font-medium text-destructive">⚠ This will reverse the early payment record.</p>
            <p className="text-muted-foreground text-xs">The claim will return to "Pending Payroll" status. A compensating negative transaction will be created in accounting automatically.</p>
          </div>
          <div>
            <Label>Reason for reversal <span className="text-destructive">*</span></Label>
            <Textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Why is this payment being reversed?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => reverseDialog && reversePaymentMutation.mutate({ id: reverseDialog.id, reason: reverseReason })}
              disabled={reversePaymentMutation.isPending || !reverseReason.trim()}
            >
              {reversePaymentMutation.isPending ? "Reversing..." : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function TimelineStep({ icon, label, date, note, active, variant }: {
  icon: React.ReactNode; label: string; date?: string; note?: string; active?: boolean; variant?: "success" | "destructive";
}) {
  const colorClass = variant === "success" ? "text-primary border-primary/30 bg-primary/10" : variant === "destructive" ? "text-destructive border-destructive/30 bg-destructive/10" : "text-muted-foreground border-border bg-muted/50";
  return (
    <div className="flex gap-3 items-start">
      <div className={`rounded-full p-1.5 border ${active ? colorClass : "text-muted-foreground border-border bg-muted/30"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {date && <p className="text-xs text-muted-foreground">{format(parseISO(date), "dd MMM yyyy, HH:mm")}</p>}
        {note && <p className="text-xs text-muted-foreground mt-0.5 italic">"{note}"</p>}
      </div>
    </div>
  );
}
