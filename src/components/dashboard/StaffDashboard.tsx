import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, CalendarDays, Receipt, Wallet, MessageSquare, Megaphone,
  GraduationCap, FileText, ChevronRight, Sparkles, Users, BookOpen, Eye,
  TrendingUp, UserPlus, Target, Building2, ClipboardCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Role-aware dashboard for admin / teacher / staff (Non-Teaching).
 * Renders quick actions and widgets gated by access groups (allowedRoutes).
 */
export default function StaffDashboard() {
  const { user, role, allowedRoutes } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  const today = format(new Date(), "yyyy-MM-dd");
  const year = new Date().getFullYear();

  const isAllowed = (path: string) => {
    if (allowedRoutes.length === 0) return true;
    return allowedRoutes.some((r) =>
      r.includes("?") || path.includes("?") ? r === path : path.startsWith(r)
    );
  };

  const { data: branchMembership } = useQuery({
    queryKey: ["my-branch", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships").select("branch_id").eq("user_id", userId!).limit(1).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const branchId = branchMembership?.branch_id;

  // Staff category drives which dashboard variant to render
  const { data: myDesignation } = useQuery({
    queryKey: ["my-designation", userId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_designations")
        .select("category, designation, custom_designation")
        .eq("user_id", userId!)
        .eq("branch_id", branchId!)
        .maybeSingle();
      return data as any;
    },
    enabled: !!userId && !!branchId,
  });

  // Resolve effective category (fallback to role)
  const category: string = (() => {
    if (myDesignation?.category) return myDesignation.category;
    if (role === "teacher") return "teaching";
    return "non_teaching";
  })();

  const { data: attendanceToday } = useQuery({
    queryKey: ["my-attendance-today", userId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_attendance").select("*")
        .eq("user_id", userId!).eq("date", today).maybeSingle();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: leaveBal } = useQuery({
    queryKey: ["my-leave-bal", userId, year],
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_balances").select("*")
        .eq("user_id", userId!).eq("year", year).maybeSingle();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: customTypes = [] } = useQuery({
    queryKey: ["my-custom-types", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_leave_types" as any).select("*")
        .eq("branch_id", branchId!).eq("is_active", true);
      return (data ?? []) as any[];
    },
    enabled: !!branchId,
  });

  const { data: customBals = [] } = useQuery({
    queryKey: ["my-custom-bals", userId, year],
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_leave_balances" as any).select("*")
        .eq("user_id", userId!).eq("year", year);
      return (data ?? []) as any[];
    },
    enabled: !!userId,
  });

  const { data: pendingLeaves = 0 } = useQuery({
    queryKey: ["my-pending-leaves", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("leave_requests").select("id", { count: "exact", head: true })
        .eq("user_id", userId!).eq("status", "pending");
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["staff-announcements", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements").select("id, title, content, created_at, target_type")
        .eq("target_type", "staff")
        .order("created_at", { ascending: false }).limit(3);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const balanceCards = useMemo(() => {
    const std = [
      { key: "annual", label: "Annual" },
      { key: "medical", label: "Medical" },
      { key: "hospitalisation", label: "Hospitalisation" },
      { key: "emergency", label: "Emergency" },
      { key: "birthday", label: "Birthday" },
    ].map((s) => {
      // numeric columns from PostgREST come back as strings — coerce to preserve decimals
      const total = Number(leaveBal?.[`${s.key}_total`] ?? (s.key === "birthday" ? 1 : 0)) || 0;
      const used = Number(leaveBal?.[`${s.key}_used`] ?? 0) || 0;
      return { label: s.label, total, used, isCustom: false };
    });
    const custom = customTypes.map((t) => {
      const b = customBals.find((cb) => cb.custom_leave_type_id === t.id);
      return {
        label: t.name,
        total: Number(b?.total ?? t.default_days ?? 0) || 0,
        used: Number(b?.used ?? 0) || 0,
        isCustom: true,
      };
    });
    return [...std, ...custom];
  }, [leaveBal, customTypes, customBals]);

  // Common HR self-service actions (every staff has these)
  const hrActions = [
    { label: "Clock In/Out", icon: Clock, to: "/staff-attendance", show: isAllowed("/staff-attendance"), color: "text-info bg-info/10" },
    { label: "Apply Leave", icon: CalendarDays, to: "/leave", show: isAllowed("/leave"), color: "text-primary bg-primary/10" },
    { label: "Apply OT", icon: Clock, to: "/overtime", show: isAllowed("/overtime"), color: "text-primary-deep bg-primary-wash" },
    { label: "Submit Claim", icon: Receipt, to: "/claims", show: isAllowed("/claims"), color: "text-success bg-success/10" },
    { label: "My Payslips", icon: Wallet, to: "/my-payslips", show: isAllowed("/my-payslips"), color: "text-warning bg-warning/10" },
    { label: "Messages", icon: MessageSquare, to: "/staff-inbox", show: isAllowed("/staff-inbox"), color: "text-info bg-info/10" },
  ];

  // Teaching-specific actions
  const teachingActions = [
    { label: "Take Attendance", icon: ClipboardCheck, to: "/attendance", show: isAllowed("/attendance"), color: "text-info bg-info/10" },
    { label: "Lesson Plans", icon: BookOpen, to: "/lesson-planner", show: isAllowed("/lesson-planner"), color: "text-success bg-success/10" },
    { label: "Daily Updates", icon: MessageSquare, to: "/daily-updates", show: isAllowed("/daily-updates"), color: "text-destructive bg-destructive/10" },
    { label: "Class Readiness", icon: Eye, to: "/curriculum/readiness", show: isAllowed("/curriculum/readiness"), color: "text-primary-deep bg-primary-wash" },
    { label: "My Students", icon: Users, to: "/students", show: isAllowed("/students"), color: "text-warning bg-warning/10" },
  ];

  // Marketing-specific actions
  const marketingActions = [
    { label: "Open Leads", icon: Target, to: "/crm", show: isAllowed("/crm"), color: "text-destructive bg-destructive/10" },
    { label: "Enrolment", icon: UserPlus, to: "/assessments", show: isAllowed("/assessments"), color: "text-primary-deep bg-primary-wash" },
    { label: "Tours", icon: CalendarDays, to: "/crm?tab=tours", show: isAllowed("/crm"), color: "text-success bg-success/10" },
    { label: "Students", icon: Users, to: "/students", show: isAllowed("/students"), color: "text-warning bg-warning/10" },
    { label: "eForms", icon: FileText, to: "/eforms", show: isAllowed("/eforms"), color: "text-info bg-info/10" },
  ];

  // Pick category-specific primary actions, then add HR self-service
  const primaryActions = (() => {
    if (category === "teaching") return teachingActions.filter(a => a.show);
    if (category === "marketing") return marketingActions.filter(a => a.show);
    return [];
  })();
  const quickActions = [...primaryActions, ...hrActions.filter(a => a.show)].slice(0, 9);

  // Category-specific data widgets
  const { data: teachingStats } = useQuery({
    queryKey: ["teaching-stats", userId, branchId, today],
    queryFn: async () => {
      const [{ count: obs }, { count: pendingPlans }] = await Promise.all([
        (supabase.from("student_observations" as any) as any).select("id", { count: "exact", head: true })
          .eq("created_by", userId!).gte("observation_date", today),
        (supabase.from("lesson_plans" as any) as any).select("id", { count: "exact", head: true })
          .eq("created_by", userId!).eq("status", "draft"),
      ]);
      return { observationsToday: obs ?? 0, draftPlans: pendingPlans ?? 0 };
    },
    enabled: category === "teaching" && !!userId,
  });

  const { data: marketingStats } = useQuery({
    queryKey: ["marketing-stats", branchId],
    queryFn: async () => {
      const [{ count: openLeads }, { count: studentsActive }] = await Promise.all([
        (supabase.from("leads" as any) as any).select("id", { count: "exact", head: true })
          .eq("branch_id", branchId!).neq("status", "enrolled").neq("status", "lost"),
        (supabase.from("students" as any) as any).select("id", { count: "exact", head: true })
          .eq("branch_id", branchId!).eq("is_active", true),
      ]);
      return { openLeads: openLeads ?? 0, activeStudents: studentsActive ?? 0 };
    },
    enabled: category === "marketing" && !!branchId,
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = (user?.user_metadata as any)?.first_name || "there";
  const clockedIn = !!attendanceToday?.clock_in && !attendanceToday?.clock_out;
  const categoryLabel: Record<string, string> = {
    teaching: "Teaching Staff",
    non_teaching: "Non-Teaching Staff",
    marketing: "Marketing",
    admin_hr: "Admin / HR",
    finance: "Finance",
    operations: "Operations",
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Greeting */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 sm:p-6 border border-primary/20 shadow-[var(--shadow-soft)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
            <h1 className="text-xl sm:text-2xl font-bold mt-1 truncate text-foreground">
              {greeting}, {firstName}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px] bg-primary-wash text-primary-deep border-0">{categoryLabel[category] ?? role}</Badge>
              {clockedIn && (
                <Badge className="text-[10px] bg-success hover:bg-success text-success-foreground">
                  <Clock className="h-3 w-3 mr-1" /> Clocked in
                </Badge>
              )}
              {pendingLeaves > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {pendingLeaves} pending leave
                </Badge>
              )}
            </div>
          </div>
          <Sparkles className="h-8 w-8 text-primary/40 shrink-0 hidden sm:block" />
        </div>
      </div>

      {/* Category-specific KPI strip */}
      {category === "teaching" && teachingStats && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Observations today</p>
            <p className="text-2xl font-bold mt-0.5">{teachingStats.observationsToday}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Lesson plans (draft)</p>
            <p className="text-2xl font-bold mt-0.5">{teachingStats.draftPlans}</p>
          </div>
        </div>
      )}
      {category === "marketing" && marketingStats && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3"/> Open leads</p>
            <p className="text-2xl font-bold mt-0.5">{marketingStats.openLeads}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3"/> Active students</p>
            <p className="text-2xl font-bold mt-0.5">{marketingStats.activeStudents}</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-1">Quick actions</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border bg-card hover:shadow-md transition active:scale-95"
                >
                  <span className={cn("rounded-full p-2.5", a.color)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] sm:text-xs font-medium text-center leading-tight">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* My Time Off */}
      {isAllowed("/leave") && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">My Time Off ({year})</CardTitle>
              <CardDescription className="text-xs">Tap a balance to apply for leave</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate("/leave")}>
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {balanceCards.map((b) => {
                const left = Math.max(0, (b.total ?? 0) - (b.used ?? 0));
                const pct = b.total > 0 ? Math.min(100, (b.used / b.total) * 100) : 0;
                const color = pct >= 80 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-primary";
                const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
                return (
                  <button
                    key={b.label}
                    onClick={() => navigate("/leave")}
                    className="text-left rounded-lg border p-3 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[11px] text-muted-foreground truncate">{b.label}</p>
                      {b.isCustom && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">Custom</Badge>
                      )}
                    </div>
                    <p className="text-xl font-bold mt-1">{fmt(left)}<span className="text-xs text-muted-foreground font-normal"> left</span></p>
                    <p className="text-[10px] text-muted-foreground">{fmt(b.used)} / {fmt(b.total)} used</p>
                    <div className="h-1 mt-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Announcements */}
      {announcements.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Latest announcements
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate("/announcements?audience=staff")}>
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.map((a: any) => (
              <div key={a.id} className="rounded-lg border p-3 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{a.title}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(a.created_at), "d MMM")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{a.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}