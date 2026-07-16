import { ReactNode, useState, useEffect, useMemo, useRef } from "react";
import StaffOnboardingWizard from "@/components/StaffOnboardingWizard";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useNotificationFeed } from "@/hooks/use-notification-feed";
import { SwipeableNotification } from "@/components/SwipeableNotification";
import { useAppBadge } from "@/hooks/use-app-badge";
import { useAuth, getRoleLabel } from "@/lib/auth";
import BottomTabBar from "@/components/dashboard/BottomTabBar";
import ParentBottomTabBar from "@/components/dashboard/ParentBottomTabBar";
import TeacherBottomTabBar from "@/components/dashboard/TeacherBottomTabBar";
import { ParentTopBar } from "@/components/parent/ParentTopBar";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useBranding } from "@/hooks/use-branding";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useIsMobile } from "@/hooks/use-mobile";

function SidebarExpandOnNavListener() {
  const { setOpen, isMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) return;
    const handler = () => setOpen(true);
    window.addEventListener("sprouts:sidebar-expand", handler);
    return () => window.removeEventListener("sprouts:sidebar-expand", handler);
  }, [setOpen, isMobile]);
  return null;
}
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { GetMobileAppButton } from "@/components/GetMobileAppButton";
import { toast as sonnerToast } from "sonner";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCog,
  Database,
  GraduationCap,
  BookOpen,
  ClipboardList,
  Eye,
  MessageSquare,
  LogOut,
  Settings,
  BarChart3,
  Clock,
  CalendarDays,
  DollarSign,
  FileText,
  Receipt,
  ChevronDown,
  Briefcase,
  Star,
  Bell,
  Megaphone,
  Landmark,
  BookText,
  Wallet,
  PieChart,
  UserPlus,
  Shield,
  ClipboardCheck,
  Package,
  HelpCircle,
  CreditCard,
  ShieldAlert,
  Activity,
  ArrowRightLeft,
  Layers,
  Target,
  Palette,
  Microscope,
  HeartPulse,
  Camera,
  Smartphone,
  Sparkles,
  TrendingUp,
  Heart,
  CalendarCheck,
  Mail,
  Home,
  KeyRound,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import {
  SidebarBrandCard,
  SidebarItem,
  SidebarNestedItem,
  SidebarNestedGroup,
  SidebarSubGroup,
  SidebarFooterCard,
} from "@/components/sidebar/parts";
import { filterNavEntries } from "./nav-filter";
import { GlobalSearch } from "./GlobalSearch";

export type NavItem = { label: string; icon: React.ElementType; path: string; subLabel?: string };
export type NavSubGroup = { subGroup: string; icon: React.ElementType; items: NavItem[] };
export type NavGroup = { group: string; icon: React.ElementType; items: (NavItem | NavSubGroup)[] };
export type NavEntry = NavItem | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "group" in entry;
}

export function isSubGroup(item: NavItem | NavSubGroup): item is NavSubGroup {
  return "subGroup" in item;
}

