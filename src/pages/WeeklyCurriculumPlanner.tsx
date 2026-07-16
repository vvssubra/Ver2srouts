import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Loader2, CalendarRange, Save, Trash2, Plus, X, GraduationCap, BookOpen, ArrowRight, Sparkles, Target, Send, CheckCircle2, RotateCcw } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import WeeklyObjectiveMapper from "@/components/academic/WeeklyObjectiveMapper";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

function DynamicStringList({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {items.length === 0 && <p className="text-sm text-muted-foreground italic">No items yet.</p>}
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input value={item} onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }} placeholder={placeholder || `Item ${i + 1}`} />
          <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

const parseArraySafe = (val: any): string[] => {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
  }
  return [];
};

const REVIEW_STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Pending Approval", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  returned: { label: "Returned", variant: "destructive" },
};

export default function WeeklyCurriculumPlanner() {
  const { user, role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = role === "super_admin" || role === "franchisee" || role === "admin";

  const urlMonthPlanId = searchParams.get("monthPlanId") || "";
  const urlAgeGroup = searchParams.get("ageGroup") || "";
  const [selectedMonthPlanId, setSelectedMonthPlanId] = useState(urlMonthPlanId);
  const [selectedWeek, setSelectedWeek] = useState("1");

  // Form
  const [title, setTitle] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [description, setDescription] = useState("");
  const [keyQuestions, setKeyQuestions] = useState<string[]>([]);
  const [observationFocus, setObservationFocus] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [pendingObjectives, setPendingObjectives] = useState<any[]>([]);

  useEffect(() => {
    if (urlMonthPlanId) setSelectedMonthPlanId(urlMonthPlanId);
  }, [urlMonthPlanId]);

  const weekNum = parseInt(selectedWeek);

  const { data: monthPlans = [] } = useQuery({
    queryKey: ["all-curriculum-month-plans", selectedBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_month_plans")
        .select("*, curriculum_year_plans(title, age_groups(code, label), academic_years(year_name))")
        .eq("branch_id", selectedBranchId!)
        .order("month_number");
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId,
  });

  const activeMonthPlan = monthPlans.find((mp: any) => mp.id === selectedMonthPlanId);
  const ageGroupLabel = activeMonthPlan?.curriculum_year_plans?.age_groups?.label || urlAgeGroup || "";
  const monthTheme = activeMonthPlan?.theme || "";

  const { data: themeBankTheme } = useQuery({
    queryKey: ["theme-bank-for-weekly", activeMonthPlan?.month_number],
    queryFn: async () => {
      const { data } = await supabase.from("theme_bank").select("*, theme_weekly_focuses(*)").eq("month_number", activeMonthPlan!.month_number).maybeSingle();
      return data as any;
    },
    enabled: !!activeMonthPlan?.month_number,
  });

  const weeklyFocuses = (themeBankTheme?.theme_weekly_focuses || []) as any[];
  const currentWeekFocus = weeklyFocuses.find((wf: any) => wf.week_number === weekNum);

  const resetForm = () => {
    setTitle(""); setFocusArea(""); setDescription(""); setKeyQuestions([]); setObservationFocus([]); setNotes("");
  };

  const { data: existingWeekPlan, isLoading: weekLoading } = useQuery({
    queryKey: ["curriculum-week-plan", selectedMonthPlanId, weekNum],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_week_plans")
        .select("*")
        .eq("month_plan_id", selectedMonthPlanId)
        .eq("week_number", weekNum)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setTitle(d.title || d.focus_area || "");
        setFocusArea(d.focus_area || "");
        setDescription(d.description || "");
        setKeyQuestions(parseArraySafe(d.key_questions));
        setObservationFocus(parseArraySafe(d.observation_focus));
        setNotes(d.notes || "");
      } else {
        resetForm();
        if (currentWeekFocus) {
          setTitle(currentWeekFocus.focus_title || "");
          setFocusArea(currentWeekFocus.focus_title || "");
          setKeyQuestions(parseArraySafe(currentWeekFocus.key_questions));
        }
      }
      return data;
    },
    enabled: !!selectedMonthPlanId,
  });

  const { data: allWeekPlans = [] } = useQuery({
    queryKey: ["all-week-plans", selectedMonthPlanId],
    queryFn: async () => {
      const { data } = await supabase.from("curriculum_week_plans").select("id, week_number, title, focus_area, status, review_status")
        .eq("month_plan_id", selectedMonthPlanId).order("week_number");
      return (data as any[]) ?? [];
    },
    enabled: !!selectedMonthPlanId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMonthPlanId || !selectedBranchId) throw new Error("Missing data");
      const payload: any = {
        month_plan_id: selectedMonthPlanId,
        branch_id: selectedBranchId,
        week_number: weekNum,
        title,
        focus_area: focusArea || title,
        description,
        key_questions: keyQuestions,
        observation_focus: observationFocus,
        notes,
        status: (existingWeekPlan as any)?.status || "draft",
      };
      if (existingWeekPlan) {
        const { error } = await supabase.from("curriculum_week_plans").update(payload).eq("id", (existingWeekPlan as any).id);
        if (error) throw error;
        return (existingWeekPlan as any).id;
      } else {
        payload.review_status = "draft";
        const { data: newPlan, error } = await supabase.from("curriculum_week_plans").insert(payload).select("id").single();
        if (error) throw error;
        return (newPlan as any).id;
      }
    },
    onSuccess: async (newPlanId: string) => {
      // Persist any pending objectives from AI brainstorm
      if (pendingObjectives.length > 0 && newPlanId) {
        try {
          const codes = pendingObjectives.map((po: any) => po.code).filter(Boolean);
          if (codes.length > 0) {
            const { data: matchedObjs } = await supabase
              .from("lesson_objectives")
              .select("id, code")
              .eq("is_active", true)
              .in("code", codes);
            const codeToId = new Map((matchedObjs ?? []).map((o: any) => [o.code, o.id]));
            const toLink = pendingObjectives
              .map((po: any) => ({
                week_plan_id: newPlanId,
                lesson_objective_id: codeToId.get(po.code),
                priority: po.priority || "primary",
              }))
              .filter((row: any) => row.lesson_objective_id);
            if (toLink.length > 0) {
              await supabase.from("weekly_focus_objectives").insert(toLink);
            }
          }
          setPendingObjectives([]);
        } catch (linkErr) {
          console.error("Auto-link pending objectives error:", linkErr);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-focus-objectives"] });
      toast({ title: "Weekly plan saved! ✅" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!existingWeekPlan) throw new Error("Save the plan first");
      const { error } = await supabase.from("curriculum_week_plans").update({
        review_status: "submitted",
        submitted_by: user?.id,
        submitted_at: new Date().toISOString(),
      } as any).eq("id", (existingWeekPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      toast({ title: "Plan submitted for review! 📤" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!existingWeekPlan) return;
      const { error } = await supabase.from("curriculum_week_plans").update({
        status: "active",
        review_status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", (existingWeekPlan as any).id);
      if (error) throw error;
      const ewp = existingWeekPlan as any;
      if (ewp.submitted_by && ewp.submitted_by !== user?.id) {
        await supabase.from("notifications").insert({
          user_id: ewp.submitted_by,
          title: "Weekly Plan Approved ✅",
          message: `Your Week ${weekNum} plan has been approved.`,
          type: "general",
          action_url: `/curriculum/weekly?monthPlanId=${selectedMonthPlanId}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      toast({ title: "Plan approved and activated! ✅" });
    },
  });

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!existingWeekPlan) return;
      const { error } = await supabase.from("curriculum_week_plans").update({
        review_status: "returned",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes,
      } as any).eq("id", (existingWeekPlan as any).id);
      if (error) throw error;
      const ewp = existingWeekPlan as any;
      if (ewp.submitted_by && ewp.submitted_by !== user?.id) {
        await supabase.from("notifications").insert({
          user_id: ewp.submitted_by,
          title: "Weekly Plan Returned 🔄",
          message: `Your Week ${weekNum} plan needs revision. ${reviewNotes ? `Notes: ${reviewNotes}` : ""}`,
          type: "general",
          action_url: `/curriculum/weekly?monthPlanId=${selectedMonthPlanId}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      setReviewNotes("");
      toast({ title: "Plan returned for revision" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!existingWeekPlan) return;
      const { error } = await supabase.from("curriculum_week_plans").update({
        status: "active",
        review_status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", (existingWeekPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      toast({ title: "Plan activated! ✅" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingWeekPlan) return;
      const { error } = await supabase.from("curriculum_week_plans").delete().eq("id", (existingWeekPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-week-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-week-plans"] });
      resetForm();
      toast({ title: "Weekly plan deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const ewp = existingWeekPlan as any;
  const weeklyStatus = ewp?.status || "draft";
  const reviewStatus = ewp?.review_status || "draft";
  const isEditable = reviewStatus === "draft" || reviewStatus === "returned";
  const isPendingReview = reviewStatus === "submitted";
  const reviewInfo = REVIEW_STATUS_LABELS[reviewStatus] || REVIEW_STATUS_LABELS.draft;

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="planning" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-primary" />
            Weekly Focus Planner
          </h1>
          <p className="text-muted-foreground">
            Plan weekly focus, key questions, and observation targets linked to your monthly curriculum plan.
          </p>
        </div>

        {/* Selectors */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label>Monthly Curriculum Plan</Label>
              <Select value={selectedMonthPlanId} onValueChange={(v) => {
                setSelectedMonthPlanId(v);
                setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("monthPlanId", v); return n; }, { replace: true });
              }}>
                <SelectTrigger><SelectValue placeholder="Select a monthly plan" /></SelectTrigger>
                <SelectContent>
                  {monthPlans.map((mp: any) => (
                    <SelectItem key={mp.id} value={mp.id}>
                      {MONTHS[mp.month_number - 1]} — {mp.theme || "No theme"} ({mp.curriculum_year_plans?.age_groups?.label || ""})
                      {mp.status !== "draft" && ` [${mp.status}]`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Age group + plan context badges */}
        {activeMonthPlan && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="default" className="text-sm px-3 py-1">
              <GraduationCap className="h-3 w-3 mr-1" />
              {ageGroupLabel}
            </Badge>
            <Badge variant="outline" className="text-sm">
              {activeMonthPlan.curriculum_year_plans?.academic_years?.year_name || ""}
            </Badge>
            <Badge variant="secondary" className="text-sm">
              Theme: {monthTheme}
            </Badge>
            {activeMonthPlan.big_idea && (
              <span className="text-xs text-muted-foreground italic">"{activeMonthPlan.big_idea}"</span>
            )}
          </div>
        )}

        {/* No month plan */}
        {!selectedMonthPlanId && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Select a Monthly Plan</p>
              <p className="text-muted-foreground mb-4">Choose a monthly plan above, or create one in the Monthly Planner first.</p>
              <Button variant="outline" onClick={() => navigate("/curriculum/monthly")}>
                Go to Monthly Planner
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Theme bank focus info */}
        {currentWeekFocus && selectedMonthPlanId && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Theme Bank Week {weekNum}: {currentWeekFocus.focus_title}</span>
                <Badge variant="outline" className="text-xs">Pre-populated</Badge>
              </div>
              {currentWeekFocus.key_questions?.length > 0 && (
                <div className="space-y-0.5 mt-1">
                  {(currentWeekFocus.key_questions as string[]).map((q: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">❓ {q}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Week tabs */}
        {selectedMonthPlanId && (
          <Tabs value={selectedWeek} onValueChange={setSelectedWeek}>
            <TabsList>
              {[1, 2, 3, 4, 5].map((w) => {
                const wp = allWeekPlans.find((p: any) => p.week_number === w);
                const wf = weeklyFocuses.find((f: any) => f.week_number === w);
                return (
                  <TabsTrigger key={w} value={String(w)} className="text-xs">
                    W{w}{wp ? " ✓" : ""}{wf ? ` ${wf.focus_title.substring(0, 12)}${wf.focus_title.length > 12 ? "…" : ""}` : ""}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        {/* Form */}
        {selectedMonthPlanId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Week {weekNum} Plan</CardTitle>
                <div className="flex items-center gap-2">
                  {existingWeekPlan && (
                    <>
                      <Badge variant={reviewInfo.variant} className="capitalize">{reviewInfo.label}</Badge>
                      {weeklyStatus === "active" && (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate()}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {/* Return notes banner */}
              {reviewStatus === "returned" && ewp?.review_notes && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mt-2">
                  <p className="text-sm font-medium text-destructive">Reviewer Notes:</p>
                  <p className="text-sm text-muted-foreground">{ewp.review_notes}</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {weekLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Weekly Title</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Exploring Rooms in My Home" disabled={!isEditable && !isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Focus Area</Label>
                      <Input value={focusArea} onChange={(e) => setFocusArea(e.target.value)} placeholder="What this week emphasizes..." disabled={!isEditable && !isAdmin} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description of this week's learning focus..." rows={3} disabled={!isEditable && !isAdmin} />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <DynamicStringList label="❓ Key Questions" items={keyQuestions} onChange={setKeyQuestions} placeholder="e.g. What rooms does your home have?" />
                    <DynamicStringList label="🔍 Observation Focus" items={observationFocus} onChange={setObservationFocus} placeholder="e.g. Can the child identify rooms by name?" />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..." rows={2} />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-2 flex-wrap">
                      {(isEditable || isAdmin) && (
                        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                          <Save className="h-4 w-4 mr-2" />
                          {saveMutation.isPending ? "Saving..." : "Save Draft"}
                        </Button>
                      )}

                      {!isAdmin && existingWeekPlan && isEditable && (
                        <Button variant="secondary" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                          <Send className="h-4 w-4 mr-2" />
                          Submit for Review
                        </Button>
                      )}

                      {isAdmin && existingWeekPlan && weeklyStatus !== "active" && (
                        <Button variant="secondary" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
                      )}

                      {isAdmin && isPendingReview && (
                        <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      )}

                      {isAdmin && isPendingReview && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline">
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Return
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-3">
                              <Label>Feedback Notes</Label>
                              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="What needs to be changed..." rows={3} />
                              <Button size="sm" onClick={() => returnMutation.mutate()} disabled={returnMutation.isPending}>
                                Confirm Return
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}

                      {!isAdmin && isPendingReview && (
                        <Badge variant="outline" className="text-sm py-1.5">⏳ Awaiting Approval</Badge>
                      )}

                      <Button variant="outline" onClick={async () => {
                        if (!activeMonthPlan) return;
                        toast({ title: "🧠 AI is brainstorming..." });
                        try {
                          const { data, error } = await supabase.functions.invoke("generate-weekly-plan", {
                            body: {
                              month_name: MONTHS[activeMonthPlan.month_number - 1],
                              week_number: weekNum, age_group: ageGroupLabel,
                              theme_name: monthTheme, big_idea: activeMonthPlan.big_idea || "",
                              monthly_objectives: [], weekly_focus_title: currentWeekFocus?.focus_title || title,
                              weekly_focus_questions: currentWeekFocus?.key_questions || keyQuestions,
                              branch_id: selectedBranchId,
                              month_plan_id: selectedMonthPlanId,
                            },
                          });
                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);
                          if (data?.focus_title) setTitle(data.focus_title);
                          if (data?.focus_title) setFocusArea(data.focus_title);
                          if (data?.focus_questions) setKeyQuestions(data.focus_questions);
                          if (data?.observation_focus) setObservationFocus(data.observation_focus);
                          if (data?.weekly_objectives) setDescription(data.weekly_objectives.join("\n• "));

                          // Smart auto-link: use AI-selected objectives with priorities
                          if (data?.selected_objectives?.length > 0) {
                            if (existingWeekPlan) {
                              try {
                                const selectedCodes = (data.selected_objectives as any[]).map((so: any) => so.code).filter(Boolean);
                                if (selectedCodes.length > 0) {
                                  const { data: matchedObjectives } = await supabase
                                    .from("lesson_objectives").select("id, code").eq("is_active", true).in("code", selectedCodes);
                                  const codeToId = new Map((matchedObjectives ?? []).map((o: any) => [o.code, o.id]));
                                  const { data: existing } = await supabase
                                    .from("weekly_focus_objectives").select("lesson_objective_id").eq("week_plan_id", (existingWeekPlan as any).id);
                                  const existingIds = new Set((existing ?? []).map((e: any) => e.lesson_objective_id));
                                  const toLink = (data.selected_objectives as any[])
                                    .map((so: any) => ({
                                      week_plan_id: (existingWeekPlan as any).id,
                                      lesson_objective_id: codeToId.get(so.code),
                                      priority: so.priority || "primary",
                                    }))
                                    .filter((row: any) => row.lesson_objective_id && !existingIds.has(row.lesson_objective_id));
                                  if (toLink.length > 0) {
                                    await supabase.from("weekly_focus_objectives").insert(toLink);
                                    queryClient.invalidateQueries({ queryKey: ["weekly-focus-objectives", (existingWeekPlan as any).id] });
                                  }
                                }
                              } catch (linkErr) {
                                console.error("Auto-link objectives error:", linkErr);
                              }
                            } else {
                              setPendingObjectives(data.selected_objectives);
                            }
                          }

                          toast({ title: "AI suggestions applied! Review and save. ✨" });
                        } catch (e: any) {
                          toast({ title: "AI Error", description: e.message, variant: "destructive" });
                        }
                      }}>
                        <Sparkles className="h-4 w-4 mr-2" /> AI Brainstorm
                      </Button>
                    </div>

                    {existingWeekPlan && (
                      <Button variant="outline" className="gap-1" onClick={() => {
                        const params = new URLSearchParams();
                        if (selectedMonthPlanId) params.set("monthPlanId", selectedMonthPlanId);
                        if ((existingWeekPlan as any).id) params.set("weekPlanId", (existingWeekPlan as any).id);
                        if (monthTheme) params.set("theme", monthTheme);
                        if (ageGroupLabel) params.set("ageGroup", ageGroupLabel);
                        const today = new Date();
                        const day = today.getDay();
                        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                        const monday = new Date(today.setDate(diff));
                        const weekStart = monday.toISOString().split("T")[0];
                        params.set("weekStart", weekStart);
                        navigate(`/lesson-planner?${params.toString()}`);
                      }}>
                        Lesson Plans <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {/* Suggested Objectives Section — show even before save in preview mode */}
                  <WeeklyObjectiveMapper
                    weekPlanId={existingWeekPlan ? (existingWeekPlan as any).id : undefined}
                    ageGroupLabel={ageGroupLabel}
                    monthPlanId={selectedMonthPlanId}
                    previewMode={!existingWeekPlan}
                    pendingObjectives={pendingObjectives}
                    onPendingChange={setPendingObjectives}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
