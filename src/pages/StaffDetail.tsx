import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import StaffDocumentUpload from "@/components/StaffDocumentUpload";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Save, Link2, AlertCircle, DollarSign, Clock, Briefcase, FileText, CalendarDays, Info, ArrowRightLeft, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import ResignationDialog from "@/components/staff/ResignationDialog";
import SalaryComponentsCard from "@/components/staff/SalaryComponentsCard";
import { uploadAndSign } from "@/lib/storage/signedUrl";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranches } from "@/hooks/use-branches";
import { Building2, Plus, X } from "lucide-react";
import { getRoleLabel } from "@/lib/auth";

const BANKS = ["Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Rakyat", "Bank Islam", "Affin Bank", "Alliance Bank", "OCBC Bank", "HSBC Bank", "Standard Chartered", "UOB", "Bank Muamalat", "BSN"];

const DESIGNATIONS = [
  { value: "administrator", label: "Administrator" },
  { value: "assistant_teacher", label: "Assistant Teacher" },
  { value: "teacher", label: "Teacher" },
  { value: "senior_teacher", label: "Senior Teacher" },
  { value: "assistant_principal", label: "Assistant Principal" },
  { value: "principal", label: "Principal" },
  { value: "bud", label: "Business Unit Development (BUD)" },
  { value: "finance_manager", label: "Finance Manager" },
  { value: "other", label: "Other" },
];

