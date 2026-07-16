import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useAuth, getRoleLabel } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import {
  PageHeader,
  KPICard,
  SectionCard,
  QuickActionCard,
  EmptyState,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Users, GraduationCap, Receipt, AlertTriangle, UserCheck,
  Megaphone, FileText, UserPlus, Wallet, Target, ClipboardCheck,
  BookOpen, Building2, Bell, ArrowRight, TrendingUp, ClipboardList,
} from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const fmtRM = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

/**
 * Admin / Franchisee / Super-Admin operations dashboard.
 * Read-only, navigation-first "School Operations Command Center".
 */
export default function AdminOperationsDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { selectedBranchId } = useGlobalBranch();
  const branchId = selectedBranchId === "all" ? null : selectedBranchId;

  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  // ── Live data (read-only, existing tables) ─────────────────
  const students = useQuery({
    queryKey: ["adm-ops-students", branchId],
    queryFn: async () => {
      let q = supabase.from("students").select("id", { count: "exact", head: true }).eq("is_active", true);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const attendanceToday = useQuery({
    queryKey: ["adm-ops-att", branchId, today],
    queryFn: async () => {
      let q = supabase.from("attendance").select("status").eq("date", today);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const rows = data ?? [];
      const present = rows.filter((r: any) => r.status === "present" || r.status === "late").length;
      const absent = rows.filter((r: any) => ["absent", "excused", "sick"].includes(r.status)).length;
      return { present, absent, total: rows.length };
    },
  });

  const staffCount = useQuery({
    queryKey: ["adm-ops-staff", branchId],
    queryFn: async () => {
      let q = supabase.from("branch_memberships").select("user_id", { count: "exact", head: true });
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const invoices = useQuery({
    queryKey: ["adm-ops-invoices", branchId],
    queryFn: async () => {
      let q = supabase.from("invoices").select("status, total_amount, amount_paid, billing_month, billing_year, due_date");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const rows = (data ?? []) as any[];
      const m = new Date().getMonth() + 1;
      const y = new Date().getFullYear();
      const thisMonth = rows.filter((r) => r.billing_month === m && r.billing_year === y);
      const collected = thisMonth
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + Number(r.amount_paid || 0), 0);
      const outstanding = rows
        .filter((r) => !["paid", "cancelled", "draft"].includes(r.status))
        .reduce((s, r) => s + (Number(r.total_amount || 0) - Number(r.amount_paid || 0)), 0);
      const overdue = rows.filter((r) => r.status === "overdue").length;
      return { collected, outstanding, overdue, monthCount: thisMonth.length };
    },
  });

  const leads = useQuery({
    queryKey: ["adm-ops-leads", branchId],
    queryFn: async () => {
      let q = supabase.from("leads").select("status, created_at");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const rows = (data ?? []) as any[];
      const open = rows.filter((r) => !["enrolled", "lost"].includes(r.status)).length;
      const enrolledThisMonth = rows.filter(
        (r) => r.status === "enrolled" && r.created_at >= monthStart && r.created_at <= monthEnd + "T23:59:59",
      ).length;
      const tours = rows.filter((r) => r.status === "tour_scheduled").length;
      return { open, enrolledThisMonth, tours };
    },
  });

  const hrPending = useQuery({
    queryKey: ["adm-ops-hr", branchId],
    queryFn: async () => {
      const [{ count: leaveC }, { count: otC }, { count: claimC }] = await Promise.all([
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("staff_claims").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      ]);
      return { leave: leaveC ?? 0, ot: otC ?? 0, claims: claimC ?? 0 };
    },
  });

  const announcements = useQuery({
    queryKey: ["adm-ops-ann", branchId],
    queryFn: async () => {
      let q = supabase
        .from("announcements")
        .select("id, title, content, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = (user?.user_metadata as any)?.first_name || "there";

  const attRate = useMemo(() => {
    const total = students.data ?? 0;
    const present = attendanceToday.data?.present ?? 0;
    return total > 0 ? Math.round((present / total) * 100) : 0;
  }, [students.data, attendanceToday.data]);

  const alerts: Array<{ icon: any; label: string; tone: "warning" | "destructive" | "info"; to: string }> = [];
  if ((invoices.data?.overdue ?? 0) > 0)
    alerts.push({
      icon: Receipt,
      label: `${invoices.data!.overdue} overdue invoice${invoices.data!.overdue > 1 ? "s" : ""} need follow-up`,
      tone: "destructive",
      to: "/finance/ar-aging",
    });
  if ((hrPending.data?.leave ?? 0) > 0)
    alerts.push({
      icon: ClipboardList,
      label: `${hrPending.data!.leave} pending leave request${hrPending.data!.leave > 1 ? "s" : ""}`,
      tone: "warning",
      to: "/leave",
    });
  if ((hrPending.data?.ot ?? 0) > 0)
    alerts.push({
      icon: ClipboardList,
      label: `${hrPending.data!.ot} pending overtime request${hrPending.data!.ot > 1 ? "s" : ""}`,
      tone: "warning",
      to: "/overtime-requests",
    });
  if ((hrPending.data?.claims ?? 0) > 0)
    alerts.push({
      icon: Wallet,
      label: `${hrPending.data!.claims} staff claim${hrPending.data!.claims > 1 ? "s" : ""} awaiting review`,
      tone: "info",
      to: "/claims",
    });

  const quickActions = [
    { icon: <UserPlus className="h-5 w-5" />, title: "Add Student", to: "/students", tone: "default" as const },
    { icon: <UserCheck className="h-5 w-5" />, title: "Add Staff", to: "/staff-management", tone: "info" as const },
    { icon: <Receipt className="h-5 w-5" />, title: "Create Invoice", to: "/finance/invoices", tone: "success" as const },
    { icon: <Megaphone className="h-5 w-5" />, title: "Send Announcement", to: "/announcements", tone: "warm" as const },
    { icon: <Target className="h-5 w-5" />, title: "Open CRM", to: "/crm", tone: "default" as const },
    { icon: <Wallet className="h-5 w-5" />, title: "Run Payroll", to: "/payroll", tone: "info" as const },
    { icon: <FileText className="h-5 w-5" />, title: "Manage eForms", to: "/eforms", tone: "success" as const },
    { icon: <BookOpen className="h-5 w-5" />, title: "Curriculum", to: "/curriculum", tone: "warm" as const },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        <PageHeader
          icon={<Building2 className="h-5 w-5" />}
          title={`${greeting}, ${firstName}`}
          subtitle={`${getRoleLabel(role)} · ${format(new Date(), "EEEE, d MMMM yyyy")} — Monitor operations, finance, admissions and staff at a glance.`}
        />

        {/* KPI overview */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="Active Students"
            value={students.data ?? "—"}
            icon={<Users className="h-5 w-5" />}
            onClick={() => navigate("/students")}
          />
          <KPICard
            label="Attendance Today"
            value={`${attRate}%`}
            delta={`${attendanceToday.data?.present ?? 0} present · ${attendanceToday.data?.absent ?? 0} absent`}
            icon={<ClipboardCheck className="h-5 w-5" />}
            tone="success"
          />
          <KPICard
            label="Collected (Month)"
            value={fmtRM(invoices.data?.collected ?? 0)}
            delta={`${invoices.data?.monthCount ?? 0} invoices this month`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="info"
            onClick={() => navigate("/finance/collections")}
          />
          <KPICard
            label="Overdue Fees"
            value={fmtRM(invoices.data?.outstanding ?? 0)}
            delta={`${invoices.data?.overdue ?? 0} overdue invoices`}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={(invoices.data?.overdue ?? 0) > 0 ? "destructive" : "default"}
            onClick={() => navigate("/finance/ar-aging")}
          />
        </div>

        {/* Snapshots row */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Finance snapshot */}
          <SectionCard
            title="Finance"
            description="This month"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate("/finance/collections")}>
                Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            }
          >
            <div className="space-y-3 text-sm">
              <Row label="Collected" value={fmtRM(invoices.data?.collected ?? 0)} tone="success" />
              <Row label="Outstanding" value={fmtRM(invoices.data?.outstanding ?? 0)} tone="warning" />
              <Row label="Overdue invoices" value={String(invoices.data?.overdue ?? 0)} tone={(invoices.data?.overdue ?? 0) > 0 ? "destructive" : "default"} />
              <div className="pt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/finance/invoices")}>Invoices</Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/finance/ar-aging")}>AR Aging</Button>
              </div>
            </div>
          </SectionCard>

          {/* Admissions snapshot */}
          <SectionCard
            title="Admissions"
            description="CRM pipeline"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate("/crm")}>
                Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            }
          >
            <div className="space-y-3 text-sm">
              <Row label="Open leads" value={String(leads.data?.open ?? 0)} />
              <Row label="Tours scheduled" value={String(leads.data?.tours ?? 0)} tone="info" />
              <Row label="Enrolled this month" value={String(leads.data?.enrolledThisMonth ?? 0)} tone="success" />
              <div className="pt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/crm")}>View pipeline</Button>
              </div>
            </div>
          </SectionCard>

          {/* HR snapshot */}
          <SectionCard
            title="HR / Staff"
            description="Pending approvals"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate("/staff-management")}>
                Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            }
          >
            <div className="space-y-3 text-sm">
              <Row label="Active staff" value={String(staffCount.data ?? 0)} />
              <Row label="Leave requests" value={String(hrPending.data?.leave ?? 0)} tone={(hrPending.data?.leave ?? 0) > 0 ? "warning" : "default"} />
              <Row label="Overtime requests" value={String(hrPending.data?.ot ?? 0)} tone={(hrPending.data?.ot ?? 0) > 0 ? "warning" : "default"} />
              <Row label="Claims to review" value={String(hrPending.data?.claims ?? 0)} tone={(hrPending.data?.claims ?? 0) > 0 ? "info" : "default"} />
              <div className="pt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/leave")}>Leave</Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/payroll")}>Payroll</Button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Alerts */}
        <SectionCard
          title="Needs Attention"
          description="Action items based on current operational data"
        >
          {alerts.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title="No urgent actions for now"
              description="You're all caught up. New alerts will appear here as they come in."
            />
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a, i) => {
                const Icon = a.icon;
                const toneCls =
                  a.tone === "destructive"
                    ? "bg-destructive/10 text-destructive"
                    : a.tone === "warning"
                    ? "bg-warning/15 text-warning"
                    : "bg-info/10 text-info";
                return (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${toneCls}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="flex-1 text-sm text-foreground">{a.label}</p>
                    <Button size="sm" variant="ghost" onClick={() => navigate(a.to)}>
                      Review <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {/* Quick actions */}
        <SectionCard title="Quick Actions" description="Jump straight into common tasks">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((a) => (
              <QuickActionCard
                key={a.title}
                icon={a.icon}
                title={a.title}
                tone={a.tone}
                onClick={() => navigate(a.to)}
              />
            ))}
          </div>
        </SectionCard>

        {/* Recent announcements */}
        <SectionCard
          title="Recent Announcements"
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate("/announcements")}>
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          }
        >
          {(announcements.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-6 w-6" />}
              title="No announcements yet"
              description="Share news, reminders and updates with parents or staff."
              action={
                <Button size="sm" onClick={() => navigate("/announcements")}>
                  Create announcement
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {announcements.data!.map((a: any) => (
                <li key={a.id} className="rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground">{a.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(a.created_at), "d MMM")}
                    </span>
                  </div>
                  {a.content && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{a.content}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

function Row({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info" | "destructive";
}) {
  const toneCls =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "info" ? "text-info"
    : tone === "destructive" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${toneCls}`}>{value}</span>
    </div>
  );
}