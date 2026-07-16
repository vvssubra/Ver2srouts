import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, Star, Users, TrendingUp, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const ratingLabels = ["", "Poor", "Below Average", "Average", "Good", "Excellent"];
const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-info/10 text-info",
  acknowledged: "bg-success/10 text-success",
};

export default function StaffPerformance() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/staff-performance");
  const canManage = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [detailReview, setDetailReview] = useState<any>(null);

  // Form state
  const [formStaff, setFormStaff] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formRating, setFormRating] = useState("3");
  const [formStrengths, setFormStrengths] = useState("");
  const [formImprovements, setFormImprovements] = useState("");
  const [formGoals, setFormGoals] = useState("");
  const [kpis, setKpis] = useState([{ name: "", target: "", actual: "", score: "3", weight: "1" }]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-perf"],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data } = await supabase.from("branches").select("id, name").order("name");
        return data ?? [];
      }
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(id, name)").eq("user_id", user!.id);
      return data?.map((m: any) => m.branches).filter(Boolean) ?? [];
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;

  const { data: staffList = [] } = useQuery({
    queryKey: ["branch-staff-perf", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .eq("branch_id", branchId);
      const userIds = [...new Set((data ?? []).map((m: any) => m.user_id))];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds);
      return profiles ?? [];
    },
    enabled: !!branchId && canManage,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["performance-reviews", branchId],
    queryFn: async () => {
      let query = supabase
        .from("performance_reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (branchId && canManage) query = query.eq("branch_id", branchId);
      if (!canManage) query = query.eq("user_id", user!.id);
      const { data } = await query;
      // Split-query pattern for profiles
      const allUserIds = [...new Set((data ?? []).flatMap((r: any) => [r.user_id, r.reviewer_id].filter(Boolean)))];
      const { data: profiles } = allUserIds.length > 0
        ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", allUserIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((r: any) => ({
        ...r,
        profiles: profileMap.get(r.user_id) || null,
        reviewer: profileMap.get(r.reviewer_id) || null,
      }));
    },
    enabled: !!user,
  });

  // Consolidated staff dashboard data
  const { data: staffSummary = [] } = useQuery({
    queryKey: ["staff-summary", branchId],
    queryFn: async () => {
      const threeMonthsAgo = format(subMonths(new Date(), 3), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");

      // Get attendance for last 3 months
      const { data: attendance } = await supabase
        .from("staff_attendance")
        .select("user_id, date")
        .eq("branch_id", branchId)
        .gte("date", threeMonthsAgo)
        .lte("date", today);

      // Get leave for current year
      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("user_id, days, status, leave_type")
        .eq("branch_id", branchId)
        .eq("status", "approved");

      // Get latest reviews
      const { data: latestReviews } = await supabase
        .from("performance_reviews")
        .select("user_id, overall_rating, review_period_end")
        .eq("branch_id", branchId)
        .order("review_period_end", { ascending: false });

      return staffList.map((s: any) => {
        const attendanceDays = attendance?.filter((a: any) => a.user_id === s.id).length ?? 0;
        const totalLeave = leaves?.filter((l: any) => l.user_id === s.id).reduce((sum: number, l: any) => sum + l.days, 0) ?? 0;
        const latestReview = latestReviews?.find((r: any) => r.user_id === s.id);
        return {
          ...s,
          attendanceDays,
          totalLeave,
          latestRating: latestReview?.overall_rating ?? null,
        };
      });
    },
    enabled: !!branchId && canManage && staffList.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: review, error } = await supabase
        .from("performance_reviews")
        .insert({
          user_id: formStaff,
          branch_id: branchId,
          reviewer_id: user!.id,
          review_period_start: formStart,
          review_period_end: formEnd,
          overall_rating: parseInt(formRating),
          strengths: formStrengths,
          improvements: formImprovements,
          goals: formGoals,
          status: "submitted",
        })
        .select()
        .single();
      if (error) throw error;

      // Insert KPIs
      const validKpis = kpis.filter((k) => k.name.trim());
      if (validKpis.length > 0) {
        const { error: kpiError } = await supabase.from("performance_kpis").insert(
          validKpis.map((k) => ({
            review_id: review.id,
            kpi_name: k.name,
            target: k.target,
            actual: k.actual,
            score: parseInt(k.score),
            weight: parseFloat(k.weight),
          }))
        );
        if (kpiError) throw kpiError;
      }

      // Notify staff
      await supabase.from("notifications").insert({
        user_id: formStaff,
        title: "Performance Review Submitted",
        message: "A new performance review has been submitted for you. Please review and acknowledge.",
        type: "performance_review",
        reference_id: review.id,
        action_url: "/staff-performance",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: "Review submitted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setFormStaff(""); setFormStart(""); setFormEnd(""); setFormRating("3");
    setFormStrengths(""); setFormImprovements(""); setFormGoals("");
    setKpis([{ name: "", target: "", actual: "", score: "3", weight: "1" }]);
  }

  function addKpi() {
    setKpis([...kpis, { name: "", target: "", actual: "", score: "3", weight: "1" }]);
  }

  function updateKpi(idx: number, field: string, value: string) {
    const updated = [...kpis];
    (updated[idx] as any)[field] = value;
    setKpis(updated);
  }

  function renderStars(rating: number | null) {
    if (!rating) return <span className="text-muted-foreground text-xs">No review</span>;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={`h-3.5 w-3.5 ${i <= rating ? "fill-warning text-warning" : "text-muted-foreground/30"}`} />
        ))}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff Performance</h1>
            <p className="text-sm text-muted-foreground mt-1">Reviews, KPIs & consolidated staff dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            {canManage && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Review
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue={canManage ? "dashboard" : "reviews"}>
          <TabsList>
            {canManage && <TabsTrigger value="dashboard"><Users className="h-4 w-4 mr-1" />Staff Dashboard</TabsTrigger>}
            <TabsTrigger value="reviews"><Star className="h-4 w-4 mr-1" />Reviews</TabsTrigger>
          </TabsList>

          {canManage && (
            <TabsContent value="dashboard">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Consolidated Staff Overview</CardTitle>
                  <CardDescription>Attendance, leave & performance at a glance (last 3 months)</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {staffSummary.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground text-sm">No staff data available</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead className="text-center">Attendance (3mo)</TableHead>
                          <TableHead className="text-center">Leave Taken</TableHead>
                          <TableHead className="text-center">Latest Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffSummary.map((s: any) => (
                          <TableRow key={s.id}>
                            <TableCell>
                              <p className="font-medium">{s.first_name} {s.last_name}</p>
                              <p className="text-xs text-muted-foreground">{s.email}</p>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{s.attendanceDays}</span>
                              <span className="text-xs text-muted-foreground"> days</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{s.totalLeave}</span>
                              <span className="text-xs text-muted-foreground"> days</span>
                            </TableCell>
                            <TableCell className="text-center">{renderStars(s.latestRating)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="reviews">
            <Card>
              <CardContent className="p-0">
                {reviews.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground text-sm">No performance reviews yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reviewer</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviews.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <p className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(parseISO(r.review_period_start), "MMM yyyy")} — {format(parseISO(r.review_period_end), "MMM yyyy")}
                          </TableCell>
                          <TableCell>{renderStars(r.overall_rating)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.reviewer?.first_name} {r.reviewer?.last_name}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setDetailReview(r)}>View</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Review Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Performance Review</DialogTitle>
            <DialogDescription>Create a performance review with KPI scoring</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Staff Member</Label>
                <Select value={formStaff} onValueChange={setFormStaff}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Overall Rating</Label>
                <Select value={formRating} onValueChange={setFormRating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <SelectItem key={v} value={String(v)}>{v} — {ratingLabels[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Review Period Start</Label>
                <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div>
                <Label>Review Period End</Label>
                <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea value={formStrengths} onChange={(e) => setFormStrengths(e.target.value)} placeholder="Key strengths observed..." />
            </div>
            <div>
              <Label>Areas for Improvement</Label>
              <Textarea value={formImprovements} onChange={(e) => setFormImprovements(e.target.value)} placeholder="Areas to improve..." />
            </div>
            <div>
              <Label>Goals for Next Period</Label>
              <Textarea value={formGoals} onChange={(e) => setFormGoals(e.target.value)} placeholder="Goals and targets..." />
            </div>

            {/* KPIs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>KPI Items</Label>
                <Button size="sm" variant="outline" onClick={addKpi}><Plus className="h-3 w-3 mr-1" /> Add KPI</Button>
              </div>
              <div className="space-y-3">
                {kpis.map((kpi, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-xs">KPI Name</Label>
                      <Input value={kpi.name} onChange={(e) => updateKpi(idx, "name", e.target.value)} placeholder="e.g. Attendance Rate" />
                    </div>
                    <div>
                      <Label className="text-xs">Target</Label>
                      <Input value={kpi.target} onChange={(e) => updateKpi(idx, "target", e.target.value)} placeholder="95%" />
                    </div>
                    <div>
                      <Label className="text-xs">Actual</Label>
                      <Input value={kpi.actual} onChange={(e) => updateKpi(idx, "actual", e.target.value)} placeholder="92%" />
                    </div>
                    <div>
                      <Label className="text-xs">Score (1-5)</Label>
                      <Select value={kpi.score} onValueChange={(v) => updateKpi(idx, "score", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((v) => (
                            <SelectItem key={v} value={String(v)}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Weight</Label>
                      <Input type="number" value={kpi.weight} onChange={(e) => updateKpi(idx, "weight", e.target.value)} placeholder="1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!formStaff || !formStart || !formEnd || createMutation.isPending}>
              {createMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailReview} onOpenChange={() => setDetailReview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Performance Review</DialogTitle>
            <DialogDescription>
              {detailReview?.profiles?.first_name} {detailReview?.profiles?.last_name} — {detailReview ? format(parseISO(detailReview.review_period_start), "MMM yyyy") : ""} to {detailReview ? format(parseISO(detailReview.review_period_end), "MMM yyyy") : ""}
            </DialogDescription>
          </DialogHeader>
          {detailReview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rating:</span>
                {renderStars(detailReview.overall_rating)}
                <span className="text-sm font-medium">({ratingLabels[detailReview.overall_rating]})</span>
              </div>
              {detailReview.strengths && (
                <div><p className="text-sm font-medium mb-1">Strengths</p><p className="text-sm text-muted-foreground">{detailReview.strengths}</p></div>
              )}
              {detailReview.improvements && (
                <div><p className="text-sm font-medium mb-1">Areas for Improvement</p><p className="text-sm text-muted-foreground">{detailReview.improvements}</p></div>
              )}
              {detailReview.goals && (
                <div><p className="text-sm font-medium mb-1">Goals</p><p className="text-sm text-muted-foreground">{detailReview.goals}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
