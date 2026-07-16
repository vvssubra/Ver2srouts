import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useAuth } from "@/lib/auth";
import { getRoleLabel } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import UsersPage from "@/pages/Users";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Users, CheckCircle2, AlertCircle, Loader2, Eye, Briefcase, UserX, UserCheck, UserPlus, Building2, Shield } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import ResignationDialog from "@/components/staff/ResignationDialog";
import ShareCredentialsDialog from "@/components/ShareCredentialsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import OrgChart from "@/pages/OrgChart";
import { uploadAndSign } from "@/lib/storage/signedUrl";

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

const STAFF_CATEGORIES = [
  { value: "teaching", label: "Teaching", help: "Sees classroom dashboard: attendance, observations, lesson plans" },
  { value: "non_teaching", label: "Non-Teaching", help: "Sees HR dashboard: clock in/out, leave, claims, payslips" },
  { value: "marketing", label: "Marketing", help: "Sees CRM dashboard: leads, tours, enrolment funnel" },
  { value: "admin_hr", label: "Admin / HR", help: "Sees HR dashboard with management tools" },
  { value: "finance", label: "Finance", help: "Sees finance dashboard" },
  { value: "operations", label: "Operations", help: "Sees operations dashboard" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/10 text-success hover:bg-success/10" },
  on_notice: { label: "On Notice", className: "bg-warning/10 text-warning hover:bg-warning/10" },
  resigned: { label: "Resigned", className: "bg-destructive/10 text-destructive hover:bg-destructive/10" },
  terminated: { label: "Terminated", className: "bg-destructive/10 text-destructive hover:bg-destructive/10" },
};

export default function StaffManagement() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/staff-management");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "administrators" || tabParam === "org-chart" ? tabParam : "staff";
  const isSuperAdmin = role === "super_admin";
  const canReactivate = isSuperAdmin || (role === "admin" && !isRestrictedAdmin);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [designationDialog, setDesignationDialog] = useState<string | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState("teacher");
  const [selectedCategory, setSelectedCategory] = useState<string>("non_teaching");
  const [customDesignation, setCustomDesignation] = useState("");
  const [resignDialog, setResignDialog] = useState<{ id: string; name: string } | null>(null);
  const [roleDialog, setRoleDialog] = useState<{ userId: string; name: string; currentRole: string } | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<string>("teacher");
  const [addBackDialog, setAddBackDialog] = useState<{ id: string; name: string; status: string } | null>(null);
  const [dismissDialog, setDismissDialog] = useState<{ id: string; name: string } | null>(null);
  const [dismissConfirmText, setDismissConfirmText] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [dismissBusy, setDismissBusy] = useState(false);

  // Create Staff state
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [createStaffForm, setCreateStaffForm] = useState({ email: "", first_name: "", last_name: "", role: "teacher" as string, phone: "", ic_number: "", designation: "", category: "teaching", access_group_ids: [] as string[] });
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string } | null>(null);

  const handleCreateStaff = async () => {
    if (!createStaffForm.email || !createStaffForm.first_name) return;
    setCreatingStaff(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: createStaffForm.email,
          first_name: createStaffForm.first_name,
          last_name: createStaffForm.last_name,
          role: createStaffForm.role,
          branch_id: selectedBranchId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Auto-create staff_profile and designation if provided
      const newUserId = data.user_id;
      if (newUserId) {
        if (createStaffForm.phone || createStaffForm.ic_number) {
          await supabase.from("staff_profiles").upsert({
            user_id: newUserId,
            ic_number: createStaffForm.ic_number || null,
            branch_id: selectedBranchId,
          } as any, { onConflict: "user_id" });
          if (createStaffForm.phone) {
            await supabase.from("profiles").update({ phone: createStaffForm.phone }).eq("id", newUserId);
          }
        }
        if ((createStaffForm.designation || createStaffForm.category) && selectedBranchId) {
          await supabase.from("staff_designations").upsert({
            user_id: newUserId,
            branch_id: selectedBranchId,
            designation: createStaffForm.designation || "teacher",
            category: createStaffForm.category,
          } as any, { onConflict: "user_id,branch_id" });
        }
        // Assign access groups (only relevant for non-teacher staff/admin)
        if (createStaffForm.access_group_ids.length > 0 && createStaffForm.role !== "teacher") {
          await supabase.from("access_group_members").insert(
            createStaffForm.access_group_ids.map((gid) => ({ group_id: gid, user_id: newUserId }))
          );
        }
      }

      setShowCreateStaff(false);
      setCreateStaffForm({ email: "", first_name: "", last_name: "", role: "teacher", phone: "", ic_number: "", designation: "", category: "teaching", access_group_ids: [] });
      setCreatedCredentials({
        email: data.email,
        password: data.temporary_password,
        name: `${createStaffForm.first_name} ${createStaffForm.last_name}`.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      toast({ title: "Staff account created" });
    } catch (e: any) {
      toast({ title: "Failed to create staff", description: e.message, variant: "destructive" });
    }
    setCreatingStaff(false);
  };

  // Access groups for the selected branch (used in Create Staff dialog)
  const { data: accessGroups = [] } = useQuery({
    queryKey: ["access-groups-for-branch", "selected"],
    queryFn: async () => {
      const { data } = await supabase.from("access_groups").select("id, name, description, allowed_routes, managed_routes, branch_id, is_active").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["staff-profiles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*");
      return data ?? [];
    },
  });

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["staff-profiles-all"],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("*");
      return data ?? [];
    },
  });

  const { data: designations = [] } = useQuery({
    queryKey: ["staff-designations-all"],
    queryFn: async () => {
      const { data } = await supabase.from("staff_designations").select("*");
      return data ?? [];
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["branch-memberships-all"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("*, branches(name)");
      return data ?? [];
    },
  });

  // Access groups (roles defined in Role & Permission matrix) + members.
  // Shown as badges next to the base role so what's configured in the matrix
  // is consistent with what HR sees here.
  const { data: accessGroupRows = [] } = useQuery({
    queryKey: ["staff-mgmt-access-groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("access_groups")
        .select("id, name, branch_id");
      return data ?? [];
    },
  });
  const { data: accessGroupMembers = [] } = useQuery({
    queryKey: ["staff-mgmt-access-group-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("access_group_members")
        .select("user_id, group_id");
      return data ?? [];
    },
  });
  const accessGroupsByUser = new Map<string, string[]>();
  {
    const groupNameById = new Map<string, string>();
    (accessGroupRows as any[]).forEach((g) => groupNameById.set(g.id, g.name));
    (accessGroupMembers as any[]).forEach((m) => {
      const name = groupNameById.get(m.group_id);
      if (!name) return;
      const arr = accessGroupsByUser.get(m.user_id) ?? [];
      if (!arr.includes(name)) arr.push(name);
      accessGroupsByUser.set(m.user_id, arr);
    });
  }

  // Build maps — a user may have multiple roles (e.g. teacher + parent when their child enrols).
  // Track ALL roles per user so dual-role staff aren't hidden by parent-role overrides.
  const rolesMap = new Map<string, Set<string>>();
  roles.forEach((r: any) => {
    const set = rolesMap.get(r.user_id) ?? new Set<string>();
    set.add(r.role);
    rolesMap.set(r.user_id, set);
  });
  const roleMap = new Map<string, string>();
  rolesMap.forEach((set, uid) => {
    // Prefer a non-parent role for display
    const primary = Array.from(set).find((r) => r !== "parent") ?? Array.from(set)[0];
    roleMap.set(uid, primary);
  });

  const spMap = new Map<string, any>();
  staffProfiles.forEach((sp: any) => spMap.set(sp.user_id, sp));

  const desigMap = new Map<string, any>();
  designations.forEach((d: any) => desigMap.set(d.user_id, d));

  const branchMap = new Map<string, string>();
  const branchesByUser = new Map<string, string[]>();
  const membershipByUser = new Map<string, any>();
  memberships.forEach((m: any) => {
    if (m.branches) branchMap.set(m.user_id, (m.branches as any).name);
    if (m.branches?.name) {
      const arr = branchesByUser.get(m.user_id) || [];
      arr.push((m.branches as any).name);
      branchesByUser.set(m.user_id, arr);
    }
    if (!membershipByUser.has(m.user_id)) membershipByUser.set(m.user_id, m);
  });

  const getDesignationLabel = (userId: string) => {
    const d = desigMap.get(userId);
    if (!d) return null;
    if (d.designation === "other") return d.custom_designation || "Other";
    return DESIGNATIONS.find((x) => x.value === d.designation)?.label || d.designation;
  };

  const getEmploymentStatus = (userId: string): string => {
    const sp = spMap.get(userId);
    return sp?.employment_status || "active";
  };

  const { selectedBranchId } = useGlobalBranch();

  // Filter to staff, scoped by selected branch.
  // A user counts as staff if they have ANY non-parent role (teacher/admin/etc.),
  // even if they ALSO have a parent role from their own child's enrolment.
  const allStaff = profiles.filter((p: any) => {
    const userRoles = rolesMap.get(p.id);
    if (!userRoles || userRoles.size === 0) return false;
    const hasNonParent = Array.from(userRoles).some((r) => r !== "parent");
    if (!hasNonParent) return false;
    // Branch filter: if a specific branch is selected, only show staff with membership in that branch
    if (selectedBranchId && selectedBranchId !== "all") {
      const hasMembership = memberships.some((m: any) => m.user_id === p.id && m.branch_id === selectedBranchId);
      if (!hasMembership) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
    return name.includes(q) || p.email?.toLowerCase().includes(q);
  });

  const staffList = allStaff.filter((p: any) => {
    if (statusFilter === "all") return true;
    return getEmploymentStatus(p.id) === statusFilter;
  });

  const totalStaff = allStaff.length;
  const activeStaff = allStaff.filter((p: any) => getEmploymentStatus(p.id) === "active").length;
  const resignedStaff = allStaff.filter((p: any) => ["resigned", "terminated"].includes(getEmploymentStatus(p.id))).length;
  const onboarded = allStaff.filter((p: any) => spMap.get(p.id)?.onboarding_complete && getEmploymentStatus(p.id) === "active").length;

  const assignDesignationMutation = useMutation({
    mutationFn: async ({ userId, designation, customDesig, category }: { userId: string; designation: string; customDesig: string; category: string }) => {
      const mem = membershipByUser.get(userId);
      const branchId = mem?.branch_id;
      if (!branchId) throw new Error("User must be assigned to a branch first");
      const { error } = await supabase.from("staff_designations").upsert({
        user_id: userId,
        branch_id: branchId,
        designation,
        custom_designation: designation === "other" ? customDesig : null,
        category,
      } as any, { onConflict: "user_id,branch_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-designations-all"] });
      setDesignationDialog(null);
      toast({ title: "Designation updated" });
    },
    onError: (e: any) => {
      const msg = (e?.message ?? "").toLowerCase();
      const friendly = msg.includes("row-level security") || msg.includes("permission") || msg.includes("policy")
        ? "You don't have permission to set designations for this branch. Make sure your account has Branch Admin access to this branch."
        : (e?.message || "Could not save designation");
      toast({ title: "Couldn't update designation", description: friendly, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      setRoleDialog(null);
      toast({ title: "Role updated" });
    },
    onError: (e: any) => toast({ title: "Couldn't change role", description: e?.message || "", variant: "destructive" }),
  });

  const resignMutation = useMutation({
    mutationFn: async ({ userId, status, lastWorkingDate, letterFile }: {
      userId: string; status: string; lastWorkingDate: string; letterFile: File;
    }) => {
      // Upload the resignation letter (PDF) to the private staff-documents bucket
      const ext = letterFile.name.split(".").pop() || "pdf";
      const path = `${userId}/resignation/${Date.now()}-resignation-letter.${ext}`;
      const fileUrl = await uploadAndSign("staff-documents", path, letterFile);

      // Record it in staff_documents for audit / long-term reference
      const { error: docErr } = await supabase.from("staff_documents" as any).insert({
        user_id: userId,
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
      // If resigned or terminated, also set is_active = false
      if (status === "resigned" || status === "terminated") {
        updates.is_active = false;
      }
      const { error } = await supabase
        .from("staff_profiles")
        .update(updates)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profiles-all"] });
      setResignDialog(null);
      toast({ title: "Staff separation processed", description: "The staff member's status has been updated." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Probation expiry banner
  const probationExpiring = staffProfiles.filter((sp: any) => {
    if (sp.probation_status !== "ongoing" && sp.probation_status !== "extended") return false;
    if (!sp.probation_end_date) return false;
    const endDate = new Date(sp.probation_end_date);
    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 14;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
         <div>
           <h1 className="text-2xl font-bold">Staff Management</h1>
           <p className="text-muted-foreground">Manage staff profiles, documents, and onboarding</p>
         </div>
         <Tabs value={activeTab} onValueChange={(v) => setSearchParams(v === "staff" ? {} : { tab: v })}>
           <TabsList>
             <TabsTrigger value="staff">Staff</TabsTrigger>
             <TabsTrigger value="org-chart">Organization Chart</TabsTrigger>
             {isSuperAdmin && <TabsTrigger value="administrators">Administrators</TabsTrigger>}
           </TabsList>
           <TabsContent value="staff" className="space-y-6 mt-4">
         {!isRestrictedAdmin && (
           <Button onClick={() => setShowCreateStaff(true)}>
             <UserPlus className="h-4 w-4 mr-2" />Create Staff
           </Button>
         )}

        {/* Probation Expiry Banner */}
        {probationExpiring.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning shrink-0" />
              <p className="text-sm font-semibold text-warning">Probation Review Required ({probationExpiring.length})</p>
            </div>
            <div className="space-y-1">
              {probationExpiring.map((sp: any) => {
                const prof = profiles.find((p: any) => p.id === sp.user_id);
                const daysLeft = Math.ceil((new Date(sp.probation_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={sp.user_id} className="flex items-center justify-between text-sm">
                    <span>{prof ? `${prof.first_name} ${prof.last_name}` : "Unknown"}</span>
                    <div className="flex items-center gap-2">
                      <Badge className={daysLeft <= 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}>
                        {daysLeft <= 0 ? "Overdue" : `${daysLeft} days left`}
                      </Badge>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/staff-management/${sp.user_id}`)}>
                        Review
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{activeStaff}</p>
                  <p className="text-xs text-muted-foreground">Active Staff</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-success0" />
                <div>
                  <p className="text-2xl font-bold">{onboarded}</p>
                  <p className="text-xs text-muted-foreground">Onboarding Complete</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-warning0" />
                <div>
                  <p className="text-2xl font-bold">{activeStaff - onboarded}</p>
                  <p className="text-xs text-muted-foreground">Pending Onboarding</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <UserX className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{resignedStaff}</p>
                  <p className="text-xs text-muted-foreground">Resigned / Terminated</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle>Staff Directory</CardTitle>
              <div className="flex items-center gap-3">
                <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                  <TabsList className="h-8">
                    <TabsTrigger value="active" className="text-xs px-3 h-7">
                      <UserCheck className="h-3 w-3 mr-1" /> Active
                    </TabsTrigger>
                    <TabsTrigger value="resigned" className="text-xs px-3 h-7">Inactive Staff</TabsTrigger>
                    <TabsTrigger value="all" className="text-xs px-3 h-7">All</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8" />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingProfiles ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.map((p: any) => {
                    const sp = spMap.get(p.id);
                    const isOnboarded = sp?.onboarding_complete;
                    const desig = getDesignationLabel(p.id);
                    const empStatus = getEmploymentStatus(p.id);
                    const isInactive = empStatus === "resigned" || empStatus === "terminated";
                    return (
                      <TableRow key={p.id} className={isInactive ? "opacity-60" : ""}>
                        <TableCell className={`font-medium ${isInactive ? "line-through" : ""}`}>
                          <div className="flex flex-col">
                            <span>{p.first_name} {p.last_name}</span>
                            <span className="text-[11px] text-muted-foreground font-normal no-underline">{p.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getRoleLabel(roleMap.get(p.id) as any) || "—"}</Badge>
                          {(accessGroupsByUser.get(p.id) ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {[...new Set(accessGroupsByUser.get(p.id) ?? [])].map((g) => (
                                <Badge key={g} variant="outline" className="text-[10px]">
                                  {g}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {desig ? (
                            <Badge variant="outline" className="text-[10px]">{desig}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const list = branchesByUser.get(p.id) || [];
                            if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-xs">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {list.length}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="start">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Branches</p>
                                  <div className="space-y-1">
                                    {list.map((name, i) => (
                                      <div key={i} className="flex items-center gap-2 text-sm">
                                        <Building2 className="h-3 w-3 text-muted-foreground" />
                                        <span className="truncate">{name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {isOnboarded ? (
                            <Badge className="bg-success/10 text-success hover:bg-success/10">Complete</Badge>
                          ) : (
                            <Badge variant="outline" className="text-warning border-warning/30">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!isRestrictedAdmin && !isInactive && (
                              <>
                              </>
                            )}
                            {canReactivate && isInactive && (
                              <>
                                <Badge variant="outline" className="mr-1 text-[10px] border-destructive/30 text-destructive">
                                  {STATUS_CONFIG[empStatus]?.label ?? empStatus}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-success hover:text-success"
                                  onClick={() => setAddBackDialog({ id: p.id, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? "staff"), status: empStatus })}
                                >
                                  <UserCheck className="h-4 w-4 mr-1" /> Reactivate
                                </Button>
                                {isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setDismissConfirmText(""); setDismissDialog({ id: p.id, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? "staff") }); }}
                                >
                                  <UserX className="h-4 w-4 mr-1" /> Dismiss
                                </Button>
                                )}
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/staff-management/${p.id}`)}>
                              <Eye className="h-4 w-4 mr-1" /> Open Profile
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {staffList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
           </TabsContent>
           <TabsContent value="org-chart" className="mt-4">
             <OrgChart embedded />
           </TabsContent>
           {isSuperAdmin && (
             <TabsContent value="administrators" className="mt-4">
               <UsersPage embedded />
             </TabsContent>
           )}
         </Tabs>
      </div>

      {/* Designation Dialog */}
      <Dialog open={!!designationDialog} onOpenChange={() => setDesignationDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Designation</DialogTitle>
            <DialogDescription>Set the staff member's position/title.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Staff Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">{STAFF_CATEGORIES.find(c => c.value === selectedCategory)?.help}</p>
            </div>
            <div>
              <Label>Designation</Label>
              <Select value={selectedDesignation} onValueChange={setSelectedDesignation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DESIGNATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedDesignation === "other" && (
              <div>
                <Label>Custom Title</Label>
                <Input value={customDesignation} onChange={(e) => setCustomDesignation(e.target.value)} placeholder="Enter custom designation" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesignationDialog(null)}>Cancel</Button>
            <Button
              onClick={() => designationDialog && assignDesignationMutation.mutate({ userId: designationDialog, designation: selectedDesignation, customDesig: customDesignation, category: selectedCategory })}
              disabled={assignDesignationMutation.isPending || (selectedDesignation === "other" && !customDesignation)}
            >
              {assignDesignationMutation.isPending ? "Saving..." : "Save Designation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog (Super Admin only) */}
      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update {roleDialog?.name}'s system role. This controls which sections of the app they can access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role</Label>
              <Select value={selectedNewRole} onValueChange={setSelectedNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="staff">Non-Teaching Staff</SelectItem>
                  <SelectItem value="admin">Branch Admin</SelectItem>
                  <SelectItem value="franchisee">Branch Manager</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Current role: <span className="font-medium">{getRoleLabel(roleDialog?.currentRole as any)}</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
            <Button
              onClick={() => roleDialog && changeRoleMutation.mutate({ userId: roleDialog.userId, newRole: selectedNewRole })}
              disabled={changeRoleMutation.isPending || selectedNewRole === roleDialog?.currentRole}
            >
              {changeRoleMutation.isPending ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resignation Dialog */}
      {resignDialog && (
        <ResignationDialog
          open={!!resignDialog}
          onOpenChange={() => setResignDialog(null)}
          staffName={resignDialog.name}
          isPending={resignMutation.isPending}
          onConfirm={(data) => {
            resignMutation.mutate({
              userId: resignDialog.id,
              ...data,
            });
          }}
        />
      )}

      {/* Create Staff Dialog */}
      <Dialog open={showCreateStaff} onOpenChange={setShowCreateStaff}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Staff Account</DialogTitle>
            <DialogDescription>Create a new staff account for this branch with all essential details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Personal Info Section */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Personal Information</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>First Name <span className="text-destructive">*</span></Label><Input value={createStaffForm.first_name} onChange={(e) => setCreateStaffForm({ ...createStaffForm, first_name: e.target.value })} placeholder="First name" /></div>
                  <div><Label>Last Name</Label><Input value={createStaffForm.last_name} onChange={(e) => setCreateStaffForm({ ...createStaffForm, last_name: e.target.value })} placeholder="Last name" /></div>
                </div>
                <div><Label>Email <span className="text-destructive">*</span></Label><Input type="email" value={createStaffForm.email} onChange={(e) => setCreateStaffForm({ ...createStaffForm, email: e.target.value })} placeholder="staff@example.com" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input value={createStaffForm.phone} onChange={(e) => setCreateStaffForm({ ...createStaffForm, phone: e.target.value })} placeholder="012-3456789" /></div>
                  <div><Label>IC / ID Number</Label><Input value={createStaffForm.ic_number} onChange={(e) => setCreateStaffForm({ ...createStaffForm, ic_number: e.target.value })} placeholder="XXXXXX-XX-XXXX" /></div>
                </div>
              </div>
            </div>
            {/* Employment Section */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Employment</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Role <span className="text-destructive">*</span></Label>
                  <Select value={createStaffForm.role} onValueChange={(v) => setCreateStaffForm({ ...createStaffForm, role: v, access_group_ids: v === "teacher" ? [] : createStaffForm.access_group_ids })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="staff">Non-Teaching Staff</SelectItem>
                      <SelectItem value="admin">Branch Admin (Manager)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {createStaffForm.role === "teacher" && "Full classroom & curriculum access."}
                    {createStaffForm.role === "staff" && "Operational staff (Marketing, Operations, Reception). Permissions come from assigned Role(s)."}
                    {createStaffForm.role === "admin" && "⚠️ Full branch management privileges."}
                  </p>
                </div>
                <div>
                  <Label>Designation</Label>
                  <Select value={createStaffForm.designation} onValueChange={(v) => setCreateStaffForm({ ...createStaffForm, designation: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {DESIGNATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3">
                <Label>Staff Category <span className="text-destructive">*</span></Label>
                <Select value={createStaffForm.category} onValueChange={(v) => setCreateStaffForm({ ...createStaffForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{STAFF_CATEGORIES.find(c => c.value === createStaffForm.category)?.help}</p>
              </div>
            </div>
            {/* Role Assignment (non-teacher only) */}
            {createStaffForm.role !== "teacher" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Role{createStaffForm.role === "staff" ? <span className="text-destructive"> *</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Determines what this user can view and edit. Manage roles under Administration → Roles & Permissions.
                </p>
                <div className="space-y-2 max-h-44 overflow-y-auto border rounded-md p-3">
                  {accessGroups
                    .filter((g: any) => !selectedBranchId || selectedBranchId === "all" || g.branch_id === selectedBranchId)
                    .map((g: any) => {
                      const checked = createStaffForm.access_group_ids.includes(g.id);
                      return (
                        <label key={g.id} className="flex items-start gap-2 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setCreateStaffForm({
                                ...createStaffForm,
                                access_group_ids: v
                                  ? [...createStaffForm.access_group_ids, g.id]
                                  : createStaffForm.access_group_ids.filter((id) => id !== g.id),
                              });
                            }}
                          />
                          <div className="text-xs">
                            <div className="font-medium">{g.name}</div>
                            {g.description && <div className="text-muted-foreground">{g.description}</div>}
                          </div>
                        </label>
                      );
                    })}
                  {accessGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground">No roles defined yet. Create one under Administration → Roles & Permissions.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateStaff(false)}>Cancel</Button>
            <Button
              onClick={handleCreateStaff}
              disabled={
                creatingStaff ||
                !createStaffForm.email ||
                !createStaffForm.first_name ||
                (createStaffForm.role === "staff" && createStaffForm.access_group_ids.length === 0)
              }
            >
              {creatingStaff ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Credentials Dialog */}
      {createdCredentials && (
        <ShareCredentialsDialog
          open={!!createdCredentials}
          onOpenChange={() => setCreatedCredentials(null)}
          email={createdCredentials.email}
          temporaryPassword={createdCredentials.password}
          userName={createdCredentials.name}
          branchId={selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : undefined}
        />
      )}

      {/* Reactivate Staff Dialog — Superadmin & HR Admin */}
      <Dialog open={!!addBackDialog} onOpenChange={(o) => { if (!o) setAddBackDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to reactivate {addBackDialog?.name}?</DialogTitle>
            <DialogDescription>
              This will restore the employee as an active staff member and make them available in payroll and HR modules
              again. Existing payroll, attendance, leave, OT and employment history remain unchanged — no duplicate
              staff record is created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={restoreBusy} onClick={() => setAddBackDialog(null)}>Cancel</Button>
            <Button
              disabled={restoreBusy}
              onClick={async () => {
                if (!addBackDialog) return;
                setRestoreBusy(true);
                try {
                  const previousStatus = addBackDialog.status;
                  const { error } = await supabase
                    .from("staff_profiles")
                    .update({ employment_status: "active", is_active: true, resignation_date: null, resignation_reason: null, last_working_date: null } as any)
                    .eq("user_id", addBackDialog.id);
                  if (error) throw error;
                  await supabase.from("audit_logs").insert({
                    actor_id: user?.id ?? null,
                    action: "restore_staff",
                    target_type: "staff",
                    target_id: addBackDialog.id,
                    target_label: addBackDialog.name,
                    metadata: { previous_status: previousStatus, new_status: "active" },
                  } as any);
                  queryClient.invalidateQueries({ queryKey: ["staff-profiles-all"] });
                  toast({ title: "Staff restored", description: `${addBackDialog.name} is active again.` });
                  setAddBackDialog(null);
                } catch (e: any) {
                  toast({ title: "Couldn't restore staff", description: e?.message ?? "", variant: "destructive" });
                } finally {
                  setRestoreBusy(false);
                }
              }}
            >
              {restoreBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss (Permanent Delete) Dialog — Superadmin only */}
      <Dialog open={!!dismissDialog} onOpenChange={(o) => { if (!o) { setDismissDialog(null); setDismissConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Permanently dismiss this staff record?
            </DialogTitle>
            <DialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{dismissDialog?.name}</span>'s
              account and profile. This action cannot be undone. Historical records tied to the employee (payroll,
              attendance, leave, OT, audit logs) remain in the system for compliance, but the user will no longer be
              able to sign in and their profile will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              Type <span className="font-mono font-semibold">{dismissDialog?.name}</span> to confirm.
            </Label>
            <Input
              value={dismissConfirmText}
              onChange={(e) => setDismissConfirmText(e.target.value)}
              placeholder={dismissDialog?.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={dismissBusy} onClick={() => { setDismissDialog(null); setDismissConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={dismissBusy || dismissConfirmText.trim() !== (dismissDialog?.name ?? "").trim()}
              onClick={async () => {
                if (!dismissDialog) return;
                setDismissBusy(true);
                try {
                  const { data, error } = await supabase.functions.invoke("admin-delete-user", {
                    body: { target_user_id: dismissDialog.id },
                  });
                  if (error) throw error;
                  if ((data as any)?.error) throw new Error((data as any).error);
                  queryClient.invalidateQueries({ queryKey: ["staff-profiles-all"] });
                  queryClient.invalidateQueries({ queryKey: ["profiles-all"] });
                  toast({ title: "Staff dismissed", description: `${dismissDialog.name} has been permanently removed.` });
                  setDismissDialog(null);
                  setDismissConfirmText("");
                } catch (e: any) {
                  toast({ title: "Couldn't dismiss staff", description: e?.message ?? "", variant: "destructive" });
                } finally {
                  setDismissBusy(false);
                }
              }}
            >
              {dismissBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Permanently Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
