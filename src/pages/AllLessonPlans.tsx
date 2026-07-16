import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { calculateLessonCompleteness } from "@/lib/lesson-completeness";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  Eye, Loader2, BookOpen, ChevronRight, CheckCircle2, XCircle,
  FileText, Copy, Archive, BarChart3, Clock,
  ArrowLeft, FolderOpen, CalendarDays, Calendar
} from "lucide-react";
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval, isSameWeek } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

type ReviewStatus = "draft" | "ready_for_review" | "approved" | "returned_for_revision" | "archived";

const reviewStatusConfig: Record<ReviewStatus, { label: string; color: string; icon: any }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: FileText },
  ready_for_review: { label: "Ready for Review", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Clock },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  returned_for_revision: { label: "Needs Revision", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground", icon: Archive },
};

export default function AllLessonPlans() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, activeBranchIds } = useGlobalBranch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const hasAccessibleBranches = activeBranchIds.length > 0;

  // Three-level navigation: null → month → week
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null); // ISO date string of week start

  // Drill-down filters
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedTeacher, setSelectedTeacher] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Review drawer
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [reviewComments, setReviewComments] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", selectedBranch, activeBranchIds.join(",")],
    queryFn: async () => {
      if (!hasAccessibleBranches) return [];
      let q = supabase.from("classes").select("id, class_name, age_group").eq("is_active", true).order("class_name");
      q = selectedBranch === "all" ? q.in("branch_id", activeBranchIds) : q.eq("branch_id", selectedBranch);
      const { data } = await q;
      return data ?? [];
    },
    enabled: hasAccessibleBranches,
  });

  const { data: timetableSlots = [] } = useQuery({
    queryKey: ["timetable-subjects", selectedBranch, activeBranchIds.join(",")],
    queryFn: async () => {
      if (!hasAccessibleBranches) return [];
      let q: any = supabase.from("timetable_slots").select("class_id, subject_name");
      q = selectedBranch === "all" ? q.in("branch_id", activeBranchIds) : q.eq("branch_id", selectedBranch);
      const { data } = await q;
      return data ?? [];
    },
    enabled: hasAccessibleBranches,
  });

  const expectedSubjectsByClass = useMemo(() => {
    const map = new Map<string, Set<string>>();
    timetableSlots.forEach((s: any) => {
      if (!s.class_id || !s.subject_name) return;
      if (!map.has(s.class_id)) map.set(s.class_id, new Set());
      map.get(s.class_id)!.add(s.subject_name);
    });
    return map;
  }, [timetableSlots]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["all-lesson-plans", selectedBranch, activeBranchIds.join(",")],
    queryFn: async () => {
      if (!hasAccessibleBranches) return [];
      let q = supabase
        .from("lesson_plans")
        .select("*, classes(class_name), profiles:user_id(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(1000);
      q = selectedBranch === "all" ? q.in("branch_id", activeBranchIds) : q.eq("branch_id", selectedBranch);
      const { data } = await q;
      return (data ?? []).map((p: any) => {
        const { score, breakdown } = calculateLessonCompleteness(p);
        return { ...p, completeness_score: score, completeness_breakdown: breakdown };
      });
    },
    enabled: hasAccessibleBranches,
  });

  const teachers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    plans.forEach((p: any) => {
      if (p.user_id && !map.has(p.user_id)) {
        const name = p.profiles ? `${p.profiles.first_name || ""} ${p.profiles.last_name || ""}`.trim() : "Unknown";
        map.set(p.user_id, { id: p.user_id, name: name || "Unknown" });
      }
    });
    return Array.from(map.values());
  }, [plans]);

  const { data: reviewHistory = [] } = useQuery({
    queryKey: ["plan-reviews", selectedPlan?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_plan_reviews")
        .select("*, profiles:reviewer_id(first_name, last_name)")
        .eq("lesson_plan_id", selectedPlan.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!selectedPlan?.id,
  });

  // === LEVEL 1: Group by month ===
  const monthlyGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    plans.forEach((p: any) => {
      const key = format(new Date(p.created_at), "yyyy-MM");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [plans]);

  // === LEVEL 2: Group selected month's plans by week ===
  const weeklyGroups = useMemo(() => {
    if (!selectedMonth) return [];
    const monthItems = plans.filter((p: any) => format(new Date(p.created_at), "yyyy-MM") === selectedMonth);
    const groups = new Map<string, any[]>();
    monthItems.forEach((p: any) => {
      const d = new Date(p.start_date || p.created_at);
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const key = format(ws, "yyyy-MM-dd");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans, selectedMonth]);

  // Auto-select current week when entering a month
  const autoSelectedWeek = useMemo(() => {
    if (!selectedMonth || weeklyGroups.length === 0) return null;
    const now = new Date();
    const currentWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const match = weeklyGroups.find(([k]) => k === currentWeekStart);
    return match ? match[0] : weeklyGroups[weeklyGroups.length - 1][0]; // fallback to latest
  }, [selectedMonth, weeklyGroups]);

  const activeWeek = selectedWeek || autoSelectedWeek;

  // === LEVEL 3: Plans for selected week, filtered ===
  const weekPlans = useMemo(() => {
    if (!activeWeek) return [];
    const ws = parseISO(activeWeek);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    let filtered = plans.filter((p: any) => {
      const d = new Date(p.start_date || p.created_at);
      return format(new Date(p.created_at), "yyyy-MM") === selectedMonth &&
        isWithinInterval(d, { start: ws, end: we });
    });
    if (selectedClass !== "all") filtered = filtered.filter((p: any) => p.class_id === selectedClass);
    if (selectedTeacher !== "all") filtered = filtered.filter((p: any) => p.user_id === selectedTeacher);
    if (selectedSubject !== "all") {
      filtered = filtered.filter((p: any) => {
        const subj = p.title?.split("—")[0]?.trim().split(" — ")[0]?.trim() || "";
        return subj.toLowerCase().includes(selectedSubject.toLowerCase());
      });
    }
    if (reviewFilter !== "all") filtered = filtered.filter((p: any) => (p.review_status || "draft") === reviewFilter);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p: any) => p.title?.toLowerCase().includes(term) || p.theme?.toLowerCase().includes(term));
    }
    return filtered;
  }, [plans, activeWeek, selectedMonth, selectedClass, selectedTeacher, selectedSubject, reviewFilter, searchTerm]);

  // Extract subjects from week plans for filter
  const weekSubjects = useMemo(() => {
    if (!activeWeek) return [];
    const ws = parseISO(activeWeek);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    const monthItems = plans.filter((p: any) => {
      const d = new Date(p.start_date || p.created_at);
      return format(new Date(p.created_at), "yyyy-MM") === selectedMonth &&
        isWithinInterval(d, { start: ws, end: we });
    });
    const subjects = new Set<string>();
    monthItems.forEach((p: any) => {
      const subj = extractSubject(p.title);
      if (subj) subjects.add(subj);
    });
    return Array.from(subjects).sort();
  }, [plans, activeWeek, selectedMonth]);

  // Group week plans by class, then by subject within each class
  const classSubjectGrouped = useMemo(() => {
    const classMap = new Map<string, { className: string; subjects: Map<string, any[]> }>();
    weekPlans.forEach((p: any) => {
      const cid = p.class_id || "unassigned";
      if (!classMap.has(cid)) {
        classMap.set(cid, { className: p.classes?.class_name || "Unassigned", subjects: new Map() });
      }
      const subj = extractSubject(p.title) || "Other";
      const group = classMap.get(cid)!;
      if (!group.subjects.has(subj)) group.subjects.set(subj, []);
      group.subjects.get(subj)!.push(p);
    });
    return Array.from(classMap.entries())
      .sort((a, b) => a[1].className.localeCompare(b[1].className))
      .map(([classId, data]) => ({
        classId,
        className: data.className,
        subjects: Array.from(data.subjects.entries()).sort((a, b) => a[0].localeCompare(b[0])),
        totalPlans: Array.from(data.subjects.values()).reduce((s, arr) => s + arr.length, 0),
      }));
  }, [weekPlans]);

  // Stats
  const globalStats = useMemo(() => {
    const drafts = plans.filter((p: any) => (p.review_status || "draft") === "draft").length;
    const readyForReview = plans.filter((p: any) => p.review_status === "ready_for_review").length;
    const approved = plans.filter((p: any) => p.review_status === "approved").length;
    return { drafts, readyForReview, approved, total: plans.length };
  }, [plans]);

  // Navigation helpers
  function goToMonth(month: string) {
    setSelectedMonth(month);
    setSelectedWeek(null);
    resetFilters();
  }
  function goToWeek(week: string) {
    setSelectedWeek(week);
    resetFilters();
  }
  function goBackToMonths() {
    setSelectedMonth(null);
    setSelectedWeek(null);
    resetFilters();
  }
  function goBackToWeeks() {
    setSelectedWeek(null);
    resetFilters();
  }
  function resetFilters() {
    setSelectedClass("all");
    setSelectedTeacher("all");
    setSelectedSubject("all");
    setReviewFilter("all");
    setSearchTerm("");
  }

  // Current navigation level
  const level = !selectedMonth ? 1 : (!selectedWeek && !autoSelectedWeek) ? 2 : 3;
  const showWeekCards = selectedMonth && !selectedWeek && !autoSelectedWeek;
  const showWeekView = selectedMonth && activeWeek;

  // Review actions
  async function handleReviewAction(action: "approved" | "returned_for_revision") {
    if (!selectedPlan || !user) return;
    setReviewLoading(true);
    try {
      const statusMap: Record<string, string> = { approved: "approved", returned_for_revision: "draft" };
      const updateData: any = { review_status: action, status: statusMap[action] || action };
      if (action === "approved") { updateData.approved_by = user.id; updateData.approved_at = new Date().toISOString(); }
      const { error: updateError } = await supabase.from("lesson_plans").update(updateData).eq("id", selectedPlan.id);
      if (updateError) throw new Error(`Failed to update plan: ${updateError.message}`);
      await supabase.from("lesson_plan_reviews").insert({
        lesson_plan_id: selectedPlan.id, reviewer_id: user.id, action, comments: reviewComments || null,
      });
      if (selectedPlan.user_id) {
        const notifTitle = action === "approved" ? "Lesson Plan Approved" : "Lesson Plan Returned for Revision";
        const notifMsg = action === "approved"
          ? `Your lesson plan "${selectedPlan.title}" has been approved.`
          : `Your lesson plan "${selectedPlan.title}" has been returned for revision.${reviewComments ? ` Comments: ${reviewComments}` : ""}`;
        await supabase.from("notifications").insert({
          user_id: selectedPlan.user_id, title: notifTitle, message: notifMsg,
          type: "lesson_plan_review", reference_id: selectedPlan.id,
          action_url: `/curriculum/lessons/${selectedPlan.id}`,
        });
      }
      toast({ title: action === "approved" ? "Plan approved" : "Plan returned for revision" });
      setReviewComments("");

      // Optimistic cache update — immediately reflect in table + stats
      queryClient.setQueryData(
        ["all-lesson-plans", selectedBranch, activeBranchIds.join(",")],
        (old: any[]) => old?.map((p: any) =>
          p.id === selectedPlan.id
            ? { ...p, review_status: action, status: statusMap[action] }
            : p
        )
      );

      // Refetch for ground truth
      await queryClient.invalidateQueries({ queryKey: ["all-lesson-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-reviews", selectedPlan.id] });

      // Update drawer state then close
      setSelectedPlan(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setReviewLoading(false); }
  }

  async function handleDuplicate(plan: any) {
    const { id, created_at, updated_at, profiles, classes: cls, completeness_score, completeness_breakdown, ...rest } = plan;
    await supabase.from("lesson_plans").insert({
      ...rest, title: `${rest.title} (Copy)`, status: "draft", review_status: "draft", approved_by: null, approved_at: null,
    });
    toast({ title: "Plan duplicated" });
    queryClient.invalidateQueries({ queryKey: ["all-lesson-plans"] });
  }

  async function handleArchive(planId: string) {
    await supabase.from("lesson_plans").update({ review_status: "archived" }).eq("id", planId);
    toast({ title: "Plan archived" });
    queryClient.invalidateQueries({ queryKey: ["all-lesson-plans"] });
  }

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="lessons" />
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <span>Academic</span>
          <ChevronRight className="h-3 w-3" />
          <span>Dashboards</span>
          <ChevronRight className="h-3 w-3" />
          {!selectedMonth ? (
            <span className="text-foreground font-medium">Lesson Plan Review</span>
          ) : (
            <>
              <button onClick={goBackToMonths} className="hover:text-foreground transition-colors">Lesson Plan Review</button>
              <ChevronRight className="h-3 w-3" />
              {activeWeek ? (
                <>
                  <button onClick={goBackToWeeks} className="hover:text-foreground transition-colors">
                    {format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}
                  </button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-medium">
                    Week of {format(parseISO(activeWeek), "MMM d")}
                  </span>
                </>
              ) : (
                <span className="text-foreground font-medium">{format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}</span>
              )}
            </>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedMonth && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={activeWeek ? goBackToWeeks : goBackToMonths}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {!selectedMonth
                  ? "Lesson Plan Review"
                  : activeWeek
                    ? `Week of ${format(parseISO(activeWeek), "MMM d, yyyy")}`
                    : format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}
              </h1>
              <p className="text-muted-foreground">
                {!selectedMonth
                  ? "Monitor and review lesson plans across all teachers"
                  : activeWeek
                    ? `${weekPlans.length} lesson plans this week`
                    : "Select a week to view lesson plans"}
              </p>
            </div>
          </div>
        </div>

        {/* ==================== LEVEL 1: Monthly Cards ==================== */}
        {!selectedMonth && (
          <>
            {hasAccessibleBranches && !isLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard label="Total Plans" value={globalStats.total} icon={BookOpen} color="text-primary" />
                <SummaryCard label="Drafts" value={globalStats.drafts} icon={FileText} color="text-muted-foreground" />
                <SummaryCard label="Ready for Review" value={globalStats.readyForReview} icon={Clock} color="text-amber-600" />
                <SummaryCard label="Approved" value={globalStats.approved} icon={CheckCircle2} color="text-emerald-600" />
              </div>
            )}
            {!hasAccessibleBranches ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No branch access found</h3>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : monthlyGroups.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No lesson plans yet</h3>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthlyGroups.map(([monthKey, monthItems]) => {
                  const mStats = getGroupStats(monthItems);
                  const classSummary = getClassSummary(monthItems);
                  return (
                    <Card key={monthKey} className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all" onClick={() => goToMonth(monthKey)}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-primary/10"><CalendarDays className="h-5 w-5 text-primary" /></div>
                            <div>
                              <h3 className="font-semibold">{format(parseISO(monthKey + "-01"), "MMMM yyyy")}</h3>
                              <p className="text-xs text-muted-foreground">{mStats.total} lesson plans</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {mStats.drafts > 0 && <Badge variant="secondary" className="text-xs">{mStats.drafts} Draft</Badge>}
                          {mStats.readyForReview > 0 && <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" variant="outline">{mStats.readyForReview} Pending</Badge>}
                          {mStats.approved > 0 && <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300" variant="outline">{mStats.approved} Approved</Badge>}
                        </div>
                        <div className="space-y-1.5 border-t pt-3">
                          {classSummary.slice(0, 4).map((c) => {
                            const expected = expectedSubjectsByClass.get(c.classId)?.size || 0;
                            return (
                              <div key={c.classId} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground truncate max-w-[60%]">{c.name}</span>
                                <span className="font-medium">
                                  {c.planCount} plan{c.planCount !== 1 ? "s" : ""}
                                  {expected > 0 && <span className="text-muted-foreground"> / {expected} subj</span>}
                                </span>
                              </div>
                            );
                          })}
                          {classSummary.length > 4 && <p className="text-xs text-muted-foreground">+{classSummary.length - 4} more classes</p>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ==================== LEVEL 2: Weekly Cards ==================== */}
        {selectedMonth && !activeWeek && (
          <>
            {weeklyGroups.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No plans this month</h3>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {weeklyGroups.map(([weekStart, weekItems]) => {
                  const ws = parseISO(weekStart);
                  const we = endOfWeek(ws, { weekStartsOn: 1 });
                  const wStats = getGroupStats(weekItems);
                  const isCurrentWeek = isSameWeek(new Date(), ws, { weekStartsOn: 1 });
                  const classSummary = getClassSummary(weekItems);
                  return (
                    <Card
                      key={weekStart}
                      className={`cursor-pointer hover:shadow-md transition-all ${isCurrentWeek ? "border-primary ring-1 ring-primary/20" : "hover:border-primary/30"}`}
                      onClick={() => goToWeek(weekStart)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${isCurrentWeek ? "bg-primary/20" : "bg-muted"}`}>
                              <Calendar className={`h-5 w-5 ${isCurrentWeek ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <h3 className="font-semibold flex items-center gap-2">
                                {format(ws, "MMM d")} – {format(we, "MMM d")}
                                {isCurrentWeek && <Badge className="text-[10px] px-1.5 py-0">This Week</Badge>}
                              </h3>
                              <p className="text-xs text-muted-foreground">{wStats.total} lesson plans</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {wStats.drafts > 0 && <Badge variant="secondary" className="text-xs">{wStats.drafts} Draft</Badge>}
                          {wStats.readyForReview > 0 && <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" variant="outline">{wStats.readyForReview} Pending</Badge>}
                          {wStats.approved > 0 && <Badge className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300" variant="outline">{wStats.approved} Approved</Badge>}
                        </div>
                        <div className="space-y-1 border-t pt-2">
                          {classSummary.slice(0, 3).map((c) => (
                            <div key={c.classId} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground truncate max-w-[55%]">{c.name}</span>
                              <span className="font-medium text-xs">{c.planCount} plan{c.planCount !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                          {classSummary.length > 3 && <p className="text-xs text-muted-foreground">+{classSummary.length - 3} more</p>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ==================== LEVEL 3: Class → Subject View ==================== */}
        {showWeekView && (
          <>
            {/* Week selector pills */}
            {weeklyGroups.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weeklyGroups.map(([wk]) => {
                  const ws = parseISO(wk);
                  const we = endOfWeek(ws, { weekStartsOn: 1 });
                  const isActive = wk === activeWeek;
                  return (
                    <Button
                      key={wk}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="whitespace-nowrap text-xs"
                      onClick={() => { setSelectedWeek(wk); resetFilters(); }}
                    >
                      {format(ws, "MMM d")} – {format(we, "d")}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <FilterSelect label="Class" value={selectedClass} onChange={setSelectedClass}
                    options={[{ value: "all", label: "All Classes" }, ...classes.map((c: any) => ({ value: c.id, label: c.class_name }))]} />
                  <FilterSelect label="Teacher" value={selectedTeacher} onChange={setSelectedTeacher}
                    options={[{ value: "all", label: "All Teachers" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} />
                  <FilterSelect label="Subject" value={selectedSubject} onChange={setSelectedSubject}
                    options={[{ value: "all", label: "All Subjects" }, ...weekSubjects.map((s) => ({ value: s, label: s }))]} />
                  <FilterSelect label="Review Status" value={reviewFilter} onChange={setReviewFilter}
                    options={[
                      { value: "all", label: "All" },
                      { value: "draft", label: "Draft" },
                      { value: "ready_for_review", label: "Ready for Review" },
                      { value: "approved", label: "Approved" },
                      { value: "returned_for_revision", label: "Needs Revision" },
                    ]} />
                  <div>
                    <Label className="text-xs">Search</Label>
                    <Input placeholder="Title or theme..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-9" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Week summary */}
            {(() => {
              const wStats = getGroupStats(weekPlans);
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryCard label="This Week" value={wStats.total} icon={BookOpen} color="text-primary" />
                  <SummaryCard label="Drafts" value={wStats.drafts} icon={FileText} color="text-muted-foreground" />
                  <SummaryCard label="Pending Review" value={wStats.readyForReview} icon={Clock} color="text-amber-600" />
                  <SummaryCard label="Approved" value={wStats.approved} icon={CheckCircle2} color="text-emerald-600" />
                </div>
              );
            })()}

            {/* Class → Subject grouped cards */}
            {weekPlans.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No plans found</h3>
                  <p className="text-muted-foreground">No plans match your filters for this week</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                {classSubjectGrouped.map(({ classId, className, subjects, totalPlans }) => {
                  const expected = expectedSubjectsByClass.get(classId)?.size || 0;
                  return (
                    <Card key={classId}>
                      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold">{className}</h3>
                          <Badge variant="secondary" className="text-xs">{totalPlans} plan{totalPlans !== 1 ? "s" : ""}</Badge>
                        </div>
                        {expected > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {subjects.length} / {expected} subjects covered
                          </span>
                        )}
                      </div>
                      <div className="divide-y">
                        {subjects.map(([subjectName, subjectPlans]) => (
                          <div key={subjectName} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                              <h4 className="font-medium text-sm">{subjectName}</h4>
                              <Badge variant="outline" className="text-[10px]">{subjectPlans.length}</Badge>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Title / Theme</TableHead>
                                  <TableHead className="text-xs">Teacher</TableHead>
                                  <TableHead className="text-xs">Review</TableHead>
                                  <TableHead className="text-xs">Completeness</TableHead>
                                  <TableHead className="text-xs w-[80px]">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {subjectPlans.map((plan: any) => {
                                  const reviewStatus = (plan.review_status || "draft") as ReviewStatus;
                                  const config = reviewStatusConfig[reviewStatus] || reviewStatusConfig.draft;
                                  const StatusIcon = config.icon;
                                  const teacherName = plan.profiles ? `${plan.profiles.first_name || ""} ${plan.profiles.last_name || ""}`.trim() : "—";
                                  return (
                                    <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPlan(plan)}>
                                      <TableCell>
                                        <p className="font-medium text-sm truncate max-w-[180px]">{plan.title}</p>
                                        {plan.theme && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{plan.theme}</p>}
                                      </TableCell>
                                      <TableCell className="text-sm">{teacherName}</TableCell>
                                      <TableCell>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                                          <StatusIcon className="h-3 w-3" />{config.label}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2 min-w-[80px]">
                                          <Progress value={plan.completeness_score} className="h-2 flex-1" />
                                          <span className="text-xs font-medium w-8 text-right">{plan.completeness_score}%</span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/curriculum/lessons/${plan.id}`)}>
                                            <Eye className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(plan)}>
                                            <Copy className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => handleArchive(plan.id)}>
                                            <Archive className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Review Drawer */}
        <Sheet open={!!selectedPlan} onOpenChange={(open) => { if (!open) { setSelectedPlan(null); setReviewComments(""); } }}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            {selectedPlan && (
              <div className="space-y-5">
                <SheetHeader>
                  <SheetTitle className="text-lg">{selectedPlan.title}</SheetTitle>
                  <p className="text-sm text-muted-foreground">{selectedPlan.theme} • Age {selectedPlan.age_group}</p>
                </SheetHeader>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Review Status</Label>
                  {(() => {
                    const rs = (selectedPlan.review_status || "draft") as ReviewStatus;
                    const cfg = reviewStatusConfig[rs] || reviewStatusConfig.draft;
                    const Icon = cfg.icon;
                    return (
                      <div className={`mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${cfg.color}`}>
                        <Icon className="h-4 w-4" /> {cfg.label}
                      </div>
                    );
                  })()}
                </div>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Completeness</Label>
                    <span className="text-sm font-bold">{selectedPlan.completeness_score}%</span>
                  </div>
                  <Progress value={selectedPlan.completeness_score} className="h-2.5 mb-3" />
                  <div className="space-y-1.5">
                    {selectedPlan.completeness_breakdown?.map((item: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {item.met ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />}
                        <span className={item.met ? "" : "text-muted-foreground"}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Plan Details</Label>
                  <DetailRow label="Teacher" value={selectedPlan.profiles ? `${selectedPlan.profiles.first_name || ""} ${selectedPlan.profiles.last_name || ""}`.trim() : "—"} />
                  <DetailRow label="Class" value={selectedPlan.classes?.class_name || "—"} />
                  <DetailRow label="Duration" value={selectedPlan.duration} />
                  <DetailRow label="Mode" value={selectedPlan.plan_mode} />
                  <DetailRow label="Start Date" value={selectedPlan.start_date ? format(new Date(selectedPlan.start_date), "MMM d, yyyy") : "—"} />
                  <DetailRow label="Observation Targets" value={hasContent(selectedPlan.observation_targets_json) ? "Yes" : "Not set"} />
                  <DetailRow label="Parent Story" value={selectedPlan.parent_story_prompt?.trim() ? "Yes" : "Not set"} />
                </div>
                <Separator />
                {reviewHistory.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Review History</Label>
                    <div className="space-y-2">
                      {reviewHistory.map((r: any) => (
                        <div key={r.id} className="bg-muted/50 rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{r.action === "approved" ? "✅ Approved" : "↩️ Returned"}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, h:mm a")}</span>
                          </div>
                          <p className="text-muted-foreground text-xs mt-0.5">by {r.profiles?.first_name} {r.profiles?.last_name}</p>
                          {r.comments && <p className="mt-1 text-sm">{r.comments}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="space-y-3">
                  {selectedPlan.review_status === "ready_for_review" ? (
                    <>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Review Actions</Label>
                      <Textarea placeholder="Add review comments (optional)..." value={reviewComments} onChange={e => setReviewComments(e.target.value)} rows={3} />
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={() => handleReviewAction("approved")} disabled={reviewLoading}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleReviewAction("returned_for_revision")} disabled={reviewLoading}>
                          <XCircle className="h-4 w-4 mr-1" /> Return
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Status: <Badge variant="outline">{selectedPlan.review_status}</Badge>
                    </p>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/curriculum/lessons/${selectedPlan.id}`)}>
                    <Eye className="h-4 w-4 mr-1" /> View Full Plan
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}

// === Helper functions ===

function extractSubject(title: string): string {
  if (!title) return "Other";
  // "Phonics — Week of 2026-04..." → "Phonics"
  const parts = title.split(/\s*[—–-]\s*Week\s/i);
  if (parts.length > 1) return parts[0].trim();
  const dashParts = title.split(/\s*[—–]\s*/);
  if (dashParts.length > 1) return dashParts[0].trim();
  return title.split(" ").slice(0, 2).join(" ");
}

function getGroupStats(items: any[]) {
  return {
    total: items.length,
    drafts: items.filter((p: any) => (p.review_status || "draft") === "draft").length,
    readyForReview: items.filter((p: any) => p.review_status === "ready_for_review").length,
    approved: items.filter((p: any) => p.review_status === "approved").length,
    needsRevision: items.filter((p: any) => p.review_status === "returned_for_revision").length,
  };
}

function getClassSummary(items: any[]) {
  const map = new Map<string, { name: string; planCount: number; classId: string }>();
  items.forEach((p: any) => {
    const cid = p.class_id || "unassigned";
    if (!map.has(cid)) map.set(cid, { name: p.classes?.class_name || "Unassigned", planCount: 0, classId: cid });
    map.get(cid)!.planCount++;
  });
  return Array.from(map.values());
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function hasContent(json: any): boolean {
  if (!json) return false;
  if (Array.isArray(json)) return json.length > 0;
  if (typeof json === "object") return Object.keys(json).length > 0;
  return false;
}
