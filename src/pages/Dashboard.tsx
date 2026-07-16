import { useState } from "react";
import { useAuth, getRoleLabel } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Users, GraduationCap, BookOpen, ClipboardList, MessageSquare,
  Megaphone, FileText, Receipt, TrendingUp, TrendingDown, Minus,
  Calendar, Download, Clock, Loader2, Sparkles, CalendarDays, UserCheck
} from "lucide-react";
import { Lightbulb } from "lucide-react";
import StaffAttendanceWidget from "@/components/attendance/StaffAttendanceWidget";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ComposedChart, Legend
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import StaffDashboard from "@/components/dashboard/StaffDashboard";
import AdminOperationsDashboard from "@/components/dashboard/AdminOperationsDashboard";
import { programLabel, type ProgramType } from "@/lib/programType";

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, prev, suffix = "" }: {
  label: string; value: number; icon: React.ElementType; prev?: number; suffix?: string;
}) {
  const diff = prev !== undefined && prev > 0 ? ((value - prev) / prev) * 100 : undefined;
  const TrendIcon = diff === undefined ? Minus : diff >= 0 ? TrendingUp : TrendingDown;
  const trendColor = diff === undefined ? "text-muted-foreground" : diff >= 0 ? "text-success" : "text-destructive";

  return (
    <Card className="shadow-[var(--shadow-card)] border-border/50">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">{label}</p>
            <p className="text-lg sm:text-2xl font-bold">{value}{suffix}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 shrink-0 ml-2">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
        </div>
        {diff !== undefined && (
          <div className={`mt-1.5 sm:mt-2 flex items-center gap-1 text-[10px] sm:text-xs ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{Math.abs(Math.round(diff))}% vs prev day</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section wrapper ─────────────────────────────────────────
function DashboardSection({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Data hooks ──────────────────────────────────────────────
type ProgramFilter = "all" | ProgramType;

function useDashboardData(branchId: string | null, date: string, programFilter: ProgramFilter = "all") {
  const yesterday = format(subDays(new Date(date), 1), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date(date)), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(date)), "yyyy-MM-dd");

  // Attendance today
  const attendanceToday = useQuery({
    queryKey: ["dash-att-today", branchId, date],
    queryFn: async () => {
      let q = supabase.from("attendance").select("status").eq("date", date);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const records = data ?? [];
      const present = records.filter((r: any) => r.status === "present" || r.status === "late").length;
      const absent = records.filter((r: any) => ["absent", "excused", "sick"].includes(r.status)).length;
      return { total: records.length, present, absent };
    },
  });

  // Attendance yesterday (for comparison)
  const attendanceYesterday = useQuery({
    queryKey: ["dash-att-yesterday", branchId, yesterday],
    queryFn: async () => {
      let q = supabase.from("attendance").select("status").eq("date", yesterday);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const records = data ?? [];
      return records.filter((r: any) => r.status === "present" || r.status === "late").length;
    },
  });

  // Monthly attendance chart data
  const monthlyAttendance = useQuery({
    queryKey: ["dash-att-month", branchId, monthStart, monthEnd],
    queryFn: async () => {
      let q = supabase.from("attendance").select("date, status").gte("date", monthStart).lte("date", monthEnd);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const days = eachDayOfInterval({ start: new Date(monthStart), end: new Date(date) });
      return days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const dayRecords = (data ?? []).filter((r: any) => r.date === dateStr);
        const present = dayRecords.filter((r: any) => r.status === "present" || r.status === "late").length;
        return { day: format(d, "d"), present, absent: dayRecords.length - present };
      });
    },
  });

  // Active students (with program split for KPI subline)
  const students = useQuery({
    queryKey: ["dash-students", branchId, programFilter],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, classes:class_id(program_type)")
        .eq("is_active", true);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const rows = (data ?? []) as any[];
      const taska = rows.filter((r) => r.classes?.program_type === "taska").length;
      const preschool = rows.filter((r) => r.classes?.program_type !== "taska").length;
      const total =
        programFilter === "taska" ? taska : programFilter === "preschool" ? preschool : rows.length;
      return { total, taska, preschool };
    },
  });

  // Open conversations
  const conversations = useQuery({
    queryKey: ["dash-convos", branchId],
    queryFn: async () => {
      let q = supabase.from("conversations").select("ai_intent_tag, status");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const records = data ?? [];
      const open = records.filter((r: any) => r.status === "open").length;
      const byTag: Record<string, number> = {};
      records.forEach((r: any) => {
        const tag = r.ai_intent_tag || "general";
        byTag[tag] = (byTag[tag] || 0) + 1;
      });
      return { open, byTag: Object.entries(byTag).map(([tag, count]) => ({ tag, count })) };
    },
  });

  // Unread messages
  const unreadMessages = useQuery({
    queryKey: ["dash-unread", branchId],
    queryFn: async () => {
      const { count } = await supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("is_read", false);
      return count ?? 0;
    },
  });

  // Announcements this month
  const announcements = useQuery({
    queryKey: ["dash-announcements", branchId, monthStart],
    queryFn: async () => {
      let q = supabase.from("announcements").select("created_at");
      if (branchId) q = q.eq("branch_id", branchId);
      q = q.gte("created_at", monthStart);
      const { data } = await q;
      return data?.length ?? 0;
    },
  });

  // Newsletters this month
  const newsletters = useQuery({
    queryKey: ["dash-newsletters", branchId, monthStart],
    queryFn: async () => {
      let q = supabase.from("newsletters").select("sent_at, status");
      if (branchId) q = q.eq("branch_id", branchId);
      q = q.eq("status", "sent").gte("sent_at", monthStart);
      const { data } = await q;
      return data?.length ?? 0;
    },
  });

  const currentMonth = new Date(date).getMonth() + 1;
  const currentYear = new Date(date).getFullYear();

  // Lesson plans (total + this month by class)
  const lessonPlans = useQuery({
    queryKey: ["dash-lessons", branchId, currentMonth, currentYear, programFilter],
    queryFn: async () => {
      let q = supabase
        .from("lesson_plans")
        .select("id, class_id, created_at, classes:class_id(program_type)") as any;
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      let records = (data ?? []) as any[];
      if (programFilter !== "all") {
        records = records.filter((r) =>
          programFilter === "taska"
            ? r.classes?.program_type === "taska"
            : r.classes?.program_type !== "taska"
        );
      }
      const thisMonth = records.filter((r: any) => {
        const d = new Date(r.created_at);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      });
      return { total: records.length, thisMonth };
    },
  });

  // Observations (total + this month, grouped via student -> class)
  const observations = useQuery({
    queryKey: ["dash-observations", branchId, currentMonth, currentYear, programFilter],
    queryFn: async () => {
      let q = supabase
        .from("student_observations")
        .select("id, student_id, observed_at, students!inner(class_id, classes:class_id(program_type))") as any;
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      let records = (data ?? []) as any[];
      if (programFilter !== "all") {
        records = records.filter((r) =>
          programFilter === "taska"
            ? r.students?.classes?.program_type === "taska"
            : r.students?.classes?.program_type !== "taska"
        );
      }
      const thisMonth = records.filter((r: any) => {
        const d = new Date(r.observed_at);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      });
      return { total: records.length, thisMonth };
    },
  });

  // Classes for academic breakdown
  const classes = useQuery({
    queryKey: ["dash-classes", branchId, programFilter],
    queryFn: async () => {
      let q = supabase
        .from("classes")
        .select("id, class_name, program_type")
        .eq("is_active", true);
      if (branchId) q = q.eq("branch_id", branchId);
      if (programFilter === "taska") q = q.eq("program_type", "taska");
      else if (programFilter === "preschool")
        q = q.or("program_type.is.null,program_type.eq.preschool");
      const { data } = await q;
      return data ?? [];
    },
  });

  // Invoices (enhanced)
  const invoices = useQuery({
    queryKey: ["dash-invoices", branchId, currentMonth, currentYear],
    queryFn: async () => {
      let q = supabase.from("invoices").select("status, total_amount, amount_paid, billing_month, billing_year");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      const records = (data ?? []) as any[];
      const thisMonthInvoices = records.filter((r: any) => r.billing_month === currentMonth && r.billing_year === currentYear);
      const totalMonth = thisMonthInvoices.length;
      const overdue = records.filter((r: any) => r.status === "overdue").length;
      const collected = thisMonthInvoices
        .filter((r: any) => r.status === "paid")
        .reduce((sum: number, r: any) => sum + Number(r.amount_paid || 0), 0);
      const outstanding = records
        .filter((r: any) => !["paid", "cancelled", "draft"].includes(r.status))
        .reduce((sum: number, r: any) => sum + (Number(r.total_amount || 0) - Number(r.amount_paid || 0)), 0);
      return { totalMonth, overdue, collected, outstanding };
    },
  });

  // Branches list (for selector)
  const branches = useQuery({
    queryKey: ["dash-branches-list"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const loading = attendanceToday.isLoading || students.isLoading;

  return {
    attendanceToday: attendanceToday.data ?? { total: 0, present: 0, absent: 0 },
    attendanceYesterday: attendanceYesterday.data ?? 0,
    monthlyAttendance: monthlyAttendance.data ?? [],
    students: students.data ?? { total: 0, taska: 0, preschool: 0 },
    conversations: conversations.data ?? { open: 0, byTag: [] },
    unreadMessages: unreadMessages.data ?? 0,
    announcements: announcements.data ?? 0,
    newsletters: newsletters.data ?? 0,
    lessonPlans: lessonPlans.data ?? { total: 0, thisMonth: [] },
    observations: observations.data ?? { total: 0, thisMonth: [] },
    classes: classes.data ?? [],
    invoices: invoices.data ?? { totalMonth: 0, overdue: 0, collected: 0, outstanding: 0 },
    branches: branches.data ?? [],
    loading,
  };
}

// ─── Main Dashboard ──────────────────────────────────────────
export default function Dashboard() {
  const { user, role, allowedRoutes, loading: authLoading } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const [selectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const branchId = selectedBranch === "all" ? null : selectedBranch;
  const [programFilter, setProgramFilter] = useState<ProgramFilter>(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("dashboard_program_filter");
    return saved === "taska" || saved === "preschool" ? (saved as ProgramFilter) : "all";
  });
  const updateProgramFilter = (v: ProgramFilter) => {
    setProgramFilter(v);
    try { window.localStorage.setItem("dashboard_program_filter", v); } catch {}
  };
  const stats = useDashboardData(branchId, selectedDate, programFilter);

  if (!authLoading && role === "parent") {
    return <Navigate to="/child" replace />;
  }

  // Admin gets the new School Operations Command Center.
  if (!authLoading && role === "admin") {
    return <AdminOperationsDashboard />;
  }

  // Teacher / staff (Non-Teaching) get the focused personal staff dashboard.
  if (!authLoading && (role === "teacher" || role === "staff")) {
    return (
      <DashboardLayout>
        <StaffDashboard />
      </DashboardLayout>
    );
  }

  // Gate dashboard by access group: if non-admin user has an access group that
  // does not include /dashboard, send them to the first allowed route.
  if (
    !authLoading &&
    role &&
    role !== "super_admin" &&
    role !== "franchisee" &&
    role !== "teacher" &&
    allowedRoutes.length > 0 &&
    !allowedRoutes.some((r) => r === "/dashboard" || "/dashboard".startsWith(r))
  ) {
    return <Navigate to={allowedRoutes[0]} replace />;
  }

  if (authLoading || stats.loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const showBranchSelector = role === "super_admin" || role === "franchisee" || role === "admin";
  const showBilling = role !== "teacher";
  const showCommunications = role !== "teacher" || role === "teacher";

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Welcome back, {user?.user_metadata?.first_name || "there"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {getRoleLabel(role)} Dashboard · {format(new Date(), "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={programFilter} onValueChange={(v) => updateProgramFilter(v as ProgramFilter)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                <SelectItem value="preschool">{programLabel("preschool")}</SelectItem>
                <SelectItem value="taska">{programLabel("taska")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        </div>

        {/* Attendance & Check-in */}
        <DashboardSection title="Attendance & Check-in" icon={ClipboardList}>
           <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr]">
             <div className="grid gap-3 grid-cols-2">
               <KpiCard
                 label="Students Present"
                 value={stats.attendanceToday.present}
                 icon={GraduationCap}
                 prev={stats.attendanceYesterday}
               />
               <KpiCard
                 label="Absent Today"
                 value={stats.attendanceToday.absent}
                 icon={ClipboardList}
               />
               <KpiCard
                 label="Active Students"
                 value={stats.students.total}
                 icon={Users}
               />
               <KpiCard
                 label="Attendance Rate"
                 value={stats.students.total > 0 ? Math.round((stats.attendanceToday.present / stats.students.total) * 100) : 0}
                 icon={TrendingUp}
                 suffix="%"
               />
               {programFilter === "all" && (stats.students.taska > 0 || stats.students.preschool > 0) && (
                 <div className="col-span-2 flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground -mt-1">
                   <Badge variant="outline" className="text-[10px]">Preschool {stats.students.preschool}</Badge>
                   <Badge variant="secondary" className="text-[10px]">Taska {stats.students.taska}</Badge>
                 </div>
               )}
             </div>
            <Card className="shadow-[var(--shadow-card)] border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Daily Attendance ({format(new Date(), "MMMM yyyy")})
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthlyAttendance} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Bar dataKey="present" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Present" />
                    <Bar dataKey="absent" fill="hsl(var(--destructive) / 0.4)" radius={[3, 3, 0, 0]} name="Absent" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </DashboardSection>

        {/* Staff Attendance */}
        {showBranchSelector && (
          <DashboardSection title="Staff Attendance" icon={UserCheck}>
            <StaffAttendanceWidget branchId={branchId} />
          </DashboardSection>
        )}

        {/* Communications */}
        {showCommunications && (
          <DashboardSection title="Communications" icon={MessageSquare}>
            <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr]">
              <div className="grid gap-3 grid-cols-2">
                <KpiCard label="Open Conversations" value={stats.conversations.open} icon={MessageSquare} />
                <KpiCard label="Unread Messages" value={stats.unreadMessages} icon={MessageSquare} />
                <KpiCard label="Announcements (Month)" value={stats.announcements} icon={Megaphone} />
                <KpiCard label="Newsletters Sent" value={stats.newsletters} icon={FileText} />
              </div>
              <Card className="shadow-[var(--shadow-card)] border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Conversations by Topic
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.conversations.byTag} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <YAxis dataKey="tag" type="category" width={90} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      />
                      <Bar dataKey="count" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} name="Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>
        )}

        {/* Teacher Daily Schedule */}
        {role === "teacher" && <TeacherDailySchedule userId={user?.id} />}

        {/* Enrollment Pipeline */}
        {role !== "teacher" && <EnrollmentPipelineWidget />}

        {/* Academic */}
        <DashboardSection title="Academic" icon={BookOpen}>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Lesson Plans" value={stats.lessonPlans.total} icon={BookOpen} />
            <KpiCard label="This Month Plans" value={stats.lessonPlans.thisMonth.length} icon={CalendarDays} />
            <KpiCard label="Total Observations" value={stats.observations.total} icon={ClipboardList} />
            <KpiCard label="This Month Observations" value={stats.observations.thisMonth.length} icon={CalendarDays} />
          </div>
          {stats.classes.length > 0 && (
            <Card className="shadow-[var(--shadow-card)] border-border/50 mt-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Class Academic Progress ({format(new Date(), "MMMM yyyy")})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Class</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Lesson Plans</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Observations</th>
                        <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.classes.map((cls: any) => {
                        const lpCount = stats.lessonPlans.thisMonth.filter((lp: any) => lp.class_id === cls.id).length;
                        const obsCount = stats.observations.thisMonth.filter((o: any) => o.students?.class_id === cls.id).length;
                        const hasPlans = lpCount > 0;
                        const hasObs = obsCount > 0;
                        return (
                          <tr key={cls.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">
                              <span className="inline-flex items-center gap-2">
                                {cls.class_name}
                                {cls.program_type === "taska" && (
                                  <Badge variant="secondary" className="text-[10px]">Taska</Badge>
                                )}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">{lpCount}</td>
                            <td className="py-2 px-3 text-center">{obsCount}</td>
                            <td className="py-2 px-3 text-center">
                              {hasPlans && hasObs ? (
                                <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">Complete</Badge>
                              ) : hasPlans || hasObs ? (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">In Progress</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">Pending</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </DashboardSection>

        {/* Billing */}
        {showBilling && (
          <DashboardSection title="Billing" icon={Receipt}>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Invoices (Month)" value={stats.invoices.totalMonth} icon={FileText} />
              <KpiCard label="Overdue Invoices" value={stats.invoices.overdue} icon={Receipt} />
              <Card className="shadow-[var(--shadow-card)] border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Collected (Month)</p>
                      <p className="text-2xl font-bold">
                        RM {stats.invoices.collected.toLocaleString("en-MY", { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="rounded-lg bg-accent/10 p-2">
                      <TrendingUp className="h-4 w-4 text-accent" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-[var(--shadow-card)] border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
                      <p className="text-2xl font-bold text-destructive">
                        RM {stats.invoices.outstanding.toLocaleString("en-MY", { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="rounded-lg bg-destructive/10 p-2">
                      <Receipt className="h-4 w-4 text-destructive" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DashboardSection>
        )}

        {/* No role assigned */}
        {!role && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Your account is pending role assignment. Please contact your administrator.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Enrollment Pipeline Widget ──────────────────────────────
function EnrollmentPipelineWidget() {
  const { data: leads = [] } = useQuery({
    queryKey: ["pipeline-leads"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("status");
      return data ?? [];
    },
  });

  const tourCount = leads.filter((l: any) => l.status === "tour_scheduled").length;
  const trialCount = leads.filter((l: any) => l.status === "trial_scheduled").length;
  const enrolledCount = leads.filter((l: any) => l.status === "enrolled").length;
  const total = tourCount + trialCount + enrolledCount || 1;

  return (
    <DashboardSection title="Enrollment Pipeline" icon={GraduationCap}>
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">{tourCount}</p>
              <p className="text-xs text-muted-foreground">Tour Scheduled</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{trialCount}</p>
              <p className="text-xs text-muted-foreground">Trial Scheduled</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{enrolledCount}</p>
              <p className="text-xs text-muted-foreground">Enrolled</p>
            </div>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {tourCount > 0 && <div className="bg-primary/60" style={{ width: `${(tourCount / total) * 100}%` }} />}
            {trialCount > 0 && <div className="bg-primary/80" style={{ width: `${(trialCount / total) * 100}%` }} />}
            {enrolledCount > 0 && <div className="bg-primary" style={{ width: `${(enrolledCount / total) * 100}%` }} />}
          </div>
          <div className="flex gap-4 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/60" />Tour</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/80" />Trial</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Enrolled</span>
          </div>
        </CardContent>
      </Card>
    </DashboardSection>
  );
}

// ─── Pedagogical Insights Widget ─────────────────────────────
function PedagogicalInsightsWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: memberBranches = [] } = useQuery({
    queryKey: ["insight-branches", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data?.map((b: any) => b.branch_id) ?? [];
    },
    enabled: !!user,
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ["pending-methodology-recs", memberBranches],
    queryFn: async () => {
      if (!memberBranches.length) return [];
      const { data: students } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .in("branch_id", memberBranches);
      if (!students?.length) return [];
      const { data } = await supabase
        .from("methodology_recommendations")
        .select("*")
        .in("student_id", students.map((s: any) => s.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data ?? []).map((r: any) => ({
        ...r,
        student: students.find((s: any) => s.id === r.student_id),
      }));
    },
    enabled: memberBranches.length > 0,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ recId, studentId, methodology }: { recId: string; studentId: string; methodology: string }) => {
      await supabase.from("methodology_recommendations").update({
        status: "accepted",
        responded_by: user!.id,
        responded_at: new Date().toISOString(),
      } as any).eq("id", recId);
      await supabase.from("students").update({ current_methodology: methodology } as any).eq("id", studentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-methodology-recs"] });
      toast({ title: "Methodology updated ✅" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (recId: string) => {
      await supabase.from("methodology_recommendations").update({
        status: "rejected",
        responded_by: user!.id,
        responded_at: new Date().toISOString(),
      } as any).eq("id", recId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-methodology-recs"] });
      toast({ title: "Recommendation dismissed" });
    },
  });

  if (!recommendations.length) return null;

  return (
    <DashboardSection title="Pedagogical Insights" icon={Sparkles}>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((rec: any) => (
          <Card key={rec.id} className="border-primary/20 bg-primary/5 shadow-[var(--shadow-card)]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    💡 AI Insight: {rec.student?.first_name} {rec.student?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{rec.ai_reasoning}</p>
                  <Badge variant="secondary" className="text-xs mt-1">{rec.suggested_methodology}</Badge>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => dismissMutation.mutate(rec.id)}
                  disabled={dismissMutation.isPending}
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => acceptMutation.mutate({
                    recId: rec.id,
                    studentId: rec.student_id,
                    methodology: rec.suggested_methodology,
                  })}
                  disabled={acceptMutation.isPending}
                >
                  Accept & Apply
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardSection>
  );
}

// ─── Teacher Daily Schedule ──────────────────────────────────
function TeacherDailySchedule({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
  const mappedDay = dayOfWeek === 0 ? 0 : dayOfWeek; // 0 for Sunday (no slots)

  const [themeDialog, setThemeDialog] = useState<any>(null);
  const [weeklyDialog, setWeeklyDialog] = useState<string | null>(null); // subject_name for weekly gen
  const [theme, setTheme] = useState("");

  // Get teacher's branch memberships to find their classes
  const { data: memberBranches = [] } = useQuery({
    queryKey: ["teacher-branches", userId],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", userId!);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const branchIds = memberBranches.map((b: any) => b.branch_id);

  const { data: classes = [] } = useQuery({
    queryKey: ["teacher-classes", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").in("branch_id", branchIds).eq("is_active", true);
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const classIds = classes.map((c: any) => c.id);

  const { data: todaySlots = [] } = useQuery({
    queryKey: ["teacher-today-slots", classIds, today],
    queryFn: async () => {
      if (classIds.length === 0) return [];
      // Try daily slots first
      const { data: dailySlots } = await supabase
        .from("daily_timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name, class_id, classes:class_id(class_name, age_group)")
        .in("class_id", classIds)
        .eq("slot_date", today)
        .order("start_time");
      if (dailySlots && dailySlots.length > 0) return dailySlots;
      // Fallback to weekly template
      if (mappedDay === 0) return [];
      const { data } = await supabase
        .from("timetable_slots")
        .select("*, classes(class_name, age_group)")
        .in("class_id", classIds)
        .eq("day_of_week", mappedDay)
        .order("start_time");
      return data ?? [];
    },
    enabled: classIds.length > 0,
  });

  const { data: todayLessons = [] } = useQuery({
    queryKey: ["teacher-today-lessons", classIds, today],
    queryFn: async () => {
      if (classIds.length === 0) return [];
      const { data } = await supabase
        .from("slot_lesson_plans")
        .select("*")
        .in("class_id", classIds)
        .eq("lesson_date", today);
      return data ?? [];
    },
    enabled: classIds.length > 0,
  });

  const generateMutation = useMutation({
    mutationFn: async ({ slot, theme }: { slot: any; theme: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-slot-lesson", {
        body: {
          subject_name: slot.subject_name,
          theme,
          age_group: slot.classes?.age_group || "5+",
          class_name: slot.classes?.class_name || "",
          timetable_slot_id: slot.id,
          class_id: slot.class_id,
          lesson_date: today,
          user_id: userId,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-today-lessons"] });
      setThemeDialog(null);
      setTheme("");
      toast({ title: "Lesson generated! ✨", description: "AI activity has been created for this slot." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Weekly generation mutation
  const weeklyMutation = useMutation({
    mutationFn: async ({ subject, theme }: { subject: string; theme: string }) => {
      const weekStart = (() => { const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return format(d, "yyyy-MM-dd"); })();
      const classId = classes[0]?.id; // Use first class
      const { data, error } = await supabase.functions.invoke("generate-weekly-subject-plan", {
        body: { class_id: classId, subject_name: subject, theme, week_starting: weekStart, user_id: userId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-today-lessons"] });
      setWeeklyDialog(null);
      setTheme("");
      toast({ title: "Weekly plan generated! ✨", description: "All lessons for this subject have been created." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (mappedDay === 0 || todaySlots.length === 0) return null;

  const getLesson = (slotId: string) => todayLessons.find((l: any) => l.timetable_slot_id === slotId);

  return (
    <DashboardSection title="Today's Schedule" icon={Clock}>
      <div className="space-y-2">
        {todaySlots.map((slot: any) => {
          const lesson = getLesson(slot.id);
          const activity = lesson?.generated_activity as any;
          return (
            <Card key={slot.id} className="shadow-[var(--shadow-card)] border-border/50">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="text-xs font-mono text-muted-foreground min-w-[90px]">
                  {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                </div>
                <Badge variant="secondary" className="text-xs">{slot.subject_name}</Badge>
                <span className="text-xs text-muted-foreground">{slot.classes?.class_name}</span>
                <div className="flex-1" />
                {lesson ? (
                  <div className="text-xs text-foreground font-medium truncate max-w-[200px]">
                    {activity?.name || "Lesson ready"}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1"
                    onClick={() => setThemeDialog(slot)}
                  >
                    <Sparkles className="h-3 w-3" /> Generate Lesson
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick weekly generate buttons per unique subject */}
      {(() => {
        const uniqueSubjects = [...new Set(todaySlots.map((s: any) => s.subject_name))];
        return uniqueSubjects.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {uniqueSubjects.map((subj) => (
              <Button
                key={subj}
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => setWeeklyDialog(subj)}
              >
                <CalendarDays className="h-3 w-3" /> Generate All {subj} This Week
              </Button>
            ))}
          </div>
        ) : null;
      })()}

      {/* Single slot dialog */}
      <Dialog open={!!themeDialog} onOpenChange={() => setThemeDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Lesson</DialogTitle>
            <DialogDescription>
              {themeDialog?.subject_name} · {themeDialog?.start_time?.slice(0, 5)} - {themeDialog?.end_time?.slice(0, 5)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Weekly Theme</Label>
            <Input placeholder="e.g. Animals, Space, Ocean" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => theme && themeDialog && generateMutation.mutate({ slot: themeDialog, theme })}
              disabled={!theme || generateMutation.isPending}
            >
              {generateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Weekly subject dialog */}
      <Dialog open={!!weeklyDialog} onOpenChange={() => setWeeklyDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Weekly {weeklyDialog} Plan</DialogTitle>
            <DialogDescription>
              Generate all {weeklyDialog} lessons for this week. Consecutive slots will be merged into longer activities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Weekly Theme</Label>
            <Input placeholder="e.g. Animals, Space, Ocean" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              onClick={() => theme && weeklyDialog && weeklyMutation.mutate({ subject: weeklyDialog, theme })}
              disabled={!theme || weeklyMutation.isPending}
            >
              {weeklyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Generate Week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardSection>
  );
}