export const roleNavEntries: Record<string, NavEntry[]> = {
  super_admin: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { group: "Administration", icon: Building2, items: [
      { label: "Organizations", icon: Building2, path: "/organizations" },
      { label: "Branches", icon: Building2, path: "/branches" },
      { label: "Roles & Permissions", icon: Shield, path: "/admin/role-matrix" },
      { label: "Temp Password", icon: KeyRound, path: "/admin/temp-password" },
      { label: "Registration Forms", icon: ClipboardList, path: "/eforms" },
      { label: "Data Migration", icon: Database, path: "/data-migration" },
      { label: "Email", icon: Mail, path: "/admin/email" },
      { label: "Parent Onboarding", icon: FileText, path: "/admin/parent-onboarding" },
    ]},
    { group: "Admissions", icon: UserPlus, items: [
      { label: "Admissions Pipeline", icon: UserPlus, path: "/crm" },
      { label: "Admissions Library", icon: ClipboardCheck, path: "/assessments" },
    ]},
    { group: "Students", icon: GraduationCap, items: [
      { label: "Student Directory", icon: Users, path: "/students" },
      { label: "Classrooms & Attendance", icon: GraduationCap, path: "/classrooms" },
      { label: "Learning Journal", icon: Camera, path: "/daily-updates" },
      { label: "Class Readiness Report", icon: HeartPulse, path: "/curriculum/readiness" },
    ]},
    { group: "Curriculum & Quality", icon: BookOpen, items: [
      { label: "Curriculum Command Center", icon: Layers, path: "/curriculum/command-center" },
      { label: "Teaching Resources", icon: FileText, path: "/worksheets" },
      { label: "School Calendar", icon: CalendarDays, path: "/school-calendar" },
      { label: "My Timetable", icon: CalendarDays, path: "/timetables" },
    ]},
    { group: "Parent Communication", icon: MessageSquare, items: [
      { label: "Parent Meetings (PTM)", icon: CalendarDays, path: "/curriculum/ptm" },
      { label: "PTM Dashboard", icon: FileText, path: "/curriculum/dashboard/ptm" },
      { label: "Parent Inbox", icon: MessageSquare, path: "/staff-inbox" },
      { label: "School Documents", icon: FileText, path: "/admin/school-documents" },
    ]},
    { group: "Communication Hub", icon: Megaphone, items: [
      { label: "Announcements", icon: Megaphone, path: "/announcements" },
      { label: "Newsletter", icon: FileText, path: "/newsletters" },
    ]},
    { group: "Human Resource", icon: Briefcase, items: [
      { label: "HR Settings", icon: Settings, path: "/hr-settings" },
      { label: "HR Calendar", icon: CalendarDays, path: "/hr-calendar" },
      { label: "Staff Management", icon: UserCog, path: "/staff-management" },
      { label: "Staff Attendance", icon: Clock, path: "/staff-attendance" },
      { label: "OT Requests", icon: Clock, path: "/overtime" },
      { label: "Reimbursements", icon: Receipt, path: "/claims" },
      { label: "Leave Management", icon: CalendarDays, path: "/leave" },
      { label: "Payroll", icon: DollarSign, path: "/payroll" },
      { label: "My Payslips", icon: FileText, path: "/my-payslips" },
      { label: "Performance", icon: Star, path: "/staff-performance" },
    ]},
    { group: "Accounting", icon: Landmark, items: [
      { label: "Chart of Accounts", icon: BookText, path: "/accounting/accounts" },
      { label: "Transactions", icon: Wallet, path: "/accounting/transactions" },
      { label: "Budget", icon: PieChart, path: "/accounting/budget" },
      { label: "Reports", icon: BarChart3, path: "/accounting/reports" },
      { label: "Branch Financials", icon: DollarSign, path: "/branch-financials" },
      { label: "Cashflow", icon: BarChart3, path: "/cashflow" },
    ]},
    { group: "Billing & Receivables", icon: Receipt, items: [
      { label: "Finance KPIs", icon: BarChart3, path: "/finance/kpi-dashboard" },
      { label: "Invoices", icon: FileText, path: "/finance/invoices" },
      { label: "Refunds & Credits", icon: ArrowRightLeft, path: "/finance/refunds" },
      { label: "Customer Accounts (Students)", icon: Users, path: "/finance/accounts" },
      { label: "Family Accounts (Payers)", icon: Users, path: "/finance/payers" },
      { label: "Collections", icon: Clock, path: "/finance/collections" },
      { label: "Disputes & Locked Funds", icon: ShieldAlert, path: "/finance/disputes" },
      { label: "Transaction Ledger", icon: Wallet, path: "/finance/transactions" },
      { label: "Pricing & Rules", icon: DollarSign, path: "/finance/pricing" },
      { label: "Approval Inbox", icon: Shield, path: "/finance/approvals" },
      { label: "Billing Settings", icon: Settings, path: "/finance/billing-settings" },
    ]},
    { group: "QA & Compliance", icon: Shield, items: [
      { label: "QA Dashboard", icon: Shield, path: "/qa-dashboard" },
      { label: "Field Audit", icon: ClipboardCheck, path: "/qa-audit" },
      { label: "Compliance", icon: Shield, path: "/qa-compliance" },
    ]},
    { label: "Branch Royalties", icon: Landmark, path: "/royalty-dashboard" },
    { label: "Install Analytics", icon: Smartphone, path: "/install/analytics" },
    { label: "Settings", icon: Settings, path: "/settings" },
    { label: "Help Center", icon: HelpCircle, path: "/help" },
  ],
  franchisee: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { label: "My Branch", icon: Building2, path: "/branch" },
    { group: "Administration", icon: Building2, items: [
      { label: "Registration Forms", icon: ClipboardList, path: "/eforms" },
      { label: "Email", icon: Mail, path: "/admin/email" },
      { label: "Parent Onboarding", icon: FileText, path: "/admin/parent-onboarding" },
    ]},
    { group: "Admissions", icon: UserPlus, items: [
      { label: "Admissions Pipeline", icon: UserPlus, path: "/crm" },
      { label: "Admissions Library", icon: ClipboardCheck, path: "/assessments" },
    ]},
    { group: "Students", icon: GraduationCap, items: [
      { label: "Student Directory", icon: Users, path: "/students" },
      { label: "Classrooms & Attendance", icon: GraduationCap, path: "/classrooms" },
      { label: "Learning Journal", icon: Camera, path: "/daily-updates" },
      { label: "Class Readiness Report", icon: HeartPulse, path: "/curriculum/readiness" },
    ]},
    { group: "Curriculum & Quality", icon: BookOpen, items: [
      { label: "Curriculum Command Center", icon: Layers, path: "/curriculum/command-center" },
      { label: "Teaching Resources", icon: FileText, path: "/worksheets" },
      { label: "School Calendar", icon: CalendarDays, path: "/school-calendar" },
      { label: "My Timetable", icon: CalendarDays, path: "/timetables" },
    ]},
    { group: "Parent Communication", icon: MessageSquare, items: [
      { label: "Parent Meetings (PTM)", icon: CalendarDays, path: "/curriculum/ptm" },
      { label: "PTM Dashboard", icon: FileText, path: "/curriculum/dashboard/ptm" },
      { label: "Parent Inbox", icon: MessageSquare, path: "/staff-inbox" },
    ]},
    { group: "Communication Hub", icon: Megaphone, items: [
      { label: "Announcements", icon: Megaphone, path: "/announcements" },
      { label: "Newsletter", icon: FileText, path: "/newsletters" },
    ]},
    { group: "Human Resource", icon: Briefcase, items: [
      { label: "HR Settings", icon: Settings, path: "/hr-settings" },
      { label: "HR Calendar", icon: CalendarDays, path: "/hr-calendar" },
      { label: "Staff Management", icon: UserCog, path: "/staff-management" },
      { label: "Staff Attendance", icon: Clock, path: "/staff-attendance" },
      { label: "OT Requests", icon: Clock, path: "/overtime" },
      { label: "Reimbursements", icon: Receipt, path: "/claims" },
      { label: "Leave Management", icon: CalendarDays, path: "/leave" },
      { label: "Payroll", icon: DollarSign, path: "/payroll" },
      { label: "My Payslips", icon: FileText, path: "/my-payslips" },
      { label: "Performance", icon: Star, path: "/staff-performance" },
    ]},
    { group: "School Documents", icon: FileText, items: [
      { label: "Manage Documents", icon: FileText, path: "/admin/school-documents" },
    ]},
    { group: "Accounting", icon: Landmark, items: [
      { label: "Chart of Accounts", icon: BookText, path: "/accounting/accounts" },
      { label: "Transactions", icon: Wallet, path: "/accounting/transactions" },
      { label: "Budget", icon: PieChart, path: "/accounting/budget" },
      { label: "Reports", icon: BarChart3, path: "/accounting/reports" },
      { label: "Branch Financials", icon: DollarSign, path: "/branch-financials" },
      { label: "Cashflow", icon: BarChart3, path: "/cashflow" },
    ]},
    { group: "Billing & Receivables", icon: Receipt, items: [
      { label: "Finance KPIs", icon: BarChart3, path: "/finance/kpi-dashboard" },
      { label: "Invoices", icon: FileText, path: "/finance/invoices" },
      { label: "Customer Accounts (Students)", icon: Users, path: "/finance/accounts" },
      { label: "Family Accounts (Payers)", icon: Users, path: "/finance/payers" },
      { label: "Collections", icon: Clock, path: "/finance/collections" },
      { label: "Disputes & Locked Funds", icon: ShieldAlert, path: "/finance/disputes" },
      { label: "Transaction Ledger", icon: Wallet, path: "/finance/transactions" },
      { label: "Pricing & Rules", icon: DollarSign, path: "/finance/pricing" },
      { label: "Approval Inbox", icon: Shield, path: "/finance/approvals" },
      { label: "Billing Settings", icon: Settings, path: "/finance/billing-settings" },
    ]},
    { label: "Audit & Compliance", icon: Shield, path: "/qa-compliance" },
    { label: "Settings", icon: Settings, path: "/settings" },
    { label: "Help Center", icon: HelpCircle, path: "/help" },
  ],
  teacher: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { group: "Students", icon: GraduationCap, items: [
      { label: "Student Directory", icon: Users, path: "/students" },
      { label: "Classrooms & Attendance", icon: GraduationCap, path: "/classrooms" },
      { label: "Admissions Library", icon: ClipboardCheck, path: "/assessments" },
      { label: "Learning Journal", icon: Camera, path: "/daily-updates" },
      { label: "Class Readiness Report", icon: HeartPulse, path: "/curriculum/readiness" },
    ]},
    { group: "My Planning", icon: BookOpen, items: [
      { label: "My Timetable", icon: CalendarDays, path: "/timetables" },
      { label: "Lesson Plans", icon: ClipboardList, path: "/lesson-planner" },
      { label: "Learning Centers", icon: Palette, path: "/curriculum/centers" },
      { label: "Teaching Resources", icon: FileText, path: "/worksheets" },
    ]},
    { group: "Parent Communication", icon: MessageSquare, items: [
      { label: "Parent Meetings (PTM)", icon: CalendarDays, path: "/curriculum/ptm" },
      { label: "Parent Inbox", icon: MessageSquare, path: "/staff-inbox" },
    ]},
    { group: "Communication Hub", icon: Megaphone, items: [
      { label: "Announcements", icon: Megaphone, path: "/announcements" },
      { label: "Newsletter", icon: FileText, path: "/newsletters" },
    ]},
    { group: "Human Resource", icon: Briefcase, items: [
      { label: "Staff Attendance", icon: Clock, path: "/staff-attendance" },
      { label: "OT Requests", icon: Clock, path: "/overtime" },
      { label: "Leave Management", icon: CalendarDays, path: "/leave" },
      { label: "Reimbursements", icon: Receipt, path: "/claims" },
      { label: "My Payslips", icon: FileText, path: "/my-payslips" },
    ]},
    { label: "Settings", icon: Settings, path: "/settings" },
    { label: "Help Center", icon: HelpCircle, path: "/help" },
  ],
  admin: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { group: "Administration", icon: Building2, items: [
      { label: "Registration Forms", icon: ClipboardList, path: "/eforms" },
      { label: "Email", icon: Mail, path: "/admin/email" },
      { label: "Parent Onboarding", icon: FileText, path: "/admin/parent-onboarding" },
    ]},
    { group: "Admissions", icon: UserPlus, items: [
      { label: "Admissions Pipeline", icon: UserPlus, path: "/crm" },
      { label: "Admissions Library", icon: ClipboardCheck, path: "/assessments" },
    ]},
    { group: "Students", icon: GraduationCap, items: [
      { label: "Student Directory", icon: Users, path: "/students" },
      { label: "Classrooms & Attendance", icon: GraduationCap, path: "/classrooms" },
      { label: "Learning Journal", icon: Camera, path: "/daily-updates" },
      { label: "Class Readiness Report", icon: HeartPulse, path: "/curriculum/readiness" },
    ]},
    { group: "Curriculum & Quality", icon: BookOpen, items: [
      { label: "Curriculum Command Center", icon: Layers, path: "/curriculum/command-center" },
      { label: "Teaching Resources", icon: FileText, path: "/worksheets" },
      { label: "School Calendar", icon: CalendarDays, path: "/school-calendar" },
      { label: "My Timetable", icon: CalendarDays, path: "/timetables" },
    ]},
    { group: "Parent Communication", icon: MessageSquare, items: [
      { label: "Parent Meetings (PTM)", icon: CalendarDays, path: "/curriculum/ptm" },
      { label: "PTM Dashboard", icon: FileText, path: "/curriculum/dashboard/ptm" },
      { label: "Parent Inbox", icon: MessageSquare, path: "/staff-inbox" },
      { label: "School Documents", icon: FileText, path: "/admin/school-documents" },
    ]},
    { group: "Communication Hub", icon: Megaphone, items: [
      { label: "Announcements", icon: Megaphone, path: "/announcements" },
      { label: "Newsletter", icon: FileText, path: "/newsletters" },
    ]},
    { group: "Human Resource", icon: Briefcase, items: [
      { label: "HR Settings", icon: Settings, path: "/hr-settings" },
      { label: "HR Calendar", icon: CalendarDays, path: "/hr-calendar" },
      { label: "Staff Management", icon: UserCog, path: "/staff-management" },
      { label: "Staff Attendance", icon: Clock, path: "/staff-attendance" },
      { label: "OT Requests", icon: Clock, path: "/overtime" },
      { label: "Reimbursements", icon: Receipt, path: "/claims" },
      { label: "Leave Management", icon: CalendarDays, path: "/leave" },
      { label: "Payroll", icon: DollarSign, path: "/payroll" },
      { label: "My Payslips", icon: FileText, path: "/my-payslips" },
      { label: "Performance", icon: Star, path: "/staff-performance" },
    ]},
    { group: "Accounting", icon: Landmark, items: [
      { label: "Chart of Accounts", icon: BookText, path: "/accounting/accounts" },
      { label: "Transactions", icon: Wallet, path: "/accounting/transactions" },
      { label: "Budget", icon: PieChart, path: "/accounting/budget" },
      { label: "Reports", icon: BarChart3, path: "/accounting/reports" },
      { label: "Branch Financials", icon: DollarSign, path: "/branch-financials" },
      { label: "Cashflow", icon: BarChart3, path: "/cashflow" },
    ]},
    { group: "Billing & Receivables", icon: Receipt, items: [
      { label: "Finance KPIs", icon: BarChart3, path: "/finance/kpi-dashboard" },
      { label: "Invoices", icon: FileText, path: "/finance/invoices" },
      { label: "Customer Accounts (Students)", icon: Users, path: "/finance/accounts" },
      { label: "Collections", icon: Clock, path: "/finance/collections" },
      { label: "Transaction Ledger", icon: Wallet, path: "/finance/transactions" },
      { label: "Pricing & Rules", icon: DollarSign, path: "/finance/pricing" },
      { label: "Approval Inbox", icon: Shield, path: "/finance/approvals" },
      { label: "Billing Settings", icon: Settings, path: "/finance/billing-settings" },
    ]},
    { label: "Audit & Compliance", icon: Shield, path: "/qa-compliance" },
    { label: "Settings", icon: Settings, path: "/settings" },
    { label: "Help Center", icon: HelpCircle, path: "/help" },
  ],
  parent: [
    { label: "Home", icon: Home, path: "/child" },
    { label: "Journey", icon: Sparkles, path: "/journey" },
    { label: "Daily Check-In", icon: Clock, path: "/check-in" },
    { label: "Progress", icon: TrendingUp, path: "/progress" },
    { label: "PTM (Meetings)", icon: CalendarDays, path: "/parent-ptm" },
    { label: "Chat with School", icon: MessageSquare, path: "/parent-chat" },
    { label: "School Updates", icon: Megaphone, path: "/parent-messages" },
    { label: "Fees & Invoices", icon: Receipt, path: "/parent-fees" },
    { label: "School Documents", icon: FileText, path: "/school-documents" },
    { label: "Account & Profile", icon: Heart, path: "/account" },
    { label: "Help Center", icon: HelpCircle, path: "/help" },
  ],
};