export default function StaffDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canManage = role === "super_admin" || role === "franchisee" || role === "admin";

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: staffProfile, isLoading: loadingSP } = useQuery({
    queryKey: ["staff-profile", id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("*").eq("user_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: designation } = useQuery({
    queryKey: ["staff-designation", id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_designations").select("*").eq("user_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: staffBranch } = useQuery({
    queryKey: ["staff-branch", id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", id!).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: branchStaff = [] } = useQuery({
    queryKey: ["branch-staff-hierarchy", staffBranch?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("user_id").eq("branch_id", staffBranch!.branch_id);
      const userIds = (data ?? []).map((m: any) => m.user_id).filter((uid: string) => uid !== id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds);
      return profiles ?? [];
    },
    enabled: !!staffBranch?.branch_id && canManage,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ["leave-balances", id],
    queryFn: async () => {
      const { data } = await supabase.from("leave_balances").select("*").eq("user_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch master HR leave defaults for fallback
  const { data: masterLeaveDefaults } = useQuery({
    queryKey: ["hr-policy-leave-defaults", staffBranch?.branch_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_policies")
        .select("policy_data")
        .eq("branch_id", staffBranch!.branch_id)
        .eq("policy_type", "leave_defaults")
        .maybeSingle();
      return data?.policy_data as Record<string, number> | null;
    },
    enabled: !!staffBranch?.branch_id,
  });

  const { data: recentPayroll = [] } = useQuery({
    queryKey: ["recent-payroll", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_records")
        .select("*")
        .eq("user_id", id!)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!id,
  });

  const [form, setForm] = useState<any>({});
  const [initialized, setInitialized] = useState(false);
  const [profileForm, setProfileForm] = useState<{ first_name: string; last_name: string; email: string }>({ first_name: "", last_name: "", email: "" });
  const [profileInitialized, setProfileInitialized] = useState(false);
  const [leaveForm, setLeaveForm] = useState<any>({});
  const [leaveFormInit, setLeaveFormInit] = useState(false);

  useEffect(() => {
    if (staffProfile && !initialized) {
      setForm({ ...staffProfile });
      setInitialized(true);
    }
  }, [staffProfile, initialized]);

  useEffect(() => {
    if (profile && !profileInitialized) {
      setProfileForm({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        email: profile.email ?? "",
      });
      setProfileInitialized(true);
    }
  }, [profile, profileInitialized]);

  useEffect(() => {
    if (leaveBalances.length > 0 && !leaveFormInit) {
      const lb = leaveBalances[0] as any;
      setLeaveForm({
        annual_total: lb.annual_total ?? 8,
        medical_total: lb.medical_total ?? 14,
        hospitalisation_total: lb.hospitalisation_total ?? 60,
        maternity_total: lb.maternity_total ?? 60,
        paternity_total: lb.paternity_total ?? 7,
        emergency_total: lb.emergency_total ?? 2,
        compassionate_total: lb.compassionate_total ?? 3,
        replacement_total: lb.replacement_total ?? 0,
        unpaid_total: lb.unpaid_total ?? 0,
        annual_used: lb.annual_used ?? 0,
        medical_used: lb.medical_used ?? 0,
        hospitalisation_used: lb.hospitalisation_used ?? 0,
        maternity_used: lb.maternity_used ?? 0,
        paternity_used: lb.paternity_used ?? 0,
        emergency_used: lb.emergency_used ?? 0,
        compassionate_used: lb.compassionate_used ?? 0,
        replacement_used: lb.replacement_used ?? 0,
        unpaid_used: lb.unpaid_used ?? 0,
      });
      setLeaveFormInit(true);
    } else if (leaveBalances.length === 0 && masterLeaveDefaults && !leaveFormInit) {
      setLeaveForm({
        annual_total: (masterLeaveDefaults as any).annual_total ?? 8,
        medical_total: (masterLeaveDefaults as any).medical_total ?? 14,
        hospitalisation_total: (masterLeaveDefaults as any).hospitalisation_total ?? 60,
        maternity_total: (masterLeaveDefaults as any).maternity_total ?? 60,
        paternity_total: (masterLeaveDefaults as any).paternity_total ?? 7,
        emergency_total: (masterLeaveDefaults as any).emergency_total ?? 2,
        compassionate_total: (masterLeaveDefaults as any).compassionate_total ?? 3,
        replacement_total: (masterLeaveDefaults as any).replacement_total ?? 0,
        unpaid_total: (masterLeaveDefaults as any).unpaid_total ?? 0,
        annual_used: 0, medical_used: 0, hospitalisation_used: 0, maternity_used: 0,
        paternity_used: 0, emergency_used: 0, compassionate_used: 0, replacement_used: 0, unpaid_used: 0,
      });
      setLeaveFormInit(true);
    }
  }, [leaveBalances, masterLeaveDefaults, leaveFormInit]);

  const hasLeaveRecord = leaveBalances.length > 0;

  // Custom leave types defined for this branch
  const { data: customLeaveTypes = [] } = useQuery({
    queryKey: ["custom-leave-types", staffBranch?.branch_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_leave_types" as any)
        .select("*")
        .eq("branch_id", staffBranch!.branch_id)
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as any[];
    },
    enabled: !!staffBranch?.branch_id,
  });

  const currentYear = new Date().getFullYear();

  const { data: customLeaveBalances = [] } = useQuery({
    queryKey: ["custom-leave-balances", id, currentYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_leave_balances" as any)
        .select("*")
        .eq("user_id", id!)
        .eq("year", currentYear);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const [customLeaveForm, setCustomLeaveForm] = useState<Record<string, { total: number; used: number }>>({});

  // Reactively merge latest types & balances. Preserve any in-progress edits
  // by only filling rows that don't yet exist in the form state.
  useEffect(() => {
    if (customLeaveTypes.length === 0) return;
    setCustomLeaveForm((prev) => {
      const next = { ...prev };
      for (const t of customLeaveTypes) {
        if (next[t.id]) continue;
        const bal = customLeaveBalances.find((b: any) => b.custom_leave_type_id === t.id);
        next[t.id] = {
          total: bal?.total ?? t.default_days ?? 0,
          used: bal?.used ?? 0,
        };
      }
      return next;
    });
  }, [customLeaveTypes, customLeaveBalances]);

  const saveCustomLeaveMutation = useMutation({
    mutationFn: async () => {
      if (!staffBranch?.branch_id) throw new Error("No branch");
      const rows = customLeaveTypes.map((t: any) => ({
        user_id: id!,
        branch_id: staffBranch.branch_id,
        custom_leave_type_id: t.id,
        year: currentYear,
        total: customLeaveForm[t.id]?.total ?? 0,
        used: customLeaveForm[t.id]?.used ?? 0,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("custom_leave_balances" as any)
        .upsert(rows, { onConflict: "user_id,custom_leave_type_id,year" } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Custom leave entitlements saved" });
      queryClient.invalidateQueries({ queryKey: ["custom-leave-balances", id, currentYear] });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const saveLeaveBalanceMutation = useMutation({
    mutationFn: async () => {
      if (hasLeaveRecord) {
        const lb = leaveBalances[0] as any;
        const { error } = await supabase
          .from("leave_balances")
          .update({
            annual_total: leaveForm.annual_total,
            medical_total: leaveForm.medical_total,
            hospitalisation_total: leaveForm.hospitalisation_total,
            maternity_total: leaveForm.maternity_total,
            paternity_total: leaveForm.paternity_total,
            emergency_total: leaveForm.emergency_total,
            compassionate_total: leaveForm.compassionate_total,
            replacement_total: leaveForm.replacement_total,
            unpaid_total: leaveForm.unpaid_total,
            annual_used: leaveForm.annual_used,
            medical_used: leaveForm.medical_used,
            hospitalisation_used: leaveForm.hospitalisation_used,
            maternity_used: leaveForm.maternity_used,
            paternity_used: leaveForm.paternity_used,
            emergency_used: leaveForm.emergency_used,
            compassionate_used: leaveForm.compassionate_used,
            replacement_used: leaveForm.replacement_used,
            unpaid_used: leaveForm.unpaid_used,
          } as any)
          .eq("id", lb.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leave_balances").insert({
          user_id: id!,
          branch_id: staffBranch!.branch_id,
          year: new Date().getFullYear(),
          annual_total: leaveForm.annual_total,
          medical_total: leaveForm.medical_total,
          hospitalisation_total: leaveForm.hospitalisation_total,
          maternity_total: leaveForm.maternity_total,
          paternity_total: leaveForm.paternity_total,
          emergency_total: leaveForm.emergency_total,
          compassionate_total: leaveForm.compassionate_total,
          replacement_total: leaveForm.replacement_total,
          unpaid_total: leaveForm.unpaid_total,
          annual_used: leaveForm.annual_used ?? 0,
          medical_used: leaveForm.medical_used ?? 0,
          hospitalisation_used: leaveForm.hospitalisation_used ?? 0,
          maternity_used: leaveForm.maternity_used ?? 0,
          paternity_used: leaveForm.paternity_used ?? 0,
          emergency_used: leaveForm.emergency_used ?? 0,
          compassionate_used: leaveForm.compassionate_used ?? 0,
          replacement_used: leaveForm.replacement_used ?? 0,
          unpaid_used: leaveForm.unpaid_used ?? 0,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: hasLeaveRecord ? "Leave entitlements updated" : "Leave entitlements created from defaults" });
      queryClient.invalidateQueries({ queryKey: ["leave-balances", id] });
    },
    onError: (e: any) => {
      let msg = e.message || "An unexpected error occurred.";
      if (msg.includes("violates row-level security")) msg = "You don't have permission to update leave entitlements.";
      if (msg.includes("duplicate key")) msg = "A leave balance record already exists for this year. Try refreshing the page.";
      toast({ title: "Failed to save leave entitlements", description: msg, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        user_id: id!,
        ic_number: form.ic_number || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        nationality: form.nationality || null,
        marital_status: form.marital_status || null,
        address: form.address || null,
        phone: form.phone || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        epf_number: form.epf_number || null,
        socso_number: form.socso_number || null,
        eis_number: form.eis_number || null,
        tax_number: form.tax_number || null,
        employment_type: form.employment_type || "full_time",
        basic_salary: form.basic_salary ?? 0,
        employment_start_date: form.employment_start_date || null,
        employment_end_date: form.employment_end_date || null,
        work_start_time: form.work_start_time || "09:00",
        work_end_time: form.work_end_time || "18:00",
        work_days: form.work_days || [1, 2, 3, 4, 5],
        overtime_rate: form.overtime_rate ?? 0,
        overtime_rate_rest_day: form.overtime_rate_rest_day ?? 0,
        overtime_rate_public_holiday: form.overtime_rate_public_holiday ?? 0,
        custom_epf_rate: form.custom_epf_rate ?? null,
        custom_socso_rate: form.custom_socso_rate ?? null,
        custom_eis_rate: form.custom_eis_rate ?? null,
        reports_to: form.reports_to || null,
        probation_duration_months: form.probation_duration_months ?? null,
        probation_end_date: form.probation_end_date || null,
        probation_status: form.probation_status || "not_applicable",
        probation_extended_until: form.probation_extended_until || null,
        work_schedule: form.work_schedule || null,
        epf_enabled: form.epf_enabled ?? true,
        socso_enabled: form.socso_enabled ?? true,
        eis_enabled: form.eis_enabled ?? true,
        exclude_from_payroll: form.exclude_from_payroll ?? false,
      };
      const { error } = await supabase.from("staff_profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      // Update profile name/email (super admin / HR only)
      if (canManage) {
        const profileUpdates: any = {};
        if (profileForm.first_name !== (profile?.first_name ?? "")) profileUpdates.first_name = profileForm.first_name || null;
        if (profileForm.last_name !== (profile?.last_name ?? "")) profileUpdates.last_name = profileForm.last_name || null;
        if (profileForm.email !== (profile?.email ?? "")) profileUpdates.email = profileForm.email || null;
        if (Object.keys(profileUpdates).length > 0) {
          const { error: pErr } = await supabase.from("profiles").update(profileUpdates).eq("id", id!);
          if (pErr) throw pErr;
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Staff profile saved" });
      queryClient.invalidateQueries({ queryKey: ["staff-profile", id] });
      queryClient.invalidateQueries({ queryKey: ["profile", id] });
    },
    onError: (e: any) => {
      let msg = e.message || "An unexpected error occurred.";
      if (msg.includes("reference_id")) msg = "A database trigger failed due to a type mismatch. Please contact support.";
      if (msg.includes("violates row-level security")) msg = "You don't have permission to update this staff profile.";
      if (msg.includes("duplicate key")) msg = "A staff profile already exists for this user.";
      if (msg.includes("null value in column")) {
        const col = msg.match(/column "(\w+)"/)?.[1];
        msg = `Required field "${col?.replace(/_/g, " ")}" is missing. Please fill it in and try again.`;
      }
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    },
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("staff_profiles")
        .update({ onboarding_token: token, onboarding_token_expires_at: expires } as any)
        .eq("user_id", id!);
      if (error) throw error;
      return token;
    },
    onSuccess: (token) => {
      const link = `${window.location.origin}/onboarding/${token}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Onboarding link copied!", description: link });
      queryClient.invalidateQueries({ queryKey: ["staff-profile", id] });
    },
    onError: (e: any) => toast({ title: "Failed to generate link", description: e.message, variant: "destructive" }),
  });

  // Editable Designation (saved to staff_designations)
  const [desigForm, setDesigForm] = useState<{ designation: string; custom_designation: string }>({
    designation: "",
    custom_designation: "",
  });
  const [desigInit, setDesigInit] = useState(false);
  useEffect(() => {
    if (!desigInit && (designation || designation === null)) {
      setDesigForm({
        designation: (designation as any)?.designation ?? "",
        custom_designation: (designation as any)?.custom_designation ?? "",
      });
      setDesigInit(true);
    }
  }, [designation, desigInit]);

  const saveDesignationMutation = useMutation({
    mutationFn: async () => {
      if (!staffBranch?.branch_id) throw new Error("Staff must be assigned to a branch first");
      if (!desigForm.designation) throw new Error("Pick a designation");
      const { error } = await supabase.from("staff_designations").upsert(
        {
          user_id: id!,
          branch_id: staffBranch.branch_id,
          designation: desigForm.designation,
          custom_designation:
            desigForm.designation === "other" ? desigForm.custom_designation : null,
        } as any,
        { onConflict: "user_id,branch_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Designation updated" });
      queryClient.invalidateQueries({ queryKey: ["staff-designation", id] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Editable Role (Super Admin only) — replaces all roles with the new one
  const { data: targetRoles = [] } = useQuery({
    queryKey: ["staff-roles", id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", id!);
      return (data ?? []).map((r: any) => r.role);
    },
    enabled: !!id,
  });
  const currentPrimaryRole =
    targetRoles.find((r: string) => r !== "parent") ?? targetRoles[0] ?? "";
  const [roleSelect, setRoleSelect] = useState<string>("");
  useEffect(() => {
    if (currentPrimaryRole && !roleSelect) setRoleSelect(currentPrimaryRole);
  }, [currentPrimaryRole, roleSelect]);

  const changeRoleMutation = useMutation({
    mutationFn: async (newRole: string) => {
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", id!)
        .neq("role", "parent");
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: id!, role: newRole as any });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["staff-roles", id] });
    },
    onError: (e: any) => toast({ title: "Couldn't change role", description: e.message, variant: "destructive" }),
  });

  const set = (key: string, value: any) => setForm((p: any) => ({ ...p, [key]: value }));

  const [showResignDialog, setShowResignDialog] = useState(false);
  const [showCFDialog, setShowCFDialog] = useState(false);
  const [cfAmounts, setCfAmounts] = useState<Record<string, number>>({});

  // Fetch carry forward policy
  const { data: cfPolicy } = useQuery({
    queryKey: ["hr-policy-cf", staffBranch?.branch_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_policies")
        .select("policy_data")
        .eq("branch_id", staffBranch!.branch_id)
        .eq("policy_type", "leave_defaults")
        .maybeSingle();
      return data?.policy_data as any;
    },
    enabled: !!staffBranch?.branch_id,
  });

  const cfEnabled = cfPolicy?.carry_forward_enabled ?? false;
  const cfMaxDays = cfPolicy?.carry_forward_max_days ?? 5;
  const cfTypes: string[] = cfPolicy?.carry_forward_types ?? ["annual"];

  const prevYear = new Date().getFullYear() - 1;
  const currYear = new Date().getFullYear();

  // Previous year balances
  const { data: prevYearBalance } = useQuery({
    queryKey: ["leave-balance-prev", id, prevYear],
    queryFn: async () => {
      const { data } = await supabase.from("leave_balances").select("*").eq("user_id", id!).eq("year", prevYear).maybeSingle();
      return data;
    },
    enabled: !!id && cfEnabled && showCFDialog,
  });

  // Existing carry forward logs for this staff
  const { data: existingCFLogs = [] } = useQuery({
    queryKey: ["cf-logs", id, prevYear, currYear],
    queryFn: async () => {
      const { data } = await supabase
        .from("carry_forward_log")
        .select("*")
        .eq("user_id", id!)
        .eq("from_year", prevYear)
        .eq("to_year", currYear);
      return data ?? [];
    },
    enabled: !!id && cfEnabled,
  });

  const alreadyCarriedForward = existingCFLogs.length > 0;

  function openCFDialog() {
    if (!prevYearBalance) {
      // Initialize defaults to 0
      const amounts: Record<string, number> = {};
      cfTypes.forEach((t: string) => { amounts[t] = 0; });
      setCfAmounts(amounts);
    } else {
      const amounts: Record<string, number> = {};
      cfTypes.forEach((t: string) => {
        const total = (prevYearBalance as any)?.[`${t}_total`] ?? 0;
        const used = (prevYearBalance as any)?.[`${t}_used`] ?? 0;
        const remaining = Math.max(0, total - used);
        amounts[t] = Math.min(remaining, cfMaxDays);
      });
      setCfAmounts(amounts);
    }
    setShowCFDialog(true);
  }

  const carryForwardMutation = useMutation({
    mutationFn: async () => {
      if (!staffBranch?.branch_id) throw new Error("No branch");
      const logs: any[] = [];
      for (const [type, days] of Object.entries(cfAmounts)) {
        if (days <= 0) continue;
        logs.push({
          user_id: id!,
          branch_id: staffBranch.branch_id,
          from_year: prevYear,
          to_year: currYear,
          leave_type: type,
          days_carried: days,
          carried_by: user!.id,
        });
        // Update current year balance
        const totalKey = `${type}_total`;
        const { data: bal } = await supabase.from("leave_balances").select("*").eq("user_id", id!).eq("year", currYear).maybeSingle();
        if (bal) {
          const newTotal = ((bal as any)[totalKey] ?? 0) + days;
          await supabase.from("leave_balances").update({ [totalKey]: newTotal } as any).eq("id", bal.id);
        } else {
          // Create a new balance record with the CF days added to defaults
          const defaultTotal = (masterLeaveDefaults as any)?.[totalKey] ?? 0;
          await supabase.from("leave_balances").insert({
            user_id: id!,
            branch_id: staffBranch.branch_id,
            year: currYear,
            [totalKey]: defaultTotal + days,
          } as any);
        }
      }
      if (logs.length > 0) {
        const { error } = await supabase.from("carry_forward_log").insert(logs);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances", id] });
      queryClient.invalidateQueries({ queryKey: ["cf-logs", id] });
      setShowCFDialog(false);
      toast({ title: "Leave balances carried forward successfully" });
    },
    onError: (e: any) => toast({ title: "Carry forward failed", description: e.message, variant: "destructive" }),
  });

  const resignMutation = useMutation({
    mutationFn: async ({ status, lastWorkingDate, letterFile }: {
      status: string; lastWorkingDate: string; letterFile: File;
    }) => {
      const ext = letterFile.name.split(".").pop() || "pdf";
      const path = `${id}/resignation/${Date.now()}-resignation-letter.${ext}`;
      const fileUrl = await uploadAndSign("staff-documents", path, letterFile);
      const { error: docErr } = await supabase.from("staff_documents" as any).insert({
        user_id: id,
        document_type: "resignation_letter",
        file_url: fileUrl,
        file_name: letterFile.name,
        notes: `Separation: ${status}`,
        uploaded_by: user?.id,
      } as any);
      if (docErr) throw docErr;

      const updates: any = {
        employment_status: status,
        resignation_date: lastWorkingDate,
        last_working_date: lastWorkingDate,
      };
      if (status === "resigned" || status === "terminated") {
        updates.is_active = false;
      }
      const { error } = await supabase.from("staff_profiles").update(updates).eq("user_id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile", id] });
      queryClient.invalidateQueries({ queryKey: ["staff-documents", id] });
      setShowResignDialog(false);
      toast({ title: "Separation processed" });
    },
    onError: (e: any) => {
      let msg = e.message || "An unexpected error occurred.";
      if (msg.includes("violates row-level security")) msg = "You don't have permission to process this separation.";
      toast({ title: "Separation failed", description: msg, variant: "destructive" });
    },
  });

  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("staff_profiles")
        .update({ employment_status: "active", is_active: true, resignation_date: null, resignation_reason: null, last_working_date: null } as any)
        .eq("user_id", id!);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null,
        action: "restore_staff",
        target_type: "staff",
        target_id: id!,
        target_label: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || (profile?.email ?? "staff"),
        metadata: { new_status: "active" },
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile", id] });
      setShowReactivateDialog(false);
      toast({ title: "Staff reactivated" });
    },
    onError: (e: any) => toast({ title: "Couldn't reactivate", description: e.message, variant: "destructive" }),
  });

  if (loadingProfile || loadingSP) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  const monthName = (m: number) => new Date(2000, m - 1).toLocaleString("default", { month: "short" });
  const empStatus = (staffProfile as any)?.employment_status || "active";
  const isResigned = empStatus === "resigned" || empStatus === "terminated";

  // Calculate hourly rate for OT display: basic_salary / 26 / 8
  const basicSalary = form.basic_salary ?? 0;
  const hourlyRate = basicSalary > 0 ? basicSalary / 26 / 8 : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Resigned/Terminated Banner */}
        {isResigned && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive capitalize">{empStatus}</p>
              <p className="text-xs text-muted-foreground">
                {(staffProfile as any)?.resignation_date && `Effective: ${(staffProfile as any).resignation_date}`}
                {(staffProfile as any)?.resignation_reason && ` — ${(staffProfile as any).resignation_reason}`}
              </p>
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setShowReactivateDialog(true)}>
                Reactivate
              </Button>
            )}
          </div>
        )}
        {empStatus === "on_notice" && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-warning/30 bg-warning/10">
            <AlertCircle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">On Notice Period</p>
              <p className="text-xs text-muted-foreground">
                {(staffProfile as any)?.last_working_date && `Last working date: ${(staffProfile as any).last_working_date}`}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/staff-management")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Staff Profile</h1>
            <p className="text-muted-foreground">
              {profile?.first_name} {profile?.last_name} · {profile?.email}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            {canManage && staffProfile && !isResigned && (
              <>
                <Button variant="outline" size="sm" onClick={() => generateLinkMutation.mutate()}>
                  <Link2 className="h-4 w-4 mr-1" /> Generate Onboarding Link
                </Button>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowResignDialog(true)}>
                  Resign
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="personal">
          <TabsList className="flex-wrap">
            <TabsTrigger value="personal" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Personal Info</TabsTrigger>
            <TabsTrigger value="employment" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Employment</TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Payroll</TabsTrigger>
            <TabsTrigger value="leave" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Leave</TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Documents</TabsTrigger>
          </TabsList>

          {/* ─── PERSONAL INFO TAB ─── */}
          <TabsContent value="personal" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Personal Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label>First Name</Label>
                    <Input
                      value={profileForm.first_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))}
                      disabled={!canManage}
                    />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input
                      value={profileForm.last_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))}
                      disabled={!canManage}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      disabled={!canManage}
                    />
                  </div>
                  <div><Label>IC Number</Label><Input value={form.ic_number ?? ""} onChange={(e) => set("ic_number", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div>
                    <Label>Gender</Label>
                    <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v)} disabled={!canManage && user?.id !== id}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nationality</Label><Input value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div>
                    <Label>Marital Status</Label>
                    <Select value={form.marital_status ?? ""} onValueChange={(v) => set("marital_status", v)} disabled={!canManage && user?.id !== id}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="married">Married</SelectItem>
                        <SelectItem value="divorced">Divorced</SelectItem>
                        <SelectItem value="widowed">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Emergency Contact</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Contact Name</Label><Input value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>Contact Phone</Label><Input value={form.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                </div>
              </CardContent>
            </Card>
            {(canManage || user?.id === id) && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Save Personal Info</span>
              </Button>
            )}
          </TabsContent>

          {/* ─── EMPLOYMENT TAB ─── */}
          <TabsContent value="employment" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Employment Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label>Designation</Label>
                    <Select
                      value={desigForm.designation || ""}
                      onValueChange={(v) => setDesigForm((p) => ({ ...p, designation: v }))}
                      disabled={!canManage}
                    >
                      <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        {DESIGNATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {desigForm.designation === "other" && (
                      <Input
                        className="mt-2"
                        placeholder="Custom title"
                        value={desigForm.custom_designation}
                        onChange={(e) => setDesigForm((p) => ({ ...p, custom_designation: e.target.value }))}
                        disabled={!canManage}
                      />
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-xs"
                        disabled={saveDesignationMutation.isPending || !desigForm.designation}
                        onClick={() => saveDesignationMutation.mutate()}
                      >
                        {saveDesignationMutation.isPending ? "Saving…" : "Save Designation"}
                      </Button>
                    )}
                  </div>
                  {role === "super_admin" && (
                    <div>
                      <Label>System Role</Label>
                      <Select
                        value={roleSelect || ""}
                        onValueChange={(v) => {
                          setRoleSelect(v);
                          if (v && v !== currentPrimaryRole) changeRoleMutation.mutate(v);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teacher">Teacher</SelectItem>
                          <SelectItem value="staff">Non-Teaching Staff</SelectItem>
                          <SelectItem value="admin">Branch Admin</SelectItem>
                          <SelectItem value="franchisee">Branch Manager</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Current: <span className="font-medium">{getRoleLabel(currentPrimaryRole as any) || "—"}</span>
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>Employment Type</Label>
                    <Select value={form.employment_type ?? "full_time"} onValueChange={(v) => set("employment_type", v)} disabled={!canManage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full Time</SelectItem>
                        <SelectItem value="part_time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                        <SelectItem value="probation">Probation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Start Date</Label><Input type="date" value={form.employment_start_date ?? ""} onChange={(e) => set("employment_start_date", e.target.value)} disabled={!canManage} /></div>
                  <div><Label>End Date</Label><Input type="date" value={form.employment_end_date ?? ""} onChange={(e) => set("employment_end_date", e.target.value)} disabled={!canManage} /></div>
                  <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3 pt-2 border-t">
                    <Switch checked={form.exclude_from_payroll ?? false} onCheckedChange={(v) => set("exclude_from_payroll", v)} disabled={!canManage} id="exclude-payroll" />
                    <div>
                      <Label htmlFor="exclude-payroll" className="cursor-pointer font-medium">Exclude from Payroll & Attendance</Label>
                      <p className="text-xs text-muted-foreground">Enable for owners/directors who don't need attendance tracking or payroll processing</p>
                    </div>
                  </div>
                  <div>
                    <Label>Reports To</Label>
                    <Select value={form.reports_to ?? ""} onValueChange={(v) => set("reports_to", v === "_none" ? null : v)} disabled={!canManage}>
                      <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— None —</SelectItem>
                        {branchStaff.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branch Assignments */}
            <BranchAssignmentsCard userId={id!} canManage={canManage} />

            {/* Probation Details */}
            {form.employment_type === "probation" && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Probation Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label>Probation Duration (months)</Label>
                      <Select
                        value={String(form.probation_duration_months ?? "")}
                        onValueChange={(v) => {
                          const months = parseInt(v);
                          set("probation_duration_months", months);
                          if (form.employment_start_date && months) {
                            const start = new Date(form.employment_start_date);
                            start.setMonth(start.getMonth() + months);
                            set("probation_end_date", start.toISOString().split("T")[0]);
                          }
                          if (form.probation_status === "not_applicable") {
                            set("probation_status", "ongoing");
                          }
                        }}
                        disabled={!canManage}
                      >
                        <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <SelectItem key={m} value={String(m)}>{m} month{m > 1 ? "s" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Probation End Date</Label>
                      <Input type="date" value={form.probation_end_date ?? ""} onChange={(e) => set("probation_end_date", e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Probation Status</Label>
                      <div className="mt-1">
                        <Badge className={
                          form.probation_status === "confirmed" ? "bg-success/10 text-success" :
                          form.probation_status === "extended" ? "bg-warning/10 text-warning" :
                          form.probation_status === "ongoing" ? "bg-info/10 text-info" :
                          "bg-muted text-muted-foreground"
                        }>
                          {(form.probation_status ?? "not_applicable").replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </Badge>
                      </div>
                    </div>
                    {form.probation_status === "extended" && (
                      <div>
                        <Label>Extended Until</Label>
                        <Input type="date" value={form.probation_extended_until ?? ""} disabled />
                      </div>
                    )}
                  </div>
                  {canManage && form.probation_status === "ongoing" && (
                    <div className="flex gap-2 pt-2">
                      <Button variant="default" size="sm" onClick={() => {
                        set("probation_status", "confirmed");
                        set("employment_type", "full_time");
                        toast({ title: "Staff confirmed", description: "Employment type changed to Full Time. Save to apply." });
                      }}>✅ Confirm Staff</Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const extDate = prompt("Enter extended probation end date (YYYY-MM-DD):");
                        if (extDate) {
                          set("probation_status", "extended");
                          set("probation_extended_until", extDate);
                          set("probation_end_date", extDate);
                          toast({ title: "Probation extended", description: `Extended until ${extDate}. Save to apply.` });
                        }
                      }}>🔄 Extend Probation</Button>
                    </div>
                  )}
                  {canManage && form.probation_status === "extended" && (
                    <div className="flex gap-2 pt-2">
                      <Button variant="default" size="sm" onClick={() => {
                        set("probation_status", "confirmed");
                        set("employment_type", "full_time");
                        toast({ title: "Staff confirmed", description: "Employment type changed to Full Time. Save to apply." });
                      }}>✅ Confirm Staff</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Work Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Work Schedule</CardTitle>
                <CardDescription>Set daily working hours. Click day name to toggle work/off.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Daily Work Schedule</Label>
                    {canManage && (
                      <Button variant="outline" size="sm" onClick={() => {
                        const schedule = form.work_schedule ?? {};
                        const firstActive = Object.values(schedule).find((v: any) => v !== null) as any;
                        if (firstActive) {
                          const newSchedule: any = {};
                          for (let i = 0; i < 7; i++) {
                            newSchedule[String(i)] = schedule[String(i)] !== null ? { ...firstActive } : null;
                          }
                          set("work_schedule", newSchedule);
                          toast({ title: "Schedule copied to all work days" });
                        }
                      }}>Copy to All</Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {[
                      { day: 0, label: "Sunday" },
                      { day: 1, label: "Monday" },
                      { day: 2, label: "Tuesday" },
                      { day: 3, label: "Wednesday" },
                      { day: 4, label: "Thursday" },
                      { day: 5, label: "Friday" },
                      { day: 6, label: "Saturday" },
                    ].map(({ day, label }) => {
                      const schedule = form.work_schedule ?? {};
                      const daySchedule = schedule[String(day)];
                      const isWorkDay = daySchedule !== null && daySchedule !== undefined;
                      return (
                        <div key={day} className={`flex items-center gap-3 p-2 rounded-md border ${isWorkDay ? "bg-background" : "bg-muted/50"}`}>
                          <button
                            type="button"
                            disabled={!canManage}
                            className={`w-24 text-left text-sm font-medium px-2 py-1 rounded ${isWorkDay ? "text-foreground" : "text-muted-foreground line-through"} disabled:opacity-50`}
                            onClick={() => {
                              const newSchedule = { ...schedule };
                              if (isWorkDay) {
                                newSchedule[String(day)] = null;
                              } else {
                                newSchedule[String(day)] = { start: form.work_start_time || "09:00", end: form.work_end_time || "18:00" };
                              }
                              set("work_schedule", newSchedule);
                            }}
                          >
                            {label}
                          </button>
                          <Badge variant={isWorkDay ? "default" : "secondary"} className="text-[10px] w-12 justify-center">
                            {isWorkDay ? "Work" : "Off"}
                          </Badge>
                          <Input type="time" className="h-8 w-28" value={daySchedule?.start ?? "09:00"} disabled={!canManage || !isWorkDay}
                            onChange={(e) => {
                              const newSchedule = { ...schedule };
                              newSchedule[String(day)] = { ...(daySchedule || {}), start: e.target.value };
                              set("work_schedule", newSchedule);
                            }}
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input type="time" className="h-8 w-28" value={daySchedule?.end ?? "18:00"} disabled={!canManage || !isWorkDay}
                            onChange={(e) => {
                              const newSchedule = { ...schedule };
                              newSchedule[String(day)] = { ...(daySchedule || {}), end: e.target.value };
                              set("work_schedule", newSchedule);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {canManage && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Save Employment</span>
              </Button>
            )}
          </TabsContent>

          {/* ─── PAYROLL TAB ─── */}
          <TabsContent value="payroll" className="mt-4 space-y-4">
            {/* Compensation */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Compensation</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label>Basic Salary (RM)</Label>
                    <Input type="number" value={form.basic_salary ?? 0} onChange={(e) => set("basic_salary", parseFloat(e.target.value) || 0)} disabled={!canManage} />
                  </div>
                  <div>
                    <Label>Hourly Rate (calculated)</Label>
                    <Input value={hourlyRate > 0 ? `RM ${hourlyRate.toFixed(2)}` : "—"} disabled className="bg-muted/50" />
                    <p className="text-[10px] text-muted-foreground mt-1">Basic Salary ÷ 26 days ÷ 8 hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Overtime Rates - Malaysian Employment Act compliant */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" /> Overtime Rates
                </CardTitle>
                <CardDescription>Malaysian Employment Act 1955 compliant. Set custom RM/hr or leave at 0 to use statutory multipliers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Normal Day</Label>
                      <Badge variant="secondary" className="text-[10px]">1.5× statutory</Badge>
                    </div>
                    <Input type="number" step="0.50" placeholder={hourlyRate > 0 ? `Default: RM ${(hourlyRate * 1.5).toFixed(2)}` : "0.00"}
                      value={form.overtime_rate ?? ""} onChange={(e) => set("overtime_rate", parseFloat(e.target.value) || 0)} disabled={!canManage} />
                    <p className="text-[10px] text-muted-foreground">Custom RM/hr override. 0 = use 1.5× hourly rate.</p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Rest Day</Label>
                      <Badge variant="secondary" className="text-[10px]">2.0× statutory</Badge>
                    </div>
                    <Input type="number" step="0.50" placeholder={hourlyRate > 0 ? `Default: RM ${(hourlyRate * 2.0).toFixed(2)}` : "0.00"}
                      value={form.overtime_rate_rest_day ?? ""} onChange={(e) => set("overtime_rate_rest_day", parseFloat(e.target.value) || 0)} disabled={!canManage} />
                    <p className="text-[10px] text-muted-foreground">Custom RM/hr override. 0 = use 2.0× hourly rate.</p>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Public Holiday</Label>
                      <Badge variant="secondary" className="text-[10px]">3.0× statutory</Badge>
                    </div>
                    <Input type="number" step="0.50" placeholder={hourlyRate > 0 ? `Default: RM ${(hourlyRate * 3.0).toFixed(2)}` : "0.00"}
                      value={form.overtime_rate_public_holiday ?? ""} onChange={(e) => set("overtime_rate_public_holiday", parseFloat(e.target.value) || 0)} disabled={!canManage} />
                    <p className="text-[10px] text-muted-foreground">Custom RM/hr override. 0 = use 3.0× hourly rate.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Per the <strong>Malaysian Employment Act 1955</strong>, overtime is calculated as: Basic Salary ÷ 26 ÷ 8 × multiplier. 
                    Normal day = 1.5×, Rest day = 2.0×, Public holiday = 3.0×. Custom rates override these defaults for this employee only.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Salary Components */}
            <SalaryComponentsCard userId={id!} canManage={canManage} />

            {/* Statutory Deduction Toggles */}
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" /> Statutory Deduction Settings
                  </CardTitle>
                  <CardDescription>Toggle statutory deductions on/off for foreign workers, part-timers, or special contracts.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label className="font-semibold">EPF (KWSP)</Label>
                        <p className="text-xs text-muted-foreground">Calculate in Payment</p>
                      </div>
                      <Switch checked={form.epf_enabled !== false} onCheckedChange={(v) => set("epf_enabled", v)} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label className="font-semibold">SOCSO</Label>
                        <p className="text-xs text-muted-foreground">SOCSO Deduction</p>
                      </div>
                      <Switch checked={form.socso_enabled !== false} onCheckedChange={(v) => set("socso_enabled", v)} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label className="font-semibold">EIS</Label>
                        <p className="text-xs text-muted-foreground">EIS Deduction</p>
                      </div>
                      <Switch checked={form.eis_enabled !== false} onCheckedChange={(v) => set("eis_enabled", v)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Statutory & Bank Details */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Statutory & Bank Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><Label>EPF Number</Label><Input value={form.epf_number ?? ""} onChange={(e) => set("epf_number", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>SOCSO Number</Label><Input value={form.socso_number ?? ""} onChange={(e) => set("socso_number", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>EIS Number</Label><Input value={form.eis_number ?? ""} onChange={(e) => set("eis_number", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div><Label>Tax Number</Label><Input value={form.tax_number ?? ""} onChange={(e) => set("tax_number", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                  <div>
                    <Label>Bank</Label>
                    <Select value={form.bank_name ?? ""} onValueChange={(v) => set("bank_name", v)} disabled={!canManage && user?.id !== id}>
                      <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                      <SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Bank Account Number</Label><Input value={form.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} disabled={!canManage && user?.id !== id} /></div>
                </div>
              </CardContent>
            </Card>

            {/* Custom Statutory Rate Overrides */}
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Custom Statutory Rate Overrides</CardTitle>
                  <CardDescription>Leave blank to use default rates. Override for part-time, foreign workers, or special contracts.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Custom EPF Rate (%)</Label>
                      <Input type="number" step="0.01" placeholder="Default" value={form.custom_epf_rate ?? ""} onChange={(e) => set("custom_epf_rate", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label>Custom SOCSO Rate (%)</Label>
                      <Input type="number" step="0.01" placeholder="Default" value={form.custom_socso_rate ?? ""} onChange={(e) => set("custom_socso_rate", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                    <div>
                      <Label>Custom EIS Rate (%)</Label>
                      <Input type="number" step="0.01" placeholder="Default" value={form.custom_eis_rate ?? ""} onChange={(e) => set("custom_eis_rate", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Payroll */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Recent Payroll</CardTitle></CardHeader>
              <CardContent>
                {recentPayroll.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No payroll records found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPayroll.map((pr: any) => (
                        <TableRow key={pr.id}>
                          <TableCell>{monthName(pr.month)} {pr.year}</TableCell>
                          <TableCell>RM {Number(pr.gross_salary).toFixed(2)}</TableCell>
                          <TableCell>RM {Number(pr.net_salary).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={pr.status === "paid" ? "default" : "secondary"} className="capitalize">{pr.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {canManage && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Save Payroll Settings</span>
              </Button>
            )}
          </TabsContent>

          {/* ─── LEAVE TAB ─── */}
          <TabsContent value="leave" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Leave Entitlements {hasLeaveRecord ? `(${(leaveBalances[0] as any)?.year})` : `(${new Date().getFullYear()})`}
                    </CardTitle>
                    <CardDescription>
                      {hasLeaveRecord 
                        ? "Custom override for this employee." 
                        : masterLeaveDefaults 
                          ? "Using master HR defaults. Save to create a custom record for this employee."
                          : "No master defaults configured. Set values and save to create a leave record."}
                    </CardDescription>
                  </div>
                  <Badge variant={hasLeaveRecord ? "default" : "secondary"}>
                    {hasLeaveRecord ? "Custom Override" : "Master Defaults"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {["annual", "medical", "hospitalisation", "maternity", "paternity", "emergency", "compassionate", "replacement", "unpaid"].map((type) => {
                    const lb = hasLeaveRecord ? (leaveBalances[0] as any) : null;
                    const used = lb?.[`${type}_used`] ?? 0;
                    const total = canManage ? (leaveForm[`${type}_total`] ?? 0) : (lb?.[`${type}_total`] ?? leaveForm[`${type}_total`] ?? 0);
                    return (
                      <div key={type} className="rounded-lg border p-3 space-y-1">
                        <p className="text-xs text-muted-foreground capitalize">{type}</p>
                        {canManage ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min={0} step="0.5" className="h-7 w-14 text-sm"
                              value={leaveForm[`${type}_used`] ?? 0}
                              onChange={(e) => setLeaveForm((f: any) => ({ ...f, [`${type}_used`]: parseFloat(e.target.value) || 0 }))}
                              title="Days already taken"
                            />
                            <span className="text-sm font-medium">/</span>
                            <Input
                              type="number" min={0} step="0.5" className="h-7 w-16 text-sm"
                              value={leaveForm[`${type}_total`] ?? 0}
                              onChange={(e) => setLeaveForm((f: any) => ({ ...f, [`${type}_total`]: parseFloat(e.target.value) || 0 }))}
                              title="Total entitlement"
                            />
                          </div>
                        ) : (
                          <p className="text-lg font-semibold">{used} / {total}</p>
                        )}
                        {canManage && (
                          <p className="text-[10px] text-muted-foreground">Used / Entitled</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!hasLeaveRecord && masterLeaveDefaults && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      These values are from the <strong>Master HR Settings</strong>. Click Save to create a custom leave record for this employee. You can then adjust values individually.
                    </p>
                  </div>
                )}

                {canManage && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => saveLeaveBalanceMutation.mutate()} disabled={saveLeaveBalanceMutation.isPending}>
                      {saveLeaveBalanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span className="ml-1">{hasLeaveRecord ? "Save Leave Entitlements" : "Initialize Leave Record"}</span>
                    </Button>
                    {cfEnabled && (
                      <Button size="sm" variant="outline" onClick={openCFDialog} disabled={alreadyCarriedForward}>
                        <ArrowRightLeft className="h-4 w-4 mr-1" />
                        {alreadyCarriedForward ? `Already Carried Forward (${prevYear})` : `Carry Forward from ${prevYear}`}
                      </Button>
                    )}
                  </div>
                )}

                {/* Carry Forward History */}
                {existingCFLogs.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Carry Forward History ({prevYear} → {currYear})</p>
                    <div className="flex flex-wrap gap-2">
                      {existingCFLogs.map((log: any) => (
                        <Badge key={log.id} variant="secondary" className="text-xs">
                          {log.leave_type.charAt(0).toUpperCase() + log.leave_type.slice(1)}: +{Number(log.days_carried)} day(s)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custom Leave Entitlements — always render so HR can see status */}
            <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Custom Leave Entitlements ({currentYear})</CardTitle>
                  <CardDescription>
                    Branch-specific leave types (e.g. Birthday Leave). Edit "Used" for staff onboarded mid-year.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                {customLeaveTypes.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                    No custom leave types defined for this branch yet.
                    {canManage && (
                      <span className="block mt-1 text-xs">
                        Create one under <strong>Human Resources → Leave Policy → Custom Leave Types</strong>.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {customLeaveTypes.map((t: any) => (
                      <div key={t.id} className="rounded-lg border p-3 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs text-muted-foreground capitalize truncate">{t.name}</p>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Custom</Badge>
                        </div>
                        {canManage ? (
                          <>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number" min={0} step="0.5" className="h-7 w-14 text-sm"
                                value={customLeaveForm[t.id]?.used ?? 0}
                                onChange={(e) => setCustomLeaveForm((f) => ({
                                  ...f,
                                  [t.id]: { total: f[t.id]?.total ?? t.default_days ?? 0, used: parseFloat(e.target.value) || 0 },
                                }))}
                              />
                              <span className="text-sm font-medium">/</span>
                              <Input
                                type="number" min={0} step="0.5" className="h-7 w-16 text-sm"
                                value={customLeaveForm[t.id]?.total ?? 0}
                                onChange={(e) => setCustomLeaveForm((f) => ({
                                  ...f,
                                  [t.id]: { used: f[t.id]?.used ?? 0, total: parseFloat(e.target.value) || 0 },
                                }))}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Used / Entitled</p>
                          </>
                        ) : (
                          <p className="text-lg font-semibold">
                            {customLeaveForm[t.id]?.used ?? 0} / {customLeaveForm[t.id]?.total ?? 0}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                  {canManage && customLeaveTypes.length > 0 && (
                    <Button size="sm" onClick={() => saveCustomLeaveMutation.mutate()} disabled={saveCustomLeaveMutation.isPending}>
                      {saveCustomLeaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span className="ml-1">Save Custom Entitlements</span>
                    </Button>
                  )}
                </CardContent>
            </Card>
          </TabsContent>

          {/* ─── DOCUMENTS TAB ─── */}
          <TabsContent value="documents" className="mt-4">
            <StaffDocumentUpload staffUserId={id!} canManage={canManage} />
          </TabsContent>
        </Tabs>
      </div>

      <ResignationDialog
        open={showResignDialog}
        onOpenChange={setShowResignDialog}
        staffName={`${profile?.first_name} ${profile?.last_name}`}
        isPending={resignMutation.isPending}
        onConfirm={(data) => resignMutation.mutate(data)}
      />

      <Dialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to reactivate this staff member?</DialogTitle>
            <DialogDescription>
              This will restore the employee as an active staff member and make them available in payroll and HR
              modules again. Existing payroll, attendance, leave, OT and employment history remain unchanged — no
              duplicate staff record is created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={reactivateMutation.isPending} onClick={() => setShowReactivateDialog(false)}>Cancel</Button>
            <Button disabled={reactivateMutation.isPending} onClick={() => reactivateMutation.mutate()}>
              {reactivateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carry Forward Dialog */}
      <Dialog open={showCFDialog} onOpenChange={setShowCFDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Carry Forward Leave — {profile?.first_name} {profile?.last_name}</DialogTitle>
            <DialogDescription>
              Transfer unused leave from {prevYear} to {currYear}. Max {cfMaxDays} day(s) per type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!prevYearBalance ? (
              <div className="p-4 text-center text-sm text-muted-foreground rounded-md bg-muted/50 border">
                No leave balance record found for {prevYear}. Nothing to carry forward.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave Type</TableHead>
                    <TableHead className="text-center">Entitlement ({prevYear})</TableHead>
                    <TableHead className="text-center">Used</TableHead>
                    <TableHead className="text-center">Remaining</TableHead>
                    <TableHead className="text-center">Carry Forward</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cfTypes.map((type: string) => {
                    const total = (prevYearBalance as any)?.[`${type}_total`] ?? 0;
                    const used = (prevYearBalance as any)?.[`${type}_used`] ?? 0;
                    const remaining = Math.max(0, total - used);
                    const maxCf = Math.min(remaining, cfMaxDays);
                    return (
                      <TableRow key={type}>
                        <TableCell className="capitalize font-medium">{type}</TableCell>
                        <TableCell className="text-center">{total}</TableCell>
                        <TableCell className="text-center">{used}</TableCell>
                        <TableCell className="text-center font-semibold">{remaining}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={maxCf}
                            className="h-8 w-20 mx-auto text-center text-sm"
                            value={cfAmounts[type] ?? 0}
                            onChange={(e) => {
                              const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), maxCf);
                              setCfAmounts((prev) => ({ ...prev, [type]: val }));
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCFDialog(false)}>Cancel</Button>
            <Button
              onClick={() => carryForwardMutation.mutate()}
              disabled={carryForwardMutation.isPending || !prevYearBalance || Object.values(cfAmounts).every((v) => v === 0)}
            >
              {carryForwardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowRightLeft className="h-4 w-4 mr-1" />}
              Carry Forward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ───────────────────────── Branch Assignments Card ─────────────────────────
function BranchAssignmentsCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { branches: accessibleBranches } = useBranches();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["staff-branch-memberships", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("id, branch_id, branches(id, name)")
        .eq("user_id", userId);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const assignedIds = new Set(memberships.map((m: any) => m.branch_id));
  const availableToAdd = accessibleBranches.filter((b) => !assignedIds.has(b.id));

  const addMutation = useMutation({
    mutationFn: async (branchIds: string[]) => {
      if (branchIds.length === 0) throw new Error("Select at least one branch");
      const rows = branchIds.map((branch_id) => ({ user_id: userId, branch_id }));
      const { error, data } = await supabase.from("branch_memberships").insert(rows).select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast({ title: "Branches assigned", description: `Added staff to ${count} branch(es).` });
      queryClient.invalidateQueries({ queryKey: ["staff-branch-memberships", userId] });
      queryClient.invalidateQueries({ queryKey: ["user-branches"] });
      setDialogOpen(false);
      setSelected({});
    },
    onError: (e: any) => {
      toast({ title: "Failed to assign", description: e.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("branch_memberships").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Branch unassigned" });
      queryClient.invalidateQueries({ queryKey: ["staff-branch-memberships", userId] });
      queryClient.invalidateQueries({ queryKey: ["user-branches"] });
    },
    onError: (e: any) => {
      toast({ title: "Failed to remove", description: e.message ?? "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Branch Assignments
          </CardTitle>
          <CardDescription>This staff has access to the following branches.</CardDescription>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} disabled={availableToAdd.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Assign
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : memberships.length === 0 ? (
          <div className="text-sm text-muted-foreground">No branches assigned yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {memberships.map((m: any) => (
              <Badge key={m.id} variant="secondary" className="gap-1 py-1 pl-2 pr-1 text-sm">
                <Building2 className="h-3 w-3" />
                {m.branches?.name ?? "Unknown branch"}
                {canManage && memberships.length > 1 && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove access to ${m.branches?.name}?`)) removeMutation.mutate(m.id);
                    }}
                    className="ml-1 rounded hover:bg-destructive/20 p-0.5"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Additional Branches</DialogTitle>
            <DialogDescription>
              Select branches to grant this staff member access to. They will appear in those branch directories and can clock in / be scheduled there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto py-2">
            {availableToAdd.length === 0 ? (
              <p className="text-sm text-muted-foreground">No additional branches available to assign.</p>
            ) : (
              availableToAdd.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-3 p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={!!selected[b.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [b.id]: !!v }))}
                  />
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{b.name}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
                addMutation.mutate(ids);
              }}
              disabled={addMutation.isPending || Object.values(selected).every((v) => !v)}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Assign Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
