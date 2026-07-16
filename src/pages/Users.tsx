import { useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import DashboardLayout from "@/components/DashboardLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Users as UsersIcon, Search, Shield, UserPlus, GraduationCap, FolderKey, Plus, Pencil, Trash2, UserCheck, BookOpen, School, KeyRound, MailCheck, Loader2, ChevronDown, ChevronRight, Copy, RefreshCw, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getRoleLabel, useAuth } from "@/lib/auth";
import type { Tables, Enums } from "@/integrations/supabase/types";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import ShareCredentialsDialog from "@/components/ShareCredentialsDialog";

type Profile = Tables<"profiles">;
type AppRole = Enums<"app_role">;

const roleBadgeClasses: Record<string, string> = {
  super_admin: "bg-[hsl(var(--role-super-admin))] text-white",
  franchisee: "bg-[hsl(var(--role-franchisee))] text-white",
  admin: "bg-[hsl(var(--role-admin))] text-white",
  teacher: "bg-[hsl(var(--role-teacher))] text-white",
  parent: "bg-[hsl(var(--role-parent))] text-white",
};

const SUB_MODULE_MAP: Record<string, string[]> = {
  "/finance/kpi-dashboard": ["/finance/ar-aging", "/finance/reports"],
  "/finance/collections": ["/finance/unallocated"],
  "/finance/billing-settings": ["/finance/approval-rules", "/finance/gateway-events", "/finance/reconciliation"],
  "/accounting/reports": ["/cashflow"],
};

// Module groups mirror the sidebar (DashboardLayout.tsx) so admins build
// access groups using the same section labels they navigate by.
const MODULE_GROUPS = [
  {
    label: "Dashboard",
    items: [
      { path: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    label: "Administration",
    items: [
      { path: "/organizations", label: "Organizations" },
      { path: "/branches", label: "Branches" },
      { path: "/users", label: "Administrators" },
      { path: "/eforms", label: "Registration Forms" },
      { path: "/data-migration", label: "Data Migration" },
      { path: "/admin/email", label: "Email" },
      { path: "/admin/parent-onboarding", label: "Parent Onboarding" },
      { path: "/admin/school-documents", label: "School Documents" },
      { path: "/settings/email-templates", label: "Email Templates" },
    ],
  },
  {
    label: "Admissions",
    items: [
      { path: "/crm", label: "Admissions Pipeline" },
      { path: "/assessments", label: "Admissions Library" },
    ],
  },
  {
    label: "Students",
    items: [
      { path: "/students", label: "Student Directory" },
      { path: "/classrooms", label: "Classrooms & Attendance" },
      { path: "/daily-updates", label: "Learning Journal" },
      { path: "/student-journey", label: "Student Timeline" },
      { path: "/observations", label: "Observations" },
      { path: "/attendance", label: "Attendance" },
      { path: "/learning-stories", label: "Learning Stories" },
      { path: "/learning-media", label: "Learning Media" },
    ],
  },
  {
    label: "My Planning",
    items: [
      { path: "/timetables", label: "My Timetable" },
      { path: "/curriculum/monthly", label: "Monthly Planner" },
      { path: "/curriculum/weekly", label: "Weekly Focus" },
      { path: "/lesson-planner", label: "Lesson Plans" },
      { path: "/curriculum/centers", label: "Learning Centers" },
    ],
  },
  {
    label: "Parent Communication",
    items: [
      { path: "/curriculum/ptm", label: "Parent Meetings (PTM)" },
      { path: "/curriculum/ptm/slots", label: "PTM Slots" },
      { path: "/curriculum/ptm/prep", label: "PTM Prep" },
      { path: "/staff-inbox", label: "Parent Inbox" },
      { path: "/announcements", label: "Announcements" },
      { path: "/newsletters", label: "Newsletters" },
    ],
  },
  {
    label: "Curriculum Setup",
    items: [
      { path: "/curriculum/command-center", label: "Curriculum Command Center" },
      { path: "/curriculum-framework", label: "Curriculum Framework" },
      { path: "/curriculum", label: "Curriculum (legacy)" },
      { path: "/theme-bank", label: "Theme Bank" },
      { path: "/yearly-outcomes", label: "Learning Goals" },
      { path: "/objective-bank", label: "Term Objectives" },
      { path: "/yearly-planner", label: "Yearly Planner" },
      { path: "/school-calendar", label: "School Calendar" },
      { path: "/worksheets", label: "Teaching Resources" },
      { path: "/development-domains", label: "Development Domains" },
    ],
  },
  {
    label: "Insights & Dashboards",
    items: [
      { path: "/planning-hub", label: "Planning Hub" },
      { path: "/curriculum/readiness", label: "Class Readiness Report" },
      { path: "/curriculum/readiness/dashboard", label: "Readiness Dashboard" },
      { path: "/curriculum/dashboard/review", label: "Academic Overview" },
      { path: "/curriculum/dashboard/all-plans", label: "Lesson Plan Review" },
      { path: "/curriculum/dashboard/coverage", label: "Curriculum Coverage" },
      { path: "/curriculum/dashboard/quality", label: "Planning Quality" },
      { path: "/curriculum/dashboard/ptm", label: "PTM Dashboard" },
      { path: "/analytics", label: "Analytics" },
      { path: "/install/analytics", label: "Install Analytics" },
      { path: "/notifications", label: "Notifications" },
    ],
  },
  {
    label: "Human Resource",
    items: [
      { path: "/hr-settings", label: "HR Settings" },
      { path: "/hr-calendar", label: "HR Calendar" },
      { path: "/staff-management", label: "Staff Management" },
      { path: "/staff-attendance", label: "Staff Attendance" },
      { path: "/overtime", label: "OT Requests" },
      { path: "/claims", label: "Reimbursements" },
      { path: "/leave", label: "Leave Management" },
      { path: "/payroll", label: "Payroll" },
      { path: "/my-payslips", label: "My Payslips" },
      { path: "/staff-performance", label: "Performance" },
      { path: "/announcements?audience=staff", label: "Staff Announcements" },
      { path: "/newsletters?audience=staff", label: "Staff Newsletters" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { path: "/accounting/accounts", label: "Chart of Accounts" },
      { path: "/accounting/transactions", label: "Transactions" },
      { path: "/accounting/budget", label: "Budget" },
      { path: "/accounting/reports", label: "Reports", children: ["/cashflow"], subItems: [{ path: "/cashflow", label: "Cashflow" }] },
      { path: "/branch-financials", label: "Branch Financials" },
    ],
  },
  {
    label: "Billing & Receivables",
    items: [
      { path: "/finance/kpi-dashboard", label: "Finance KPIs" },
      { path: "/finance/invoices", label: "Invoices" },
      { path: "/finance/refunds", label: "Refunds & Credits" },
      { path: "/finance/accounts", label: "Customer Accounts (Students)" },
      { path: "/finance/payers", label: "Family Accounts (Payers)" },
      { path: "/finance/collections", label: "Collections" },
      { path: "/finance/disputes", label: "Disputes & Locked Funds" },
      { path: "/finance/transactions", label: "Transaction Ledger" },
      { path: "/finance/pricing", label: "Pricing & Rules" },
      { path: "/fee-packages", label: "Fee Packages" },
      { path: "/finance/approvals", label: "Approval Inbox" },
      { path: "/finance/billing-settings", label: "Billing Settings" },
    ],
  },
  {
    label: "QA & Compliance",
    items: [
      { path: "/qa-dashboard", label: "QA Dashboard" },
      { path: "/qa-audit", label: "Field Audit" },
      { path: "/qa-compliance", label: "Compliance" },
      { path: "/royalty-dashboard", label: "Branch Royalties" },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/settings", label: "Settings" },
      { path: "/help", label: "Help Center" },
    ],
  },
];

// Flatten for lookups
const AVAILABLE_MODULES = MODULE_GROUPS.flatMap((g) => g.items);

// "Manager Access" reuses the same sidebar grouping. Read-only-by-default routes
// (Dashboard, Settings, Help, Notifications, Install Analytics) are excluded
// from manager-grants since they don't have branch-wide write actions.
const NON_MANAGEABLE = new Set<string>([
  "/dashboard",
  "/settings",
  "/help",
  "/notifications",
  "/install/analytics",
  "/my-payslips",
]);
const MANAGEABLE_MODULE_GROUPS = MODULE_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((i) => !NON_MANAGEABLE.has(i.path)) }))
  .filter((g) => g.items.length > 0);

// Access Group Presets
const ACCESS_GROUP_PRESETS: { name: string; description: string; allowedRoutes: string[]; managedRoutes: string[] }[] = [
  {
    name: "HR Admin",
    description: "Full access to Human Resource modules",
    allowedRoutes: ["/dashboard", "/staff-management", "/staff-attendance", "/overtime", "/claims", "/leave", "/payroll", "/my-payslips", "/hr-settings", "/hr-calendar", "/staff-performance"],
    managedRoutes: ["/staff-management", "/staff-attendance", "/overtime", "/claims", "/leave", "/payroll", "/hr-settings", "/hr-calendar", "/staff-performance"],
  },
  {
    name: "Finance Admin",
    description: "Full access to Billing & Receivables modules",
    allowedRoutes: ["/dashboard", "/finance/kpi-dashboard", "/finance/ar-aging", "/finance/reports", "/finance/invoices", "/finance/refunds", "/finance/accounts", "/finance/payers", "/finance/collections", "/finance/unallocated", "/finance/disputes", "/finance/transactions", "/finance/pricing", "/finance/approvals", "/finance/billing-settings", "/finance/approval-rules", "/finance/gateway-events", "/finance/reconciliation"],
    managedRoutes: ["/finance/invoices", "/finance/refunds", "/finance/collections", "/finance/pricing", "/finance/approvals", "/finance/billing-settings"],
  },
  {
    name: "Accounting Admin",
    description: "Full access to Accounting & Financial reports",
    allowedRoutes: ["/dashboard", "/accounting/accounts", "/accounting/transactions", "/accounting/budget", "/accounting/reports", "/cashflow", "/branch-financials"],
    managedRoutes: ["/accounting/accounts", "/accounting/transactions", "/accounting/budget", "/accounting/reports", "/branch-financials"],
  },
  {
    name: "School Clerk",
    description: "Student admin, attendance, timetables, communication & enrollment",
    allowedRoutes: ["/dashboard", "/students", "/attendance", "/timetables", "/classrooms", "/school-calendar", "/daily-updates", "/announcements", "/newsletters", "/eforms", "/crm", "/notifications"],
    managedRoutes: ["/students", "/attendance", "/timetables"],
  },
  {
    name: "Academic Admin",
    description: "Academic management: students, curriculum, lesson planning, observations",
    allowedRoutes: ["/dashboard", "/students", "/student-journey", "/observations", "/attendance", "/timetables", "/classrooms", "/school-calendar", "/daily-updates", "/learning-stories", "/learning-media", "/planning-hub", "/lesson-planner", "/yearly-planner", "/curriculum/monthly", "/curriculum/weekly", "/curriculum/dashboard/all-plans", "/curriculum/dashboard/review", "/curriculum/dashboard/coverage", "/curriculum/dashboard/quality", "/curriculum", "/development-domains", "/age-outcomes", "/theme-bank", "/objective-bank", "/worksheets", "/curriculum/centers", "/assessments", "/curriculum/ptm", "/curriculum/ptm/slots", "/curriculum/ptm/prep", "/curriculum/ptm/meetings", "/curriculum/readiness", "/curriculum/readiness/dashboard"],
    managedRoutes: ["/students", "/observations", "/attendance", "/timetables", "/lesson-planner", "/yearly-planner", "/curriculum/monthly", "/curriculum/weekly", "/curriculum", "/theme-bank", "/objective-bank", "/worksheets", "/assessments", "/curriculum/ptm", "/curriculum/ptm/slots", "/curriculum/readiness"],
  },
  {
    name: "Marketing & Enrollment",
    description: "CRM, communication channels, e-Forms",
    allowedRoutes: ["/dashboard", "/crm", "/eforms", "/announcements", "/newsletters", "/staff-inbox"],
    managedRoutes: ["/crm", "/eforms", "/announcements", "/newsletters"],
  },
  {
    name: "Operations & QA",
    description: "Quality assurance, compliance and auditing",
    allowedRoutes: ["/dashboard", "/qa-dashboard", "/qa-audit", "/qa-compliance", "/royalty-dashboard", "/branch-financials", "/analytics", "/install/analytics", "/notifications"],
    managedRoutes: ["/qa-audit", "/qa-compliance"],
  },
  {
    name: "System Administrator",
    description: "Manage users, branches, organizations & system settings",
    allowedRoutes: ["/dashboard", "/users", "/branches", "/organizations", "/admin/parent-onboarding", "/admin/school-documents", "/admin/email", "/settings/email-templates", "/settings", "/data-migration", "/notifications", "/help"],
    managedRoutes: ["/users", "/branches", "/organizations", "/admin/parent-onboarding", "/admin/school-documents", "/admin/email", "/settings/email-templates", "/settings", "/data-migration"],
  },
];

export default function Users({ embedded = false }: { embedded?: boolean } = {}) {
  const { role: myRole, user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleDialog, setRoleDialog] = useState<{ userId: string; currentRole: AppRole | null } | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("franchisee");
  const [branchDialog, setBranchDialog] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");

  // Class assignment state
  const [classDialog, setClassDialog] = useState<{ userId: string; membershipId: string; branchId: string; currentClassIds: string[] } | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  // Access Groups state
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string; description: string; branchIds: string[]; allowedRoutes: string[]; managedRoutes: string[] } | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [duplicateDialog, setDuplicateDialog] = useState<{ sourceId: string; name: string; sourceBranchId: string; allowedRoutes: string[]; managedRoutes: string[]; description: string | null; targetBranchIds: string[] } | null>(null);
  const [expandedNameGroups, setExpandedNameGroups] = useState<Record<string, boolean>>({});
  const [memberDialog, setMemberDialog] = useState<string | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [selectedMemberUser, setSelectedMemberUser] = useState("");
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [adminActionLoading, setAdminActionLoading] = useState<string | null>(null);

  // Create Administrator state
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [createAdminForm, setCreateAdminForm] = useState({ email: "", first_name: "", last_name: "", role: "franchisee" as string, branch_id: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string; branchId?: string } | null>(null);

  const isSuperAdmin = myRole === "super_admin";

  const handleAdminAction = async (userId: string, action: "reset_password" | "resend_confirmation") => {
    setAdminActionLoading(`${userId}_${action}`);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action, target_user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Success", description: data.message });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAdminActionLoading(null);
  };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*, organizations(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["all-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branch_memberships").select("*, branches(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: allClasses = [] } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").eq("is_active", true).order("class_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: parentStudentLinks = [] } = useQuery({
    queryKey: ["parent-student-links-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parent_students").select("*, students(first_name, last_name, class_name)");
      if (error) throw error;
      return data;
    },
  });

  // Access Groups queries
  const { data: accessGroups = [] } = useQuery({
    queryKey: ["access-groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_groups").select("*, branches(name)").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ["access-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("access_group_members").select("*");
      if (error) throw error;
      return data;
    },
  });

  const roleMap: Record<string, AppRole> = {};
  userRoles.forEach((r) => { roleMap[r.user_id] = r.role; });

  // A user may have multiple roles (e.g. admin + parent). Track them all so
  // staff selectors don't exclude someone whose "last" row happened to be parent.
  const userRolesSet: Record<string, Set<AppRole>> = {};
  userRoles.forEach((r) => {
    if (!userRolesSet[r.user_id]) userRolesSet[r.user_id] = new Set();
    userRolesSet[r.user_id].add(r.role);
  });

  const membershipMap: Record<string, typeof memberships> = {};
  memberships.forEach((m) => {
    if (!membershipMap[m.user_id]) membershipMap[m.user_id] = [];
    membershipMap[m.user_id].push(m);
  });

  // Build class name lookup
  const classNameMap: Record<string, string> = {};
  allClasses.forEach((c: any) => { classNameMap[c.id] = c.class_name; });

  const parentLinksMap: Record<string, any[]> = {};
  parentStudentLinks.forEach((pl: any) => {
    if (!parentLinksMap[pl.parent_id]) parentLinksMap[pl.parent_id] = [];
    parentLinksMap[pl.parent_id].push(pl);
  });

  const groupMemberCountMap: Record<string, number> = {};
  const groupMembersByGroup: Record<string, any[]> = {};
  groupMembers.forEach((gm: any) => {
    groupMemberCountMap[gm.group_id] = (groupMemberCountMap[gm.group_id] || 0) + 1;
    if (!groupMembersByGroup[gm.group_id]) groupMembersByGroup[gm.group_id] = [];
    groupMembersByGroup[gm.group_id].push(gm);
  });

  // Only show super_admin and franchisee users in this page
  const adminUsers = useMemo(() => users.filter((u) => {
    const r = roleMap[u.id];
    return r === "super_admin" || r === "franchisee";
  }), [users, roleMap]);

  // Keep staffUsers for access group member selection — include anyone with
  // ANY non-parent role (admin/teacher/franchisee/super_admin).
  const staffUsers = useMemo(
    () =>
      users.filter((u) => {
        const roles = userRolesSet[u.id];
        if (!roles || roles.size === 0) return false;
        return Array.from(roles).some((r) => r !== "parent");
      }),
    [users, userRoles],
  );

  const filteredAdmins = adminUsers.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateAdmin = async () => {
    setCreatingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: createAdminForm.email.trim(),
          first_name: createAdminForm.first_name.trim(),
          last_name: createAdminForm.last_name.trim(),
          role: createAdminForm.role,
          branch_id: createAdminForm.branch_id || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreatedCredentials({
        email: data.email,
        password: data.temporary_password,
        name: `${createAdminForm.first_name} ${createAdminForm.last_name}`.trim(),
        branchId: createAdminForm.branch_id || undefined,
      });
      setShowCreateAdmin(false);
      setCreateAdminForm({ email: "", first_name: "", last_name: "", role: "franchisee", branch_id: "" });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-memberships"] });
      toast({ title: "Administrator created successfully" });
    } catch (e: any) {
      toast({ title: "Error creating user", description: e.message, variant: "destructive" });
    }
    setCreatingAdmin(false);
  };

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      setRoleDialog(null);
      toast({ title: "Role assigned" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignBranchMutation = useMutation({
    mutationFn: async ({ userId, branchId }: { userId: string; branchId: string }) => {
      // Check if already assigned
      const existing = memberships.find((m) => m.user_id === userId && m.branch_id === branchId);
      if (existing) {
        throw new Error("User is already assigned to this branch.");
      }
      const { error } = await supabase.from("branch_memberships").insert({ user_id: userId, branch_id: branchId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-memberships"] });
      setBranchDialog(null); setSelectedBranch("");
      toast({ title: "Branch assigned" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMembershipMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("branch_memberships").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-memberships"] });
      toast({ title: "Membership removed" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Class assignment mutation
  const assignClassesMutation = useMutation({
    mutationFn: async ({ membershipId, classIds }: { membershipId: string; classIds: string[] }) => {
      const { error } = await supabase
        .from("branch_memberships")
        .update({ assigned_class_ids: classIds.length > 0 ? classIds : null })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-memberships"] });
      setClassDialog(null);
      toast({ title: "Classes assigned", description: "Teacher's class assignments have been updated." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Access Groups mutations
  const saveGroupMutation = useMutation({
    mutationFn: async (group: { id?: string; name: string; description: string; branchIds: string[]; allowedRoutes: string[]; managedRoutes: string[] }) => {
      if (group.id) {
        const { error } = await supabase.from("access_groups").update({
          name: group.name,
          description: group.description || null,
          allowed_routes: group.allowedRoutes,
          managed_routes: group.managedRoutes,
        } as any).eq("id", group.id);
        if (error) throw error;
        return { created: 0, updated: 1 };
      } else {
        if (!group.branchIds.length) throw new Error("Select at least one branch.");
        const rows = group.branchIds.map((bid) => ({
          name: group.name,
          description: group.description || null,
          branch_id: bid,
          allowed_routes: group.allowedRoutes,
          managed_routes: group.managedRoutes,
        }));
        const { error } = await supabase.from("access_groups").insert(rows as any);
        if (error) throw error;
        return { created: rows.length, updated: 0 };
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      setGroupDialog(null);
      if (res?.created && res.created > 1) {
        toast({ title: "Access group created", description: `Applied to ${res.created} branches.` });
      } else {
        toast({ title: "Access group saved" });
      }
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Duplicate an existing group to additional branches
  const duplicateGroupMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string | null; allowedRoutes: string[]; managedRoutes: string[]; targetBranchIds: string[] }) => {
      const rows = payload.targetBranchIds.map((bid) => ({
        name: payload.name,
        description: payload.description,
        branch_id: bid,
        allowed_routes: payload.allowedRoutes,
        managed_routes: payload.managedRoutes,
      }));
      const { error } = await supabase.from("access_groups").insert(rows as any);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      setDuplicateDialog(null);
      toast({ title: "Copied", description: `Group cloned to ${count} branch${count === 1 ? "" : "es"}.` });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Sync every sibling group with the same name to match this group's routes
  const syncGroupMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const source = (accessGroups as any[]).find((g) => g.id === sourceId);
      if (!source) throw new Error("Source group not found");
      const siblings = (accessGroups as any[]).filter((g) => g.name === source.name && g.id !== source.id);
      if (siblings.length === 0) return 0;
      const { error } = await supabase
        .from("access_groups")
        .update({
          allowed_routes: source.allowed_routes,
          managed_routes: source.managed_routes,
          description: source.description ?? null,
        } as any)
        .in("id", siblings.map((s) => s.id));
      if (error) throw error;
      return siblings.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      toast({ title: "Synced", description: `${count} sibling group${count === 1 ? "" : "s"} updated.` });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("access_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      toast({ title: "Access group deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const { error } = await supabase.from("access_group_members").insert({ group_id: groupId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-group-members"] });
      setSelectedMemberUser("");
      toast({ title: "Member added" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("access_group_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-group-members"] });
      toast({ title: "Member removed" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleLibraryMutation = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) => {
      const { error } = await supabase.from("profiles").update({ can_manage_library: value } as any).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      toast({ title: "Library access updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (targetUser: Profile) => {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { target_user_id: targetUser.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["all-memberships"] });
      setDeleteUser(null);
      toast({ title: "User deleted", description: "User and all related data have been permanently removed." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const userNameMap: Record<string, string> = {};
  users.forEach((u) => { userNameMap[u.id] = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email; });

  const openClassDialog = (userId: string) => {
    const userMemberships = membershipMap[userId] || [];
    if (userMemberships.length === 0) {
      toast({ title: "No branch assigned", description: "Assign a branch first before assigning classes.", variant: "destructive" });
      return;
    }
    // Use first membership
    const membership = userMemberships[0];
    const currentIds = membership.assigned_class_ids || [];
    setClassDialog({
      userId,
      membershipId: membership.id,
      branchId: membership.branch_id,
      currentClassIds: currentIds,
    });
    setSelectedClassIds(currentIds);
  };

  const branchClasses = classDialog ? allClasses.filter((c: any) => c.branch_id === classDialog.branchId) : [];

  // Helper to get assigned class names for a user
  const getAssignedClassNames = (userId: string): string[] => {
    const userMemberships = membershipMap[userId] || [];
    const classIds = userMemberships.flatMap((m) => m.assigned_class_ids || []);
    return classIds.map((id) => classNameMap[id]).filter(Boolean);
  };

  const content = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administrators</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage Super Admins & Branch Managers</p>
          </div>
          <Button onClick={() => setShowCreateAdmin(true)}>
            <UserPlus className="h-4 w-4 mr-2" />Create Administrator
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search administrators..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Access Groups have moved. Manage role-based permissions under <strong>Administration → Roles & Permissions</strong>.
          </div>
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : filteredAdmins.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-muted-foreground">
                    <Shield className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm">No administrators yet.</p>
                    <Button size="sm" className="mt-3" onClick={() => setShowCreateAdmin(true)}>
                      <UserPlus className="h-4 w-4 mr-2" />Create the first Administrator
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Branches</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdmins.map((u) => {
                        const r = roleMap[u.id];
                        const userMems = membershipMap[u.id] || [];
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.first_name} {u.last_name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                            <TableCell>
                              <Badge className={roleBadgeClasses[r] || ""}>{r ? getRoleLabel(r) : "No role"}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                {userMems.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">No branches</span>
                                ) : userMems.map((m: any) => (
                                  <Badge key={m.id} variant="secondary" className="text-[10px] gap-1">
                                    {m.branches?.name || "—"}
                                    {isSuperAdmin && (
                                      <button
                                        onClick={() => removeMembershipMutation.mutate(m.id)}
                                        className="ml-0.5 opacity-60 hover:opacity-100"
                                        title="Remove from this branch"
                                      >×</button>
                                    )}
                                  </Badge>
                                ))}
                                {isSuperAdmin && (
                                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setBranchDialog(u.id); setSelectedBranch(""); }}>
                                    <Plus className="h-3 w-3 mr-1" />Branch
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {isSuperAdmin && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setRoleDialog({ userId: u.id, currentRole: r }); setSelectedRole(r || "franchisee"); }}>
                                      <Shield className="h-3 w-3 mr-1" />Role
                                    </Button>
                                    <Button
                                      variant="ghost" size="sm" className="h-7 text-xs"
                                      disabled={adminActionLoading === `${u.id}_reset_password`}
                                      onClick={() => handleAdminAction(u.id, "reset_password")}
                                    >
                                      {adminActionLoading === `${u.id}_reset_password`
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <><KeyRound className="h-3 w-3 mr-1" />Reset</>}
                                    </Button>
                                    {currentUser?.id !== u.id && (
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteUser(u)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
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
        </div>
      </div>

      {/* Create Administrator Dialog */}
      <Dialog open={showCreateAdmin} onOpenChange={setShowCreateAdmin}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Administrator</DialogTitle>
            <DialogDescription>Create a new Super Admin or Branch Manager account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={createAdminForm.first_name} onChange={(e) => setCreateAdminForm({ ...createAdminForm, first_name: e.target.value })} placeholder="First name" />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={createAdminForm.last_name} onChange={(e) => setCreateAdminForm({ ...createAdminForm, last_name: e.target.value })} placeholder="Last name" />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={createAdminForm.email} onChange={(e) => setCreateAdminForm({ ...createAdminForm, email: e.target.value })} placeholder="admin@example.com" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={createAdminForm.role} onValueChange={(v) => setCreateAdminForm({ ...createAdminForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="franchisee">Branch Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createAdminForm.role === "franchisee" && (
              <div>
                <Label>Assign to Branch</Label>
                <Select value={createAdminForm.branch_id} onValueChange={(v) => setCreateAdminForm({ ...createAdminForm, branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAdmin(false)}>Cancel</Button>
            <Button onClick={handleCreateAdmin} disabled={creatingAdmin || !createAdminForm.email || !createAdminForm.first_name}>
              {creatingAdmin ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Account"}
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
          branchId={createdCredentials.branchId}
        />
      )}

      {/* Role Assignment Dialog */}
      <Dialog open={!!roleDialog} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>Change the user's role in the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                <SelectItem value="franchisee">Branch Manager</SelectItem>
                <SelectItem value="admin">Branch Admin</SelectItem>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="staff">Non-Teaching Staff</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Switching to <strong>Non-Teaching Staff</strong> or <strong>Teacher</strong> may require re-assigning Roles.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
            <Button onClick={() => roleDialog && assignRoleMutation.mutate({ userId: roleDialog.userId, role: selectedRole })} disabled={assignRoleMutation.isPending}>
              {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Assignment Dialog */}
      <Dialog open={!!branchDialog} onOpenChange={() => setBranchDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Branch</DialogTitle>
            <DialogDescription>Add this user to a branch.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Branch</Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                {branches
                  .filter((b) => !(membershipMap[branchDialog!] || []).some((m) => m.branch_id === b.id))
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} — {(b as any).organizations?.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {branchDialog && (membershipMap[branchDialog] || []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Already assigned to: {(membershipMap[branchDialog] || []).map((m: any) => m.branches?.name).join(", ")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialog(null)}>Cancel</Button>
            <Button onClick={() => branchDialog && selectedBranch && assignBranchMutation.mutate({ userId: branchDialog, branchId: selectedBranch })} disabled={!selectedBranch || assignBranchMutation.isPending}>
              {assignBranchMutation.isPending ? "Assigning..." : "Assign Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Class Assignment Dialog */}
      <Dialog open={!!classDialog} onOpenChange={() => setClassDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <School className="h-5 w-5" />
              Assign Classes
            </DialogTitle>
            <DialogDescription>
              Select which classes this teacher can access. Leave all unchecked for access to all classes.
            </DialogDescription>
          </DialogHeader>
          {classDialog && (
            <div className="space-y-4">
              {branchClasses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <School className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No classes found for this branch.</p>
                  <p className="text-xs mt-1">Create classes in the Students page first.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {branchClasses.map((cls: any) => (
                      <label
                        key={cls.id}
                        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={selectedClassIds.includes(cls.id)}
                          onCheckedChange={(checked) => {
                            setSelectedClassIds(
                              checked
                                ? [...selectedClassIds, cls.id]
                                : selectedClassIds.filter((id) => id !== cls.id)
                            );
                          }}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{cls.class_name}</p>
                          <p className="text-xs text-muted-foreground">Age Group: {cls.age_group}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                    <School className="h-4 w-4 shrink-0" />
                    <span>
                      {selectedClassIds.length === 0
                        ? "No classes selected — teacher will have access to ALL classes in this branch."
                        : `${selectedClassIds.length} class${selectedClassIds.length > 1 ? "es" : ""} selected. Teacher will only see students, observations, and lesson plans for these classes.`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassDialog(null)}>Cancel</Button>
            <Button
              onClick={() => classDialog && assignClassesMutation.mutate({ membershipId: classDialog.membershipId, classIds: selectedClassIds })}
              disabled={assignClassesMutation.isPending || branchClasses.length === 0}
            >
              {assignClassesMutation.isPending ? "Saving..." : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Delete User Confirm */}
      <ConfirmDeleteDialog
        open={!!deleteUser}
        onOpenChange={(open) => { if (!open) setDeleteUser(null); }}
        title="Permanently Delete User"
        description={`This will permanently delete ${deleteUser?.first_name} ${deleteUser?.last_name} (${deleteUser?.email}) and remove their authentication account.`}
        confirmLabel="Delete User"
        confirmText={deleteUser?.email ?? ""}
        affectedItems={[
          "User roles",
          "Branch memberships",
          "Role memberships",
          "Notification preferences",
          "Notifications",
          "Conversation participations",
          "Profile record",
          "Authentication account",
        ]}
        isPending={deleteUserMutation.isPending}
        onConfirm={() => deleteUser && deleteUserMutation.mutate(deleteUser)}
      />
    </>
  );
  return embedded ? content : <DashboardLayout>{content}</DashboardLayout>;
}