const roleBadgeClasses: Record<string, string> = {
  super_admin: "bg-[hsl(var(--role-super-admin))] text-white",
  franchisee: "bg-[hsl(var(--role-franchisee))] text-white",
  admin: "bg-[hsl(var(--role-admin))] text-white",
  teacher: "bg-[hsl(var(--role-teacher))] text-white",
  parent: "bg-[hsl(var(--role-parent))] text-white",
};

const NOTIFICATION_ROUTES: Record<string, string> = {
  announcement: "/parent-messages",
  chat: "/parent-chat",
  message: "/staff-inbox",
  billing: "/parent-fees",
  invoice: "/parent-fees",
  payment: "/parent-fees",
  leave: "/leave",
  leave_request: "/leave",
  leave_approved: "/leave",
  leave_rejected: "/leave",
  payroll: "/my-payslips",
  performance: "/staff-performance",
  performance_review: "/staff-performance",
  claim: "/claims",
  claim_request: "/claims",
  claim_approved: "/claims",
  claim_rejected: "/claims",
  user_registration: "/users",
  attendance: "/attendance",
  enrollment: "/crm",
  learning_journey: "/child",
  overtime: "/overtime",
  escalation: "/staff-inbox",
  probation_reminder: "/staff-management",
  lesson_plan: "/lesson-plans",
  transaction: "/accounting/transactions",
  student: "/students",
  newsletter: "/newsletters",
  ptm_booking_request: "/curriculum/ptm?tab=bookings",
  ptm_status_change: "/curriculum/ptm?tab=bookings",
  general: "/dashboard",
};

