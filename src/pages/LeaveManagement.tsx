import { useState, useMemo, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Check, X, XCircle, Upload, ExternalLink, Download, FileText, AlertTriangle, UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO, differenceInCalendarDays, isAfter, isBefore, isEqual } from "date-fns";
import LeaveReportPrintView from "@/components/LeaveReportPrintView";
import * as XLSX from "xlsx";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const leaveTypeLabels: Record<string, string> = {
  annual: "Annual Leave",
  medical: "Medical Leave",
  hospitalisation: "Hospitalisation Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  unpaid: "Unpaid Leave",
  emergency: "Emergency Leave",
  compassionate: "Compassionate Leave",
  replacement: "Replacement Leave",
  birthday: "Birthday Leave",
};

const leaveTypeKeys = ["annual", "medical", "hospitalisation", "maternity", "paternity", "emergency", "compassionate", "replacement", "unpaid", "birthday"];

const ATTACHMENT_REQUIRED_TYPES = ["medical", "hospitalisation", "compassionate"];

// Format a leave-day value keeping decimals (e.g. 8.5 stays 8.5, 8 stays 8).
// PostgREST returns numeric columns as strings so we always coerce first.
function fmtDays(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function getStatusDisplay(r: any, role: string | null) {
  if (r.status === "rejected" || r.status === "cancelled") return r.status;
  if (r.level1_status === "rejected" || r.level2_status === "rejected") return "rejected";
  if (r.level2_status === "approved") return "approved";
  if (r.level1_status === "approved" && r.level2_status === "pending") return "level1_approved";
  return "pending";
}

const statusBadgeClass: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  level1_approved: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  pending: "Pending L1",
  level1_approved: "Pending L2",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function LeaveManagement() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch, activeBranchIds } = useGlobalBranch();
  const location = useLocation();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showTeamApplyDialog, setShowTeamApplyDialog] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [detailDialog, setDetailDialog] = useState<any>(null);
  const [cancelConfirmDialog, setCancelConfirmDialog] = useState<any>(null);

  // Form state
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isHalfDay, setIsHalfDay] = useState(false);

  // On-behalf state
  const [onBehalfUserId, setOnBehalfUserId] = useState("");
  const [teamLeaveType, setTeamLeaveType] = useState<string>("annual");
  const [teamStartDate, setTeamStartDate] = useState("");
  const [teamEndDate, setTeamEndDate] = useState("");
  const [teamReason, setTeamReason] = useState("");
  const [teamAttachmentFile, setTeamAttachmentFile] = useState<File | null>(null);
  const [teamIsHalfDay, setTeamIsHalfDay] = useState(false);

  // Report filters
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportEmployee, setReportEmployee] = useState("all");
  const [reportLeaveType, setReportLeaveType] = useState("all");
  const [reportStatus, setReportStatus] = useState("all");

  // History filter
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());

  const isFranchisee = role === "franchisee";
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const isRestrictedAdmin = isAdmin && allowedRoutes.length > 0 && !managedRoutes.includes("/leave");
  // Only HR (admin) and Super Admin can view/approve others' leave requests.
  // Franchisees see only their own leave, like regular staff.
  const isManager = (isSuperAdmin || isAdmin) && !isRestrictedAdmin;


  const { data: branches = [] } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data, error } = await supabase.from("branches").select("id, name").order("name");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((m: any) => m.branches).filter(Boolean);
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;
  // When the global picker is on "All Branches", admins still need to see
  // leave data across every branch they have access to. Use the resolved
  // list of accessible branch UUIDs for admin-facing queries so leave
  // applications never appear "lost" after a refresh.
  const scopedBranchIds = useMemo(
    () => (selectedBranch && selectedBranch !== "all" ? [selectedBranch] : (activeBranchIds ?? [])),
    [selectedBranch, activeBranchIds],
  );
  const hasScope = scopedBranchIds.length > 0;
  const currentYear = new Date().getFullYear();

  const { data: approvalConfig } = useApprovalSettings(branchId || null);
  const leaveL2Required = approvalConfig?.leave_l2_enabled ?? false;

  const { data: balance } = useQuery({
    queryKey: ["leave-balance", user?.id, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .eq("user_id", user!.id)
        .eq("year", currentYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: myRequests = [] } = useQuery({
    queryKey: ["my-leave-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: branchProfiles = [] } = useQuery({
    queryKey: ["branch-staff-profiles", scopedBranchIds.join(",")],
    queryFn: async () => {
      const { data: memberships, error: mErr } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", scopedBranchIds);
      if (mErr) throw mErr;
      const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
      if (userIds.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      if (pErr) throw pErr;
      return profiles ?? [];
    },
    enabled: hasScope && isManager,
  });

  const leaveStaffDirectory = useMemo(() => {
    const map = new Map<string, any>();
    branchProfiles.forEach((p: any) => map.set(p.id, p));
    return map;
  }, [branchProfiles]);

  // Fetch staff_profiles to get reports_to (supervisor) mapping
  const { data: staffProfilesForSupervisor = [] } = useQuery({
    queryKey: ["staff-profiles-supervisor-map", scopedBranchIds.join(",")],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", scopedBranchIds);
      const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("staff_profiles")
        .select("id, reports_to")
        .in("id", userIds);
      return data ?? [];
    },
    enabled: !!branchId && isManager,
  });

  const supervisorMap = useMemo(() => {
    const map = new Map<string, string | null>();
    staffProfilesForSupervisor.forEach((sp: any) => map.set(sp.id, sp.reports_to));
    return map;
  }, [staffProfilesForSupervisor]);

  const { data: branchRequests = [] } = useQuery({
    queryKey: ["branch-leave-requests", scopedBranchIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .in("branch_id", scopedBranchIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: hasScope && isManager,
  });

  // Branch settings for print
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings-leave", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_settings")
        .select("*")
        .eq("branch_id", branchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!branchId,
  });

  // History: all leave balances for branch staff for a given year
  const { data: allBalances = [] } = useQuery({
    queryKey: ["all-leave-balances", scopedBranchIds.join(","), historyYear],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .in("branch_id", scopedBranchIds);
      const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .in("user_id", userIds)
        .eq("year", historyYear);
      if (error) throw error;
      return data ?? [];
    },
    enabled: hasScope && isManager,
  });

  // Carry forward logs for history tab
  const { data: allCFLogs = [] } = useQuery({
    queryKey: ["all-cf-logs", scopedBranchIds.join(","), historyYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carry_forward_log")
        .select("*")
        .in("branch_id", scopedBranchIds)
        .eq("to_year", historyYear);
      if (error) throw error;
      return data ?? [];
    },
    enabled: hasScope && isManager,
  });

  // HR policies for default totals
  const { data: hrPolicies } = useQuery({
    queryKey: ["hr-policies-leave", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_policies")
        .select("*")
        .eq("branch_id", branchId)
        .eq("policy_type", "leave")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!branchId && isManager,
  });

  // Custom leave types defined by HR (e.g. Birthday Leave)
  const { data: customLeaveTypes = [] } = useQuery({
    queryKey: ["custom-leave-types", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_leave_types" as any)
        .select("*")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const customTypeMap = useMemo(() => {
    const m = new Map<string, any>();
    (customLeaveTypes as any[]).forEach((t) => m.set(`custom:${t.id}`, t));
    return m;
  }, [customLeaveTypes]);

  // Combined options for the apply dropdown
  const leaveTypeOptions = useMemo(() => {
    const builtins = Object.entries(leaveTypeLabels).map(([k, v]) => ({ value: k, label: v }));
    const customs = (customLeaveTypes as any[]).map((t) => ({
      value: `custom:${t.id}`,
      label: t.name + (t.paid ? "" : " (Unpaid)"),
    }));
    return [...builtins, ...customs];
  }, [customLeaveTypes]);

  // Custom balances (per user/year)
  const { data: myCustomBalances = [] } = useQuery({
    queryKey: ["my-custom-leave-balances", user?.id, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_leave_balances" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("year", currentYear);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const requiresAttachmentFor = (t: string): boolean => {
    if (t.startsWith("custom:")) {
      const ct = (customLeaveTypes as any[]).find((x) => `custom:${x.id}` === t);
      return !!ct?.requires_attachment;
    }
    return ATTACHMENT_REQUIRED_TYPES.includes(t);
  };
  const labelFor = (t: string): string => {
    if (t.startsWith("custom:")) {
      const ct = (customLeaveTypes as any[]).find((x) => `custom:${x.id}` === t);
      return ct?.name ?? "Custom Leave";
    }
    return leaveTypeLabels[t] ?? t;
  };
  const isAttachmentRequired = requiresAttachmentFor(leaveType);
  const isTeamAttachmentRequired = requiresAttachmentFor(teamLeaveType);

  const rowLabel = (r: any): string => {
    if (r?.leave_type === "custom" && r?.custom_leave_type_id) {
      const ct = (customLeaveTypes as any[]).find((x) => x.id === r.custom_leave_type_id);
      return ct?.name ?? "Custom Leave";
    }
    return leaveTypeLabels[r?.leave_type] ?? r?.leave_type ?? "";
  };

  // --- Balance validation helper ---
  function getBalanceRemaining(userId: string, type: string): number | null {
    if (type.startsWith("custom:")) {
      const ctId = type.slice(7);
      const ct = (customLeaveTypes as any[]).find((x) => x.id === ctId);
      if (!ct) return null;
      // Only check own balances; for on-behalf we skip strict check
      if (userId !== user?.id) return null;
      const cb = (myCustomBalances as any[]).find((b) => b.custom_leave_type_id === ctId);
      const total = Number(cb?.total ?? ct.default_days ?? 0) || 0;
      const used = Number(cb?.used ?? 0) || 0;
      return total - used;
    }
    const bal = allBalances.find((b: any) => b.user_id === userId);
    const policyData = hrPolicies?.policy_data as any;
    const defaults: Record<string, number> = {
      annual: policyData?.annual_leave ?? 14,
      medical: policyData?.medical_leave ?? 14,
      hospitalisation: policyData?.hospitalisation_leave ?? 0,
      maternity: policyData?.maternity_leave ?? 98,
      paternity: policyData?.paternity_leave ?? 7,
      emergency: policyData?.emergency_leave ?? 2,
      compassionate: policyData?.compassionate_leave ?? 3,
      replacement: policyData?.replacement_leave ?? 0,
      unpaid: policyData?.unpaid_leave ?? 10,
      birthday: 1,
    };
    const total = Number(bal ? (bal as any)[`${type}_total`] ?? defaults[type] : defaults[type]) || 0;
    const used = Number(bal ? (bal as any)[`${type}_used`] ?? 0 : 0) || 0;
    return total - used;
  }

  // --- Overlap detection ---
  function getOverlappingLeaves(startStr: string, endStr: string, excludeUserId?: string) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    return branchRequests.filter((r: any) => {
      if (excludeUserId && r.user_id === excludeUserId) return false;
      const display = getStatusDisplay(r, role);
      if (display !== "approved" && display !== "pending" && display !== "level1_approved") return false;
      const rStart = new Date(r.start_date);
      const rEnd = new Date(r.end_date);
      return !(isAfter(start, rEnd) || isBefore(end, rStart));
    }).map((r: any) => {
      const staff = leaveStaffDirectory.get(r.user_id);
      return staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() : "Unknown";
    });
  }

  // Calculate days with half-day support
  function calcDays(start: string, end: string, halfDay: boolean): number {
    if (!start || !end) return 0;
    const days = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
    if (days === 1 && halfDay) return 0.5;
    return days;
  }

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (!reason.trim()) throw new Error("Reason is required for leave application");
      const days = calcDays(startDate, endDate, isHalfDay);
      if (days < 0.5) throw new Error("End date must be after start date");

      // Balance validation
      const remaining = getBalanceRemaining(user!.id, leaveType);
      if (remaining !== null && days > remaining) {
        throw new Error(`Insufficient ${labelFor(leaveType)} balance. Remaining: ${remaining} day(s). Consider applying for Unpaid Leave.`);
      }

      if (isAttachmentRequired && !attachmentFile) {
        throw new Error(`${labelFor(leaveType)} requires a supporting document (MC/proof)`);
      }

      let attachmentUrl: string | null = null;
      if (attachmentFile) {
        const ext = attachmentFile.name.split(".").pop();
        const path = `${user!.id}/${Date.now()}.${ext}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        attachmentUrl = await uploadAndSign("leave-attachments", path, attachmentFile);
      }

      const isCustom = leaveType.startsWith("custom:");
      const { error } = await supabase.from("leave_requests").insert({
        user_id: user!.id,
        branch_id: branchId,
        leave_type: (isCustom ? "custom" : leaveType) as any,
        custom_leave_type_id: isCustom ? leaveType.slice(7) : null,
        start_date: startDate,
        end_date: endDate,
        days,
        reason,
        attachment_url: attachmentUrl,
        is_half_day: isHalfDay,
      } as any);
      if (error) throw error;

      // Notify + email resolved approvers (override -> reports_to -> branch managers)
      const { notifyAndEmailWorkflowApprovers } = await import("@/lib/notify");
      const requesterName = user!.user_metadata?.first_name
        ? `${user!.user_metadata.first_name} ${user!.user_metadata.last_name ?? ""}`.trim()
        : (user!.email ?? "A team member");
      await notifyAndEmailWorkflowApprovers({
        submitterUserId: user!.id,
        branchId,
        workflow: "leave",
        title: "New Leave Request",
        message: `${requesterName} applied for ${labelFor(leaveType)} (${days} days)`,
        type: "leave_request",
        actionUrl: "/leave",
        groupKey: `leave-pending-${branchId}`,
        priority: "high",
        requesterName,
        requestType: "Leave",
        summary: `${labelFor(leaveType)} • ${days} day(s)`,
        details: [
          { label: "Type", value: labelFor(leaveType) },
          { label: "Dates", value: `${startDate}${endDate && endDate !== startDate ? ` — ${endDate}` : ""}` },
          { label: "Days", value: String(days) },
          ...(reason ? [{ label: "Reason", value: reason }] : []),
        ],
        emailIdempotencyKey: `leave-pending-${branchId}-${Date.now()}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      setShowApplyDialog(false);
      resetPersonalForm();
      toast({ title: "Leave application submitted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // On-behalf mutation
  const onBehalfMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (!onBehalfUserId) throw new Error("Please select an employee");
      if (!teamReason.trim()) throw new Error("Reason is required");
      const days = calcDays(teamStartDate, teamEndDate, teamIsHalfDay);
      if (days < 0.5) throw new Error("End date must be after start date");

      // Balance validation
      const remaining = getBalanceRemaining(onBehalfUserId, teamLeaveType);
      if (remaining !== null && days > remaining) {
        throw new Error(`Insufficient ${labelFor(teamLeaveType)} balance. Remaining: ${remaining} day(s). Consider Unpaid Leave.`);
      }

      if (isTeamAttachmentRequired && !teamAttachmentFile) {
        throw new Error(`${labelFor(teamLeaveType)} requires a supporting document`);
      }

      let attachmentUrl: string | null = null;
      if (teamAttachmentFile) {
        const ext = teamAttachmentFile.name.split(".").pop();
        const path = `${onBehalfUserId}/${Date.now()}.${ext}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        attachmentUrl = await uploadAndSign("leave-attachments", path, teamAttachmentFile);
      }

      // On-behalf: submit as PENDING — route to supervisor for approval
      const isCustom = teamLeaveType.startsWith("custom:");
      const insertData: any = {
        user_id: onBehalfUserId,
        branch_id: branchId,
        leave_type: isCustom ? "custom" : teamLeaveType,
        custom_leave_type_id: isCustom ? teamLeaveType.slice(7) : null,
        start_date: teamStartDate,
        end_date: teamEndDate,
        days,
        reason: teamReason,
        attachment_url: attachmentUrl,
        is_half_day: teamIsHalfDay,
        applied_on_behalf_by: user!.id,
        level1_status: "pending",
        status: "pending",
      };

      const { error } = await supabase.from("leave_requests").insert(insertData);
      if (error) throw error;

      // Determine who to notify for approval
      const useReportsTo = approvalConfig?.use_reports_to ?? true;
      let supervisorId: string | null = null;

      if (useReportsTo) {
        // Look up the staff member's supervisor
        const { data: staffProfile } = await supabase
          .from("staff_profiles")
          .select("reports_to")
          .eq("id", onBehalfUserId)
          .maybeSingle();
        supervisorId = staffProfile?.reports_to || null;
      }

      if (supervisorId) {
        // Notify the supervisor for L1 approval
        await supabase.from("notifications").insert({
          user_id: supervisorId,
          title: "Leave Approval Required",
          message: `Leave request (${labelFor(teamLeaveType)}, ${days} days) applied on behalf of staff requires your approval.`,
          type: "leave_request",
          action_url: "/leave",
        });
      } else {
        // No supervisor — notify all super admins in the branch
        const { data: branchAdmins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "super_admin");
        if (branchAdmins?.length) {
          const adminNotifications = branchAdmins.map((a) => ({
            user_id: a.user_id,
            title: "Leave Approval Required",
            message: `Leave request (${labelFor(teamLeaveType)}, ${days} days) applied on behalf of staff requires your approval.`,
            type: "leave_request",
            action_url: "/leave",
          }));
          await supabase.from("notifications").insert(adminNotifications);
        }
      }

      // Notify the employee that leave was applied on their behalf
      await supabase.from("notifications").insert({
        user_id: onBehalfUserId,
        title: "Leave Applied on Your Behalf",
        message: `${labelFor(teamLeaveType)} (${days} days) has been applied on your behalf. It is pending supervisor approval.`,
        type: "leave_request",
        action_url: "/leave",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["all-leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      setShowTeamApplyDialog(false);
      resetTeamForm();
      toast({ title: "Leave applied on behalf of employee" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, level }: { id: string; action: "approve" | "reject"; level: 1 | 2 }) => {
      const req = reviewDialog;
      const updateData: any = {};
      if (level === 1) {
        updateData.level1_approved_by = user!.id;
        updateData.level1_approved_at = new Date().toISOString();
        updateData.level1_status = action === "approve" ? "approved" : "rejected";
        updateData.level1_notes = reviewNotes || null;
        if (action === "reject") {
          updateData.status = "rejected";
          updateData.reviewed_by = user!.id;
          updateData.reviewed_at = new Date().toISOString();
        } else if (!leaveL2Required) {
          updateData.status = "approved";
          updateData.reviewed_by = user!.id;
          updateData.reviewed_at = new Date().toISOString();
          updateData.level2_status = "approved";
          updateData.level2_approved_by = user!.id;
          updateData.level2_approved_at = new Date().toISOString();
        } else {
          updateData.approval_level = 2;
        }
      } else {
        updateData.level2_approved_by = user!.id;
        updateData.level2_approved_at = new Date().toISOString();
        updateData.level2_status = action === "approve" ? "approved" : "rejected";
        updateData.level2_notes = reviewNotes || null;
        updateData.status = action === "approve" ? "approved" : "rejected";
        updateData.reviewed_by = user!.id;
        updateData.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("leave_requests").update(updateData).eq("id", id);
      if (error) throw error;

      const isFullyApproved = (action === "approve" && level === 2) || (action === "approve" && level === 1 && !leaveL2Required);
      if (isFullyApproved && req) {
        const typeKey = `${req.leave_type}_used` as string;
        const { data: bal } = await supabase.from("leave_balances").select("*").eq("user_id", req.user_id).eq("year", currentYear).maybeSingle();
        if (bal) {
          // PostgREST returns numeric columns as strings — coerce to preserve decimals (e.g. 8 + 0.5 = 8.5)
          const currentUsed = Number((bal as any)[typeKey] ?? 0) || 0;
          const addDays = Number(req.days) || 0;
          await supabase.from("leave_balances").update({ [typeKey]: currentUsed + addDays } as any).eq("id", bal.id);
        } else {
          await supabase.from("leave_balances").insert({
            user_id: req.user_id, branch_id: req.branch_id, year: currentYear, [typeKey]: Number(req.days) || 0,
          } as any);
        }
      }

      const statusText = action === "approve" ? (isFullyApproved ? "fully approved" : "approved by Level 1") : "rejected";
      await supabase.from("notifications").insert({
        user_id: req.user_id,
        title: `Leave ${action === "approve" ? "Approved" : "Rejected"}`,
        message: `Your ${rowLabel(req)} request has been ${statusText}.`,
        type: action === "approve" ? "leave_approved" : "leave_rejected",
        reference_id: id,
        action_url: "/leave",
      });

      // Email submitter on final status
      const finalStatus = isFullyApproved ? "approved" : action === "reject" ? "rejected" : null;
      if (finalStatus) {
        const { notifyAndEmailSubmitterDecision } = await import("@/lib/notify");
        await notifyAndEmailSubmitterDecision({
          submitterUserId: req.user_id,
          title: `Leave ${finalStatus}`,
          message: `Your ${rowLabel(req)} request has been ${finalStatus}.`,
          type: action === "approve" ? "leave_approved" : "leave_rejected",
          actionUrl: "/leave",
          referenceId: id,
          templateName: "leave-status",
          templateData: {
            status: finalStatus as any,
            leaveType: labelFor(req.leave_type),
            startDate: req.start_date,
            endDate: req.end_date,
            days: String(req.days),
            approverNote: reviewNotes || undefined,
          },
          emailIdempotencyKey: `leave-status-${id}-${finalStatus}`,
        });
      }

      // L2 escalation via resolve_approvers (honours per-staff routing)
      if (action === "approve" && level === 1 && leaveL2Required) {
        const { notifyAndEmailWorkflowApprovers } = await import("@/lib/notify");
        const requesterFullName = `${leaveStaffDirectory.get(req.user_id)?.first_name || ""} ${leaveStaffDirectory.get(req.user_id)?.last_name || ""}`.trim() || "Staff";
        await notifyAndEmailWorkflowApprovers({
          submitterUserId: req.user_id,
          branchId: req.branch_id,
          workflow: "leave",
          title: "Leave Pending L2 Approval",
          message: `${requesterFullName}'s ${rowLabel(req)} needs final approval`,
          type: "leave_request",
          actionUrl: "/leave",
          referenceId: id,
          groupKey: `leave-l2-${id}`,
          priority: "high",
          requesterName: requesterFullName,
          requestType: "Leave (L2 review)",
          summary: `${rowLabel(req)}`,
          details: [
            { label: "Type", value: labelFor(req.leave_type) },
            { label: "Dates", value: `${req.start_date} — ${req.end_date}` },
            { label: "Days", value: String(req.days) },
            { label: "Status", value: "L1 approved — awaiting L2" },
          ],
          emailIdempotencyKey: `leave-l2-${id}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balance"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["all-leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["staff-leave-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      setReviewDialog(null); setReviewNotes("");
      toast({ title: "Leave request updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Cancel pending leave (personal - no balance reversal needed)
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_requests").update({ status: "cancelled" as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["staff-leave-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      toast({ title: "Leave request cancelled" });
    },
  });

  // Cancel approved leave (with balance reversal)
  const cancelApprovedMutation = useMutation({
    mutationFn: async (req: any) => {
      // Update status to cancelled
      const { error } = await supabase.from("leave_requests").update({
        status: "cancelled" as any,
        cancelled_by: user!.id,
        cancelled_at: new Date().toISOString(),
      }).eq("id", req.id);
      if (error) throw error;

      // Reverse balance
      const typeKey = `${req.leave_type}_used` as string;
      const { data: bal } = await supabase.from("leave_balances")
        .select("*")
        .eq("user_id", req.user_id)
        .eq("year", currentYear)
        .maybeSingle();
      if (bal) {
        const currentUsed = Math.max(0, (Number((bal as any)[typeKey] ?? 0) || 0) - (Number(req.days) || 0));
        await supabase.from("leave_balances").update({ [typeKey]: currentUsed } as any).eq("id", bal.id);
      }

      // Notify employee if cancelled by admin
      if (req.user_id !== user!.id) {
        await supabase.from("notifications").insert({
          user_id: req.user_id,
          title: "Approved Leave Cancelled",
          message: `Your ${rowLabel(req)} (${format(parseISO(req.start_date), "dd MMM")} — ${format(parseISO(req.end_date), "dd MMM")}) has been cancelled by admin.`,
          type: "leave_rejected",
          reference_id: req.id,
          action_url: "/leave",
        });
      } else {
        // Notify admins if cancelled by employee
        const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
        if (admins) {
          for (const admin of admins) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Employee Cancelled Approved Leave",
              message: `${leaveStaffDirectory.get(req.user_id)?.first_name || "Employee"} cancelled their approved ${rowLabel(req)} (${req.days} days).`,
              type: "leave_request",
              reference_id: req.id,
              action_url: "/leave",
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balance"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["all-leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["staff-leave-inline"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      setCancelConfirmDialog(null);
      toast({ title: "Approved leave cancelled and balance restored" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetPersonalForm() {
    setStartDate(""); setEndDate(""); setReason(""); setLeaveType("annual"); setAttachmentFile(null); setIsHalfDay(false);
  }

  function resetTeamForm() {
    setOnBehalfUserId(""); setTeamStartDate(""); setTeamEndDate(""); setTeamReason(""); setTeamLeaveType("annual"); setTeamAttachmentFile(null); setTeamIsHalfDay(false);
  }

  const standardBalanceCards = balance ? [
    { label: "Annual", total: balance.annual_total, used: balance.annual_used },
    { label: "Medical", total: balance.medical_total, used: balance.medical_used },
    { label: "Hospitalisation", total: (balance as any).hospitalisation_total ?? 60, used: (balance as any).hospitalisation_used ?? 0 },
    { label: "Maternity", total: balance.maternity_total, used: balance.maternity_used },
    { label: "Paternity", total: balance.paternity_total, used: balance.paternity_used },
    { label: "Emergency", total: balance.emergency_total, used: balance.emergency_used },
    { label: "Compassionate", total: (balance as any).compassionate_total ?? 3, used: (balance as any).compassionate_used ?? 0 },
    { label: "Replacement", total: (balance as any).replacement_total ?? 0, used: (balance as any).replacement_used ?? 0 },
    { label: "Unpaid", total: (balance as any).unpaid_total ?? 10, used: balance.unpaid_used ?? 0 },
    { label: "Birthday", total: (balance as any).birthday_total ?? 1, used: (balance as any).birthday_used ?? 0 },
  ].map((c) => ({ ...c, total: Number(c.total) || 0, used: Number(c.used) || 0 })) : [];

  // Include all active custom leave types — show 0/default if no balance row exists yet
  const customBalanceCards = (customLeaveTypes as any[])
    .filter((t) => t.is_active)
    .map((t) => {
      const bal = (myCustomBalances as any[]).find((b) => b.custom_leave_type_id === t.id);
      return {
        label: t.name,
        total: bal?.total ?? t.default_days ?? 0,
        used: bal?.used ?? 0,
        isCustom: true,
      };
    });

  const balanceCards = [...standardBalanceCards, ...customBalanceCards];

  // --- Report filtered data ---
  const reportData = useMemo(() => {
    return branchRequests.filter((r: any) => {
      if (reportEmployee !== "all" && r.user_id !== reportEmployee) return false;
      if (reportLeaveType !== "all" && r.leave_type !== reportLeaveType) return false;
      if (reportStatus !== "all") {
        const display = getStatusDisplay(r, role);
        if (reportStatus !== display) return false;
      }
      if (reportStartDate && r.start_date < reportStartDate) return false;
      if (reportEndDate && r.end_date > reportEndDate) return false;
      return true;
    });
  }, [branchRequests, reportEmployee, reportLeaveType, reportStatus, reportStartDate, reportEndDate, role]);

  // --- History data ---
  const historyData = useMemo(() => {
    const policyData = hrPolicies?.policy_data as any;
    const defaults: Record<string, number> = {
      annual: policyData?.annual_leave ?? 14,
      medical: policyData?.medical_leave ?? 14,
      maternity: policyData?.maternity_leave ?? 98,
      paternity: policyData?.paternity_leave ?? 7,
      emergency: policyData?.emergency_leave ?? 2,
      compassionate: policyData?.compassionate_leave ?? 3,
      replacement: policyData?.replacement_leave ?? 0,
      unpaid: policyData?.unpaid_leave ?? 10,
    };

    const balanceMap = new Map<string, any>();
    allBalances.forEach((b: any) => balanceMap.set(b.user_id, b));

    // Build CF map: userId -> { type: days }
    const cfMap = new Map<string, Record<string, number>>();
    allCFLogs.forEach((log: any) => {
      if (!cfMap.has(log.user_id)) cfMap.set(log.user_id, {});
      cfMap.get(log.user_id)![log.leave_type] = Number(log.days_carried);
    });

    return branchProfiles.map((p: any) => {
      const bal = balanceMap.get(p.id);
      const cf = cfMap.get(p.id) ?? {};
      const row: any = {
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email,
      };
      leaveTypeKeys.forEach((type) => {
        const totalKey = `${type}_total`;
        const usedKey = `${type}_used`;
        row[`${type}_used`] = bal ? (bal[usedKey] ?? 0) : 0;
        row[`${type}_total`] = bal ? (bal[totalKey] ?? defaults[type]) : defaults[type];
        row[`${type}_cf`] = cf[type] ?? 0;
      });
      return row;
    });
  }, [branchProfiles, allBalances, hrPolicies, allCFLogs]);

  // --- Overlap warnings ---
  const personalOverlaps = useMemo(() => {
    if (!startDate || !endDate) return [];
    return getOverlappingLeaves(startDate, endDate, user?.id);
  }, [startDate, endDate, branchRequests, user?.id]);

  const teamOverlaps = useMemo(() => {
    if (!teamStartDate || !teamEndDate) return [];
    return getOverlappingLeaves(teamStartDate, teamEndDate, onBehalfUserId);
  }, [teamStartDate, teamEndDate, onBehalfUserId, branchRequests]);

  // --- Download helpers ---
  function getFilterSummary() {
    const parts: string[] = [];
    if (reportStartDate) parts.push(`From: ${format(parseISO(reportStartDate), "dd MMM yyyy")}`);
    if (reportEndDate) parts.push(`To: ${format(parseISO(reportEndDate), "dd MMM yyyy")}`);
    if (reportEmployee !== "all") {
      const s = leaveStaffDirectory.get(reportEmployee);
      parts.push(`Employee: ${s ? `${s.first_name} ${s.last_name}`.trim() : reportEmployee}`);
    }
    if (reportLeaveType !== "all") parts.push(`Type: ${labelFor(reportLeaveType)}`);
    if (reportStatus !== "all") parts.push(`Status: ${statusLabels[reportStatus]}`);
    return parts.length > 0 ? parts.join(" | ") : "All records";
  }

  function getReportRows() {
    return reportData.map((r: any, idx: number) => {
      const display = getStatusDisplay(r, role);
      const staff = leaveStaffDirectory.get(r.user_id);
      return {
        no: idx + 1,
        name: staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() : "—",
        status: statusLabels[display] || display,
        leaveType: rowLabel(r),
        startDate: format(parseISO(r.start_date), "dd MMM yyyy"),
        endDate: format(parseISO(r.end_date), "dd MMM yyyy"),
        days: r.days,
        applyDate: format(parseISO(r.created_at), "dd MMM yyyy"),
        approvalDate: r.reviewed_at ? format(parseISO(r.reviewed_at), "dd MMM yyyy") : "—",
      };
    });
  }

  function downloadExcel() {
    const rows = getReportRows();
    const wsData = [
      ["No.", "Name", "Status", "Leave Type", "Start Date", "End Date", "Days", "Apply Date", "Approval Date"],
      ...rows.map((r) => [r.no, r.name, r.status, r.leaveType, r.startDate, r.endDate, r.days, r.applyDate, r.approvalDate]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 5 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 6 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leave Report");
    const branchName = branches.find((b: any) => b.id === branchId)?.name || "Branch";
    XLSX.writeFile(wb, `Leave_Report_${branchName}_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  function downloadPDF() {
    const printEl = printRef.current;
    if (!printEl) return;
    printEl.classList.remove("hidden");
    printEl.classList.add("block");
    window.print();
    setTimeout(() => {
      printEl.classList.add("hidden");
      printEl.classList.remove("block");
    }, 500);
  }

  function getActionButtons(r: any) {
    const display = getStatusDisplay(r, role);
    const approveLabel = leaveL2Required ? "Approve L1" : "Approve";
    
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
    if (isSuperAdmin && leaveL2Required && display === "level1_approved") {
      return (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="text-success" onClick={() => { setReviewDialog({ ...r, _level: 2, _action: "approve" }); setReviewNotes(""); }}>
            <Check className="h-3 w-3 mr-1" /> Approve L2
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReviewDialog({ ...r, _level: 2, _action: "reject" }); setReviewNotes(""); }}>
            <X className="h-3 w-3 mr-1" /> Reject
          </Button>
        </div>
      );
    }
    // Cancel approved leave (admin can cancel; future-dated only for employee)
    if (display === "approved" && isManager) {
      return (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelConfirmDialog(r)}>
          <XCircle className="h-3 w-3 mr-1" /> Cancel
        </Button>
      );
    }
    return null;
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const branchName = branches.find((b: any) => b.id === branchId)?.name || "";

  const printData = {
    title: "Leave Report",
    branchName,
    logoUrl: branchSettings?.logo_url || undefined,
    schoolName: branchSettings?.school_display_name || branchName,
    schoolAddress: branchSettings?.address_line || undefined,
    schoolPhone: branchSettings?.phone || undefined,
    schoolEmail: branchSettings?.email || undefined,
    filterSummary: getFilterSummary(),
    generatedAt: format(new Date(), "dd MMM yyyy, hh:mm a"),
    rows: getReportRows(),
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(location.state as any)?.from === "/staff-attendance" && (
              <Button variant="ghost" size="sm" onClick={() => nav("/staff-attendance")}>← Back</Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">Leave Management</h1>
              <p className="text-sm text-muted-foreground mt-1">Multi-level approval workflow per Employment Act 1955</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
          </div>
        </div>

        <Tabs defaultValue={isManager ? "team" : "my"}>
          <TabsList>
            <TabsTrigger value="my">My Requests</TabsTrigger>
            {isManager && <TabsTrigger value="team">Team Requests</TabsTrigger>}
            {isManager && <TabsTrigger value="report">Report</TabsTrigger>}
            {isManager && <TabsTrigger value="history">History</TabsTrigger>}
          </TabsList>

          {/* ── My Requests ── */}
          <TabsContent value="my">
            <div className="flex items-center justify-between mb-4">
              <div />
              <Button onClick={() => setShowApplyDialog(true)}>
                <Plus className="h-4 w-4 mr-2" /> Apply Leave
              </Button>
            </div>
            {balanceCards.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    My Leave Balances ({currentYear})
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {balanceCards.map((b: any) => {
                    const totalNum = Number(b.total ?? 0);
                    const usedNum = Number(b.used ?? 0);
                    const remaining = b.total != null ? Math.max(0, totalNum - usedNum) : null;
                    const pct = totalNum > 0 ? Math.min(100, (usedNum / totalNum) * 100) : 0;
                    return (
                      <Card key={b.label} className={b.isCustom ? "border-primary/40" : ""}>
                        <CardContent className="p-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground truncate" title={b.label}>{b.label}</p>
                            {b.isCustom && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">Custom</Badge>}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-foreground leading-none">
                              {remaining != null ? fmtDays(remaining) : fmtDays(usedNum)}
                            </span>
                            {b.total != null && (
                              <span className="text-xs text-muted-foreground">/ {fmtDays(totalNum)} days left</span>
                            )}
                            {b.total == null && (
                              <span className="text-xs text-muted-foreground">days taken</span>
                            )}
                          </div>
                          {b.total != null && b.total > 0 ? (
                            <>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-destructive" : pct >= 75 ? "bg-warning/100" : "bg-primary"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground">Used {fmtDays(usedNum)} of {fmtDays(totalNum)}</p>
                            </>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">No yearly cap</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                {myRequests.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No leave requests yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Attachment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approval</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myRequests.map((r: any) => {
                        const display = getStatusDisplay(r, role);
                        const isFutureApproved = display === "approved" && isAfter(new Date(r.start_date), new Date());
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              {rowLabel(r)}
                              {r.is_half_day && <Badge variant="outline" className="ml-1 text-[9px]">½</Badge>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(parseISO(r.start_date), "dd MMM")} — {format(parseISO(r.end_date), "dd MMM yyyy")}
                            </TableCell>
                            <TableCell>{r.days}</TableCell>
                            <TableCell>
                              {r.attachment_url ? (
                                <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                                  <ExternalLink className="h-3 w-3" /> View
                                </a>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${statusBadgeClass[display] || ""}`}>{statusLabels[display] || display}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs space-y-0.5">
                                <div>L1: <span className={r.level1_status === "approved" ? "text-success" : "text-muted-foreground"}>{r.level1_status}</span></div>
                                <div>L2: <span className={r.level2_status === "approved" ? "text-success" : "text-muted-foreground"}>{r.level2_status}</span></div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {display === "pending" && (
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelMutation.mutate(r.id)}>
                                    <XCircle className="h-3 w-3 mr-1" /> Cancel
                                  </Button>
                                )}
                                {isFutureApproved && (
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelConfirmDialog(r)}>
                                    <XCircle className="h-3 w-3 mr-1" /> Cancel
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => setDetailDialog(r)}>View</Button>
                              </div>
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

          {/* ── Team Requests ── */}
          {isManager && (
            <TabsContent value="team">
              <div className="flex items-center justify-end mb-4">
                <Button onClick={() => setShowTeamApplyDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" /> Apply Leave on Behalf
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  {branchRequests.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No leave requests for this branch</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Attachment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchRequests.map((r: any) => {
                          const display = getStatusDisplay(r, role);
                          return (
                            <TableRow key={r.id}>
                              <TableCell>
                                <p className="font-medium">{leaveStaffDirectory.get(r.user_id)?.first_name} {leaveStaffDirectory.get(r.user_id)?.last_name}</p>
                                <p className="text-xs text-muted-foreground">{leaveStaffDirectory.get(r.user_id)?.email}</p>
                                {(() => {
                                  const supId = supervisorMap.get(r.user_id);
                                  const sup = supId ? leaveStaffDirectory.get(supId) : null;
                                  return sup ? (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Supervisor: {sup.first_name} {sup.last_name}</p>
                                  ) : null;
                                })()}
                                {r.applied_on_behalf_by && (() => {
                                  const admin = leaveStaffDirectory.get(r.applied_on_behalf_by);
                                  return (
                                    <Badge variant="outline" className="text-[9px] mt-0.5">
                                      Applied by {admin ? `${admin.first_name || ""} ${admin.last_name || ""}`.trim() : "admin"}
                                    </Badge>
                                  );
                                })()}
                              </TableCell>
                              <TableCell>
                                {rowLabel(r)}
                                {r.is_half_day && <Badge variant="outline" className="ml-1 text-[9px]">½</Badge>}
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(parseISO(r.start_date), "dd MMM")} — {format(parseISO(r.end_date), "dd MMM")}
                              </TableCell>
                              <TableCell>{r.days}</TableCell>
                              <TableCell>
                                {r.reason ? (
                                  <span className="text-sm" title={r.reason}>
                                    {r.reason.length > 50 ? r.reason.slice(0, 50) + "…" : r.reason}
                                  </span>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                {r.attachment_url ? (
                                  <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                                    <ExternalLink className="h-3 w-3" /> MC/Proof
                                  </a>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell>
                                <Badge className={`text-xs ${statusBadgeClass[display] || ""}`}>{statusLabels[display] || display}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{getActionButtons(r)}</TableCell>
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

          {/* ── Report Tab ── */}
          {isManager && (
            <TabsContent value="report">
              <Card className="mb-4">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <Label className="text-xs">Start Date</Label>
                      <Input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">End Date</Label>
                      <Input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Employee</Label>
                      <Select value={reportEmployee} onValueChange={setReportEmployee}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Staff</SelectItem>
                          {branchProfiles.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.first_name} {p.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Leave Type</Label>
                      <Select value={reportLeaveType} onValueChange={setReportLeaveType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {Object.entries(leaveTypeLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={reportStatus} onValueChange={setReportStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          {Object.entries(statusLabels).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Download buttons */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{reportData.length} record(s) found</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadExcel} disabled={reportData.length === 0}>
                    <Download className="h-3 w-3 mr-1" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadPDF} disabled={reportData.length === 0}>
                    <FileText className="h-3 w-3 mr-1" /> PDF
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  {reportData.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No leave records match the selected filters</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">No.</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Leave Type</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Apply Date</TableHead>
                          <TableHead>Approval Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.map((r: any, idx: number) => {
                          const display = getStatusDisplay(r, role);
                          const staff = leaveStaffDirectory.get(r.user_id);
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="font-medium">{staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() : "—"}</TableCell>
                              <TableCell>
                                <Badge className={`text-xs ${statusBadgeClass[display] || ""}`}>{statusLabels[display] || display}</Badge>
                              </TableCell>
                              <TableCell>{rowLabel(r)}</TableCell>
                              <TableCell>{format(parseISO(r.start_date), "dd MMM yyyy")}</TableCell>
                              <TableCell>{format(parseISO(r.end_date), "dd MMM yyyy")}</TableCell>
                              <TableCell>{r.days}</TableCell>
                              <TableCell>{format(parseISO(r.created_at), "dd MMM yyyy")}</TableCell>
                              <TableCell>{r.reviewed_at ? format(parseISO(r.reviewed_at), "dd MMM yyyy") : "—"}</TableCell>
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

          {/* ── History Tab ── */}
          {isManager && (
            <TabsContent value="history">
              <div className="flex items-center gap-3 mb-4">
                <Label className="text-sm font-medium">Year</Label>
                <Select value={String(historyYear)} onValueChange={(v) => setHistoryYear(Number(v))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Card>
                <CardContent className="p-0">
                  {historyData.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No staff found in this branch</div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">No.</TableHead>
                            <TableHead className="min-w-[140px]">Name</TableHead>
                            {leaveTypeKeys.map((type) => (
                              <TableHead key={type} className="text-center min-w-[90px]">
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {historyData.map((row: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="font-medium">{row.name}</TableCell>
                              {leaveTypeKeys.map((type) => (
                                <TableCell key={type} className="text-center text-sm">
                                  {row[`${type}_total`] != null ? (
                                    <span>
                                      <span className="font-semibold">{row[`${type}_used`]}</span>
                                      <span className="text-muted-foreground">/{row[`${type}_total`]}</span>
                                      {row[`${type}_cf`] > 0 && (
                                        <span className="ml-1 text-[10px] text-primary font-medium" title="Carried Forward">
                                          (+{row[`${type}_cf`]} CF)
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="font-semibold">{row[`${type}_used`]}</span>
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Personal Apply Leave Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
            <DialogDescription>Submit a leave request. Requires approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={(v) => { setLeaveType(v); setAttachmentFile(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {leaveTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            {startDate && endDate && startDate === endDate && (
              <div className="flex items-center gap-2">
                <Switch checked={isHalfDay} onCheckedChange={setIsHalfDay} id="half-day" />
                <Label htmlFor="half-day" className="text-sm">Half day (0.5 days)</Label>
              </div>
            )}
            {startDate && endDate && (
              <p className="text-sm text-muted-foreground">
                {calcDays(startDate, endDate, isHalfDay)} day(s)
              </p>
            )}
            {/* Balance warning */}
            {leaveType !== "unpaid" && startDate && endDate && (() => {
              const remaining = getBalanceRemaining(user!.id, leaveType);
              const days = calcDays(startDate, endDate, isHalfDay);
              if (remaining !== null && days > remaining) {
                return (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Insufficient balance! Remaining: {remaining} day(s). Consider applying as Unpaid Leave.</span>
                  </div>
                );
              }
              return null;
            })()}
            {/* Overlap warning */}
            {personalOverlaps.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning border border-warning/25">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Overlap: {personalOverlaps.join(", ")} also on leave during this period.</span>
              </div>
            )}
            <div>
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="State your reason for leave..." />
            </div>
            <div>
              <Label>
                Supporting Document {isAttachmentRequired ? (
                  <span className="text-destructive font-normal">(Required — {leaveType === "medical" ? "MC" : leaveType === "hospitalisation" ? "hospital document" : "proof"})</span>
                ) : (
                  <span className="text-muted-foreground font-normal">(Optional)</span>
                )}
              </Label>
              <div className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input p-3 hover:bg-muted/50">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{attachmentFile ? attachmentFile.name : "Click to upload document"}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApplyDialog(false); resetPersonalForm(); }}>Cancel</Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!startDate || !endDate || !reason.trim() || (isAttachmentRequired && !attachmentFile) || applyMutation.isPending}
            >
              {applyMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* On-Behalf Apply Leave Dialog */}
      <Dialog open={showTeamApplyDialog} onOpenChange={setShowTeamApplyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply Leave on Behalf</DialogTitle>
            <DialogDescription>Create a leave record for a team member. L1 will be auto-approved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={onBehalfUserId} onValueChange={setOnBehalfUserId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {branchProfiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={teamLeaveType} onValueChange={(v) => { setTeamLeaveType(v); setTeamAttachmentFile(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {leaveTypeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={teamStartDate} onChange={(e) => setTeamStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={teamEndDate} onChange={(e) => setTeamEndDate(e.target.value)} />
              </div>
            </div>
            {teamStartDate && teamEndDate && teamStartDate === teamEndDate && (
              <div className="flex items-center gap-2">
                <Switch checked={teamIsHalfDay} onCheckedChange={setTeamIsHalfDay} id="team-half-day" />
                <Label htmlFor="team-half-day" className="text-sm">Half day (0.5 days)</Label>
              </div>
            )}
            {teamStartDate && teamEndDate && (
              <p className="text-sm text-muted-foreground">
                {calcDays(teamStartDate, teamEndDate, teamIsHalfDay)} day(s)
              </p>
            )}
            {/* Balance warning */}
            {onBehalfUserId && teamLeaveType !== "unpaid" && teamStartDate && teamEndDate && (() => {
              const remaining = getBalanceRemaining(onBehalfUserId, teamLeaveType);
              const days = calcDays(teamStartDate, teamEndDate, teamIsHalfDay);
              if (remaining !== null && days > remaining) {
                return (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Insufficient balance! Remaining: {remaining} day(s).</span>
                  </div>
                );
              }
              return null;
            })()}
            {/* Overlap warning */}
            {teamOverlaps.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning border border-warning/25">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Overlap: {teamOverlaps.join(", ")} also on leave during this period.</span>
              </div>
            )}
            <div>
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={teamReason} onChange={(e) => setTeamReason(e.target.value)} placeholder="State the reason..." />
            </div>
            <div>
              <Label>
                Supporting Document {isTeamAttachmentRequired ? (
                  <span className="text-destructive font-normal">(Required)</span>
                ) : (
                  <span className="text-muted-foreground font-normal">(Optional)</span>
                )}
              </Label>
              <div className="mt-1">
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-input p-3 hover:bg-muted/50">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{teamAttachmentFile ? teamAttachmentFile.name : "Click to upload document"}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setTeamAttachmentFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTeamApplyDialog(false); resetTeamForm(); }}>Cancel</Button>
            <Button
              onClick={() => onBehalfMutation.mutate()}
              disabled={!onBehalfUserId || !teamStartDate || !teamEndDate || !teamReason.trim() || (isTeamAttachmentRequired && !teamAttachmentFile) || onBehalfMutation.isPending}
            >
              {onBehalfMutation.isPending ? "Submitting..." : "Submit on Behalf"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Approved Leave Confirmation */}
      <Dialog open={!!cancelConfirmDialog} onOpenChange={() => setCancelConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Approved Leave</DialogTitle>
            <DialogDescription>
              This will cancel the approved leave and restore the balance.
            </DialogDescription>
          </DialogHeader>
          {cancelConfirmDialog && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p><strong>Employee:</strong> {leaveStaffDirectory.get(cancelConfirmDialog.user_id)?.first_name || "—"} {leaveStaffDirectory.get(cancelConfirmDialog.user_id)?.last_name || ""}</p>
                <p><strong>Type:</strong> {rowLabel(cancelConfirmDialog)}</p>
                <p><strong>Period:</strong> {format(parseISO(cancelConfirmDialog.start_date), "dd MMM yyyy")} — {format(parseISO(cancelConfirmDialog.end_date), "dd MMM yyyy")}</p>
                <p><strong>Days:</strong> {cancelConfirmDialog.days}</p>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>The leave balance will be reversed. The employee will be notified.</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmDialog(null)}>No, Keep It</Button>
            <Button
              variant="destructive"
              onClick={() => cancelConfirmDialog && cancelApprovedMutation.mutate(cancelConfirmDialog)}
              disabled={cancelApprovedMutation.isPending}
            >
              {cancelApprovedMutation.isPending ? "Cancelling..." : "Yes, Cancel Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?._action === "reject" ? "Reject" : "Approve"} Leave — Level {reviewDialog?._level}
            </DialogTitle>
            <DialogDescription>
              {leaveStaffDirectory.get(reviewDialog?.user_id)?.first_name} {leaveStaffDirectory.get(reviewDialog?.user_id)?.last_name} — {rowLabel(reviewDialog)} ({reviewDialog?.days} days)
            </DialogDescription>
          </DialogHeader>
          {reviewDialog?.reason && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-foreground">{reviewDialog.reason}</p>
            </div>
          )}
          {reviewDialog?.attachment_url && (
            <a href={reviewDialog.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> View Attachment (MC/Proof)
            </a>
          )}
          {reviewDialog?.level1_status === "approved" && reviewDialog?._level === 2 && (
            <div className="rounded-md bg-info/10 p-3 text-sm text-info">
              ✓ Level 1 approved on {reviewDialog.level1_approved_at ? format(parseISO(reviewDialog.level1_approved_at), "dd MMM yyyy HH:mm") : "—"}
            </div>
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

      {/* Detail Dialog */}
      <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>{rowLabel(detailDialog)}</DialogDescription>
          </DialogHeader>
          {detailDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Period:</span> {format(parseISO(detailDialog.start_date), "dd MMM yyyy")} — {format(parseISO(detailDialog.end_date), "dd MMM yyyy")}</div>
                <div><span className="text-muted-foreground">Days:</span> {detailDialog.days}{detailDialog.is_half_day ? " (half day)" : ""}</div>
              </div>
              {detailDialog.reason && (
                <div className="text-sm"><span className="text-muted-foreground">Reason:</span> {detailDialog.reason}</div>
              )}
              {detailDialog.attachment_url && (
                <a href={detailDialog.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> View Attachment
                </a>
              )}
              {detailDialog.applied_on_behalf_by && (
                <div className="text-xs text-muted-foreground">Applied on behalf by admin</div>
              )}
              {detailDialog.cancelled_at && (
                <div className="text-xs text-destructive">Cancelled on {format(parseISO(detailDialog.cancelled_at), "dd MMM yyyy HH:mm")}</div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Approval Timeline</p>
                <div className="border rounded-md divide-y text-sm">
                  <div className="p-3 flex justify-between items-center">
                    <span>Level 1 (Branch Manager)</span>
                    <div className="text-right">
                      <Badge className={`text-xs ${detailDialog.level1_status === "approved" ? "bg-success/10 text-success" : detailDialog.level1_status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {detailDialog.level1_status}
                      </Badge>
                      {detailDialog.level1_approved_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{format(parseISO(detailDialog.level1_approved_at), "dd MMM yyyy HH:mm")}</p>
                      )}
                    </div>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span>Level 2 (HQ Admin)</span>
                    <div className="text-right">
                      <Badge className={`text-xs ${detailDialog.level2_status === "approved" ? "bg-success/10 text-success" : detailDialog.level2_status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {detailDialog.level2_status}
                      </Badge>
                      {detailDialog.level2_approved_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{format(parseISO(detailDialog.level2_approved_at), "dd MMM yyyy HH:mm")}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Print View for PDF */}
      <LeaveReportPrintView ref={printRef} data={printData} />
    </DashboardLayout>
  );
}