// Parent-specific overrides — every parent notification must land on a
// route accessible to the parent role (RLS-safe).
const PARENT_NOTIFICATION_ROUTES: Record<string, string> = {
  announcement: "/parent-messages",
  newsletter: "/parent-messages",
  message: "/parent-chat",
  chat: "/parent-chat",
  billing: "/parent-fees",
  invoice: "/parent-fees",
  payment: "/parent-fees",
  attendance: "/check-in",
  learning_journey: "/journey",
  learning_activity: "/journey",
  album: "/journey",
  observation: "/journey",
  ptm: "/parent-ptm",
  ptm_meeting: "/parent-ptm",
  ptm_slot: "/parent-ptm",
  ptm_booking: "/parent-ptm",
  ptm_report: "/parent-ptm",
  monthly_summary: "/progress",
  enrollment: "/account",
  general: "/notifications",
};

function routeForNotification(n: any, role: string | null | undefined): string {
  if (n?.action_url) return n.action_url;
  if (role === "parent") {
    return PARENT_NOTIFICATION_ROUTES[n?.type] ?? "/child";
  }
  let route = NOTIFICATION_ROUTES[n?.type] ?? "/dashboard";
  if (n?.type === "chat") route = "/staff-inbox";
  if (n?.type === "announcement") route = "/announcements";
  if (n?.type === "billing" || n?.type === "invoice") route = "/finance/invoices";
  return route;
}

function NotificationBell() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { permission, isSubscribed, loading: pushLoading, subscribe } = usePushNotifications();
  const [open, setOpen] = useState(false);

  // Use the unified notification feed hook
  const { notifications, liveAlerts, persistedNotifications, unreadCount, latestNotifRef } = useNotificationFeed();

  // Mirror unread count to the OS app icon badge
  useAppBadge(unreadCount);

  // Live toast for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-bell-toast")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new;
          if (n && n.id !== latestNotifRef.current) {
            latestNotifRef.current = n.id;
            // Suppress chat toasts when the user is already inside that exact
            // conversation — and quietly mark the notification read so the
            // bell badge doesn't tick up for a message they can already see.
            if (n.type === "chat" && n.group_key?.startsWith("chat:")) {
              const convoId = n.group_key.slice("chat:".length);
              const params = new URLSearchParams(location.search);
              const onChatRoute =
                location.pathname === "/parent-chat" ||
                location.pathname === "/staff-inbox";
              if (onChatRoute && params.get("convo") === convoId) {
                supabase
                  .from("notifications")
                  .update({ is_read: true })
                  .eq("id", n.id)
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
                  });
                return;
              }
            }
            const icon = getTypeIcon(n.type);
            sonnerToast(`${icon} ${n.title}`, {
              description: n.message?.slice(0, 120),
              action: n.action_url ? {
                label: "View",
                onClick: () => navigate(n.action_url),
              } : undefined,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, latestNotifRef, location.pathname, location.search, queryClient]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const deleteNotif = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("notifications").update({ archived_at: new Date().toISOString() }).in("id", ids);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const handleNotificationClick = (n: any) => {
    if (!n.isLive && !n.is_read) markRead.mutate(n.id);
    const route = routeForNotification(n, role);
    setOpen(false);
    // Defer navigation so the popover unmount doesn't swallow the click
    setTimeout(() => navigate(route), 0);
    // Clear the OS app badge — user has acknowledged the alert
    try {
      // @ts-ignore – setAppBadge is not in TS lib yet
      if (typeof navigator !== "undefined" && (navigator as any).clearAppBadge) {
        (navigator as any).clearAppBadge?.();
      }
    } catch {
      // best-effort
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "announcement": return "📢";
      case "chat": case "message": return "💬";
      case "escalation": return "⚠️";
      case "billing": case "invoice": return "💰";
      case "leave": case "leave_request": case "leave_approved": case "leave_rejected": return "🏖️";
      case "payroll": return "💵";
      case "performance": case "performance_review": return "⭐";
      case "claim": case "claim_request": case "claim_approved": case "claim_rejected": return "🧾";
      case "user_registration": return "👤";
      case "attendance": return "📋";
      case "enrollment": return "🎓";
      case "learning_journey": return "📖";
      case "overtime": return "⏰";
      case "probation_reminder": return "📋";
      default: return "🔔";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-in zoom-in-50">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{unreadCount} new</Badge>
            )}
            {persistedNotifications.filter(n => !n.is_read).length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-auto py-1" onClick={() => markAllRead.mutate()}>
                Mark all read
              </Button>
            )}
          </div>
        </div>
        {permission !== "unsupported" && permission !== "granted" && permission !== "denied" && (
          <div className="border-b px-4 py-2 bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={pushLoading}
              onClick={() => subscribe()}
            >
              <Bell className="h-3 w-3 mr-1.5" />
              {pushLoading ? "Enabling…" : "Enable push notifications"}
            </Button>
          </div>
        )}
        {permission === "denied" && (
          <div className="border-b px-4 py-2 bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">Push notifications blocked in browser settings</p>
          </div>
        )}
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <>
              {/* Action Required section */}
              {liveAlerts.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-destructive/5 border-b">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Action Required</span>
                  </div>
                  {liveAlerts.map((n) => (
                    <div
                      key={n.id}
                      className="border-b px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors bg-destructive/5 border-l-2 border-l-destructive"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base mt-0.5 shrink-0">{getTypeIcon(n.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">
                            {n.title}
                            <Badge variant="destructive" className="ml-2 text-[10px]">{n.count}</Badge>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Recent activity section */}
              {persistedNotifications.length > 0 && liveAlerts.length > 0 && (
                <div className="px-4 py-1.5 bg-muted/30 border-b">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</span>
                </div>
              )}
              {(() => {
                // Group notifications by group_key
                const grouped: any[] = [];
                const groupMap = new Map<string, any[]>();
                for (const n of persistedNotifications) {
                  const gk = n.group_key;
                  if (gk) {
                    const existing = groupMap.get(gk);
                    if (existing) { existing.push(n); } else { groupMap.set(gk, [n]); grouped.push({ isGroup: true, key: gk, items: groupMap.get(gk)! }); }
                  } else {
                    grouped.push(n);
                  }
                }
                return grouped.map((entry: any) => {
                  if (entry.isGroup && entry.items.length > 1) {
                    const latest = entry.items[0];
                    const unreadInGroup = entry.items.filter((i: any) => !i.is_read).length;
                    return (
                      <div
                        key={entry.key}
                        className={`border-b px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${unreadInGroup > 0 ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                        onClick={() => handleNotificationClick(latest)}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5 shrink-0">{getTypeIcon(latest.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${unreadInGroup > 0 ? "font-semibold" : "font-medium"}`}>
                              {latest.title}
                              <Badge variant="secondary" className="ml-2 text-[10px]">{entry.items.length}</Badge>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{latest.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          {unreadInGroup > 0 && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                        </div>
                      </div>
                    );
                  }
                  const n = entry.isGroup ? entry.items[0] : entry;
                  const isGroup = entry.isGroup;
                  return (
                    <SwipeableNotification
                      key={n.id}
                      isRead={!!n.is_read || !!n.isLive}
                      onMarkRead={n.isLive ? undefined : () => markRead.mutate(n.id)}
                      onDelete={() => {
                        const ids = isGroup ? entry.items.map((i: any) => i.id) : [n.id];
                        deleteNotif.mutate(ids);
                      }}
                      onClick={() => handleNotificationClick(n)}
                      className={`border-b ${!n.is_read ? "border-l-2 border-l-primary" : ""}`}
                    >
                      <div className={`px-4 py-3 hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}>
                        <div className="flex items-start gap-2.5">
                          <span className="text-base mt-0.5 shrink-0">{getTypeIcon(n.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"}`}>
                              {n.title}
                              {isGroup && entry.items.length > 1 && (
                                <Badge variant="secondary" className="ml-2 text-[10px]">{entry.items.length}</Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                        </div>
                      </div>
                    </SwipeableNotification>
                  );
                });
              })()}
            </>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setOpen(false);
              setTimeout(() => navigate("/notifications"), 0);
            }}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Flatten group items to NavItem[] (extracting from sub-groups)
function flattenGroupItems(items: (NavItem | NavSubGroup)[]): NavItem[] {
  const flat: NavItem[] = [];
  for (const item of items) {
    if (isSubGroup(item)) {
      flat.push(...item.items);
    } else {
      flat.push(item);
    }
  }
  return flat;
}

// Collect all paths from nav entries (including inside groups)
function getAllPaths(entries: NavEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (isGroup(entry)) {
      for (const item of flattenGroupItems(entry.items)) paths.push(item.path);
    } else {
      paths.push(entry.path);
    }
  }
  return paths;
}

// Get unread count for a group (sum of items)
function getGroupUnread(items: (NavItem | NavSubGroup)[], counts: Record<string, number>): number {
  return flattenGroupItems(items).reduce((sum, item) => sum + (counts[item.path] ?? 0), 0);
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role, allowedRoutes, routesLoaded, signOut } = useAuth();
  const { branches: globalBranches, selectedBranchId, setSelectedBranchId } = useGlobalBranch();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const showBranchSelector = globalBranches.length > 1 && role !== "parent";
  const needsStaffOnboarding = role === "staff" || role === "teacher";

  // Check onboarding status for staff (non-parent)
  const { data: onboardingProfile } = useQuery({
    queryKey: ["onboarding-lock", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_profiles")
        .select("onboarding_complete")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && needsStaffOnboarding,
  });

  const showOnboardingLock = needsStaffOnboarding && onboardingProfile !== undefined && !onboardingProfile?.onboarding_complete;

  // Only the `staff` role assembles its sidebar from access-group routes.
  // Every other role (super_admin, franchisee, admin, teacher, parent)
  // ships with its own curated static nav and renders immediately —
  // otherwise teachers/admins with no extra access groups would see an
  // empty sidebar while waiting on the RPC.
  const awaitingRoutes = role === "staff" && !routesLoaded;
  const entries = awaitingRoutes
    ? ([] as NavEntry[])
    : filterNavEntries(role, allowedRoutes);

  // Unread message counts for badge display
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["unread-message-counts", user?.id, role, selectedBranchId],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      if (!user) return counts;

      if (role === "parent") {
        // Unread chat messages in parent's conversations
        const { data: convos } = await supabase.from("conversations").select("id").eq("parent_id", user.id);
        const convoIds = convos?.map((c: any) => c.id) ?? [];
        if (convoIds.length > 0) {
          const { count: chatCount } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false)
            .is("read_at", null)
            .neq("sender_id", user.id)
            .in("conversation_id", convoIds);
          counts["/parent-chat"] = chatCount ?? 0;
        }

        // Unread parent_messages directed to this user
        const { count: directCount } = await supabase
          .from("parent_messages")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
          .eq("recipient_id", user.id);
        
        // Unread announcements (no matching announcement_reads row)
        const { data: myReads } = await supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("parent_user_id", user.id);
        const readAnnouncementIds = myReads?.map((r: any) => r.announcement_id) ?? [];
        
        // Get announcements for parent's branch via student
        const { data: myKids } = await supabase
          .from("parent_students")
          .select("student_id, students(branch_id)")
          .eq("parent_id", user.id);
        const myBranchIds = [...new Set(myKids?.map((k: any) => k.students?.branch_id).filter(Boolean) ?? [])];
        
        let unreadAnnouncementCount = 0;
        if (myBranchIds.length > 0) {
          let query = supabase
            .from("announcements")
            .select("id", { count: "exact", head: true })
            .in("branch_id", myBranchIds);
          if (readAnnouncementIds.length > 0) {
            // We can't do NOT IN easily with supabase, so fetch all and subtract
            const { data: allAnnouncements } = await supabase
              .from("announcements")
              .select("id")
              .in("branch_id", myBranchIds);
            unreadAnnouncementCount = (allAnnouncements ?? []).filter(
              (a: any) => !readAnnouncementIds.includes(a.id)
            ).length;
          } else {
            const { count } = await query;
            unreadAnnouncementCount = count ?? 0;
          }
        }
        
        counts["/parent-messages"] = (directCount ?? 0) + unreadAnnouncementCount;
      } else {
        // Staff/franchisee/super_admin: unread chat messages in participated conversations
        const { data: participations } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id);
        const convIds = participations?.map((p: any) => p.conversation_id) ?? [];

        if (convIds.length > 0) {
          const { count } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false)
            .is("read_at", null)
            .neq("sender_id", user.id)
            .in("conversation_id", convIds);
          counts["/staff-inbox"] = count ?? 0;
        }

        // Pending approval badges for admin/franchisee/super_admin
        const isApprover = ["super_admin", "admin", "franchisee"].includes(role ?? "");
        if (isApprover && selectedBranchId) {
          const [leaveRes, otRes, claimRes, payrollRes] = await Promise.all([
            supabase.from("leave_requests").select("id", { count: "exact", head: true })
              .eq("branch_id", selectedBranchId).eq("status", "pending"),
            supabase.from("overtime_requests").select("id", { count: "exact", head: true })
              .eq("branch_id", selectedBranchId).eq("status", "pending"),
            supabase.from("staff_claims").select("id", { count: "exact", head: true })
              .eq("branch_id", selectedBranchId).eq("status", "pending"),
            supabase.from("payroll_records").select("id", { count: "exact", head: true })
              .eq("branch_id", selectedBranchId).eq("status", "draft"),
          ]);
          if ((leaveRes.count ?? 0) > 0) counts["/leave"] = leaveRes.count!;
          if ((otRes.count ?? 0) > 0) counts["/overtime"] = otRes.count!;
          if ((claimRes.count ?? 0) > 0) counts["/claims"] = claimRes.count!;
          if ((payrollRes.count ?? 0) > 0) counts["/payroll"] = payrollRes.count!;
        }
      }

      return counts;
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // Realtime subscription for instant sidebar badge updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("sidebar-badge-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_claims" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_records" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const initials = user?.user_metadata?.first_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  const footerDisplayName = role === "parent" ? "Parent" : (user?.user_metadata?.first_name ?? getRoleLabel(role));
  const { iconForRole, nameForRole } = useBranding();
  const appIcon = iconForRole(role);
  const appName = nameForRole(role);
  const isMobile = useIsMobile();

  // ─────────────────────────────────────────────────────────────────
  // PARENT SHELL — no sidebar at all. Bottom-bar-only navigation.
  // Renders after all hooks above so hook order stays consistent.
  // ─────────────────────────────────────────────────────────────────
  if (role === "parent") {
    return (
      <div className="flex min-h-screen w-full flex-col bg-background" data-role="parent">
        <ParentTopBar bell={<NotificationBell />} />
        <main
          className="flex-1 px-3 sm:px-4 pt-0 pb-[calc(72px+env(safe-area-inset-bottom))] overflow-x-hidden"
        >
          {children}
        </main>
        <ParentBottomTabBar />
      </div>
    );
  }

  const sidebarDefaultOpen = useMemo(() => {
    if (typeof document === "undefined") return !isMobile;
    if (isMobile) return false;
    const match = document.cookie.match(/(?:^|;\s*)sidebar:state=(true|false)/);
    if (match) return match[1] === "true";
    return true;
  }, [isMobile]);

  const handleSidebarNav = (path: string) => {
    // Do NOT auto-expand the sidebar on plain item clicks. Only group
    // headers with sub-menus expand the sidebar (handled inside
    // SidebarNestedGroup). Items without sub-menus navigate and leave
    // the sidebar in its current collapsed/expanded state.
    navigate(path);
  };

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      <SidebarExpandOnNavListener />
      <div className="flex min-h-screen w-full" data-role={role ?? "parent"}>
        <Sidebar collapsible={isMobile ? "offcanvas" : "icon"}>
          <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2 overflow-hidden">
            <SidebarBrandCard
              icon={appIcon}
              name={appName}
              roleLabel={getRoleLabel(role)}
              roleBadgeClass={roleBadgeClasses[role ?? ""]}
            />
          </SidebarHeader>

          {showBranchSelector && (
            <div className="px-3 pt-2 pb-2 group-data-[collapsible=icon]:hidden">
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="h-10 text-xs bg-card border-sidebar-border rounded-xl shadow-[var(--shadow-soft)] hover:border-primary/40 transition-colors">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0 text-primary" />
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {(role === "super_admin" || role === "franchisee") && (
                    <SelectItem value="all">All Branches</SelectItem>
                  )}
                  {globalBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SidebarContent className="min-h-0 gap-0.5 px-2 py-2">
            {awaitingRoutes && (
              <div className="px-2 py-3 space-y-2" aria-live="polite" aria-busy="true">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-8 w-full rounded bg-muted/60 animate-pulse" />
                <div className="h-8 w-full rounded bg-muted/60 animate-pulse" />
                <div className="h-8 w-3/4 rounded bg-muted/60 animate-pulse" />
                <p className="text-[11px] text-muted-foreground pt-1">Loading your permissions…</p>
              </div>
            )}
            {entries.map((entry) => {
              if (isGroup(entry)) {
                const allItems = flattenGroupItems(entry.items);
                const groupActive = allItems.some((i) => location.pathname === i.path);
                const groupUnread = getGroupUnread(entry.items, unreadCounts);
                return (
                  <SidebarNestedGroup
                    key={entry.group}
                    icon={entry.icon}
                    label={entry.group}
                    unread={groupUnread}
                    hasActive={groupActive}
                  >
                    {entry.items.map((item) => {
                      if (isSubGroup(item)) {
                        const subActive = item.items.some((si) => location.pathname === si.path);
                        return (
                          <SidebarSubGroup
                            key={item.subGroup}
                            icon={item.icon}
                            label={item.subGroup}
                            hasActive={subActive}
                          >
                            {item.items.map((subItem) => (
                             <SidebarNestedItem
                                 key={subItem.path}
                                 icon={subItem.icon}
                                 label={subItem.label}
                                 subLabel={subItem.subLabel}
                                 active={location.pathname === subItem.path}
                                 onClick={() => handleSidebarNav(subItem.path)}
                                 unread={unreadCounts[subItem.path] ?? 0}
                               />
                            ))}
                          </SidebarSubGroup>
                        );
                      }
                      return (
                         <SidebarNestedItem
                          key={item.path}
                          icon={item.icon}
                          label={item.label}
                          subLabel={item.subLabel}
                          active={location.pathname === item.path}
                          onClick={() => handleSidebarNav(item.path)}
                          unread={unreadCounts[item.path] ?? 0}
                        />
                      );
                    })}
                  </SidebarNestedGroup>
                );
              }
              return (
                <SidebarItem
                  key={entry.path}
                  icon={entry.icon}
                  label={entry.label}
                  active={location.pathname === entry.path}
                  onClick={() => handleSidebarNav(entry.path)}
                  unread={unreadCounts[entry.path] ?? 0}
                />
              );
            })}
          </SidebarContent>

          <SidebarFooter
            className="shrink-0 overflow-hidden border-t border-sidebar-border/50 bg-sidebar/95 px-3 pt-2.5 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-1"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <SidebarFooterCard
              initials={initials}
              displayName={footerDisplayName}
              email={user?.email}
              version={APP_VERSION_LABEL}
              onSignOut={() => { signOut(); navigate("/auth"); }}
              topSlot={
                <GetMobileAppButton
                  variant="teachers"
                  className="h-9 w-full min-w-0 max-w-full justify-center px-3 text-xs"
                />
              }
              middleSlot={
                <RoleSwitcher className="w-full justify-center rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-3 py-2 text-xs hover:bg-sidebar-accent" />
              }
            />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background px-3 sm:px-4">
            <SidebarTrigger />
            <div className="flex-1 flex justify-center min-w-0">
              <GlobalSearch />
            </div>
            {showBranchSelector && (
              <div className="max-w-[180px] md:hidden">
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="h-8 text-xs">
                    <Building2 className="h-3 w-3 mr-1 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(role === "super_admin" || role === "franchisee") && (
                      <SelectItem value="all">All Branches</SelectItem>
                    )}
                    {globalBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <NotificationBell />
          </header>
          <main
            className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-6"
          >
            {children}
          </main>
          {role === "teacher" && <TeacherBottomTabBar />}
          {role !== "super_admin" && role !== "teacher" && <BottomTabBar />}
        </SidebarInset>
      </div>

      {/* Lock-screen onboarding overlay */}
      {showOnboardingLock && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <StaffOnboardingWizard />
        </div>
      )}
    </SidebarProvider>
  );
}
