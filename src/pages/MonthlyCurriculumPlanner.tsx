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
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Loader2, CalendarDays, Save, Sparkles, Trash2, Plus, X, ArrowRight, GraduationCap, BookOpen, Send, CheckCircle2, RotateCcw } from "lucide-react";
import { LinkedItemsPanel } from "@/components/academic/LinkedItemsPanel";
import { cn } from "@/lib/utils";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
      {items.length === 0 && <p className="text-sm text-muted-foreground italic">No items yet. Click "Add" to start.</p>}
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

export default function MonthlyCurriculumPlanner() {
  const { user, role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = role === "super_admin" || role === "franchisee" || role === "admin";

  const urlYearPlanId = searchParams.get("yearPlanId") || "";
  const urlAgeGroup = searchParams.get("ageGroup") || "";
  const [selectedYearPlanId, setSelectedYearPlanId] = useState(urlYearPlanId);
  const [selectedMonth, setSelectedMonth] = useState("");

  // Form state
  const [theme, setTheme] = useState("");
  const [bigIdea, setBigIdea] = useState("");
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  // AI suggestion state
  const [suggestedConcepts, setSuggestedConcepts] = useState<string[]>([]);
  const [suggestedObjectives, setSuggestedObjectives] = useState<string[]>([]);
  const [suggestedBooks, setSuggestedBooks] = useState<string[]>([]);
  const [suggestedSongs, setSuggestedSongs] = useState<string[]>([]);

  useEffect(() => {
    if (urlYearPlanId) setSelectedYearPlanId(urlYearPlanId);
  }, [urlYearPlanId]);

  // Age groups
  const { data: ageGroups = [] } = useQuery({
    queryKey: ["age-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("age_groups").select("*").order("sort_order");
      return (data as any[]) ?? [];
    },
  });

  // Year plans for this branch
  const { data: yearPlans = [] } = useQuery({
    queryKey: ["curriculum-year-plans-all", selectedBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_year_plans")
        .select("*, age_groups(code, label), academic_years(year_name)")
        .eq("branch_id", selectedBranchId!)
        .order("created_at");
      return (data as any[]) ?? [];
    },
    enabled: !!selectedBranchId,
  });

  const activeYearPlan = yearPlans.find((yp: any) => yp.id === selectedYearPlanId);
  const ageGroupLabel = activeYearPlan?.age_groups?.label || urlAgeGroup || "";
  const monthNum = selectedMonth ? parseInt(selectedMonth) : 0;

  // Theme bank for this month
  const { data: themeBankTheme } = useQuery({
    queryKey: ["theme-bank-for-month", monthNum],
    queryFn: async () => {
      const { data } = await supabase.from("theme_bank").select("*, theme_weekly_focuses(*)").eq("month_number", monthNum).maybeSingle();
      return data as any;
    },
    enabled: monthNum > 0,
  });

  // Existing month plan from curriculum_month_plans
  const { data: existingMonthPlan, isLoading: planLoading } = useQuery({
    queryKey: ["curriculum-month-plan", selectedYearPlanId, monthNum],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_month_plans")
        .select("*")
        .eq("year_plan_id", selectedYearPlanId)
        .eq("month_number", monthNum)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setTheme(d.theme || themeBankTheme?.theme_name || "");
        setBigIdea(d.big_idea || "");
        setVocabulary(parseArraySafe(d.vocabulary));
        setConcepts(parseArraySafe(d.concepts));
        setNotes(d.notes || "");
      } else {
        setTheme(themeBankTheme?.theme_name || "");
        setBigIdea(themeBankTheme?.big_idea || "");
        setVocabulary(parseArraySafe(themeBankTheme?.key_vocabulary));
        setConcepts(parseArraySafe(themeBankTheme?.key_concepts));
        setNotes("");
      }
      return data;
    },
    enabled: !!selectedYearPlanId && monthNum > 0,
  });

  // All month plans for this year plan (for overview)
  const { data: allMonthPlans = [] } = useQuery({
    queryKey: ["all-month-plans", selectedYearPlanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_month_plans")
        .select("id, month_number, theme, status, big_idea, review_status")
        .eq("year_plan_id", selectedYearPlanId)
        .order("month_number");
      return (data as any[]) ?? [];
    },
    enabled: !!selectedYearPlanId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYearPlanId || !selectedBranchId || monthNum === 0) throw new Error("Missing data");
      const payload: any = {
        year_plan_id: selectedYearPlanId,
        branch_id: selectedBranchId,
        month_number: monthNum,
        theme,
        theme_bank_id: themeBankTheme?.id || null,
        big_idea: bigIdea,
        vocabulary,
        concepts,
        notes,
        status: (existingMonthPlan as any)?.status || "draft",
      };
      if (existingMonthPlan) {
        const { error } = await supabase.from("curriculum_month_plans").update(payload).eq("id", (existingMonthPlan as any).id);
        if (error) throw error;
      } else {
        payload.review_status = "draft";
        const { error } = await supabase.from("curriculum_month_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      toast({ title: "Monthly plan saved! ✅" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Submit for review (teacher flow)
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!existingMonthPlan) throw new Error("Save the plan first");
      const { error } = await supabase.from("curriculum_month_plans").update({
        review_status: "submitted",
        submitted_by: user?.id,
        submitted_at: new Date().toISOString(),
      } as any).eq("id", (existingMonthPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      toast({ title: "Plan submitted for review! 📤" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Approve (admin flow)
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!existingMonthPlan) return;
      const { error } = await supabase.from("curriculum_month_plans").update({
        status: "active",
        review_status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", (existingMonthPlan as any).id);
      if (error) throw error;
      // Notify submitter
      const ep = existingMonthPlan as any;
      if (ep.submitted_by && ep.submitted_by !== user?.id) {
        await supabase.from("notifications").insert({
          user_id: ep.submitted_by,
          title: "Monthly Plan Approved ✅",
          message: `Your ${MONTHS[monthNum - 1]} monthly plan has been approved.`,
          type: "general",
          action_url: `/curriculum/monthly?yearPlanId=${selectedYearPlanId}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      toast({ title: "Plan approved and activated! ✅" });
    },
  });

  // Return for revision (admin flow)
  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!existingMonthPlan) return;
      const { error } = await supabase.from("curriculum_month_plans").update({
        review_status: "returned",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes,
      } as any).eq("id", (existingMonthPlan as any).id);
      if (error) throw error;
      const ep = existingMonthPlan as any;
      if (ep.submitted_by && ep.submitted_by !== user?.id) {
        await supabase.from("notifications").insert({
          user_id: ep.submitted_by,
          title: "Monthly Plan Returned 🔄",
          message: `Your ${MONTHS[monthNum - 1]} monthly plan needs revision. ${reviewNotes ? `Notes: ${reviewNotes}` : ""}`,
          type: "general",
          action_url: `/curriculum/monthly?yearPlanId=${selectedYearPlanId}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      setReviewNotes("");
      toast({ title: "Plan returned for revision" });
    },
  });

  // Direct activate (admin's own plan)
  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!existingMonthPlan) return;
      const { error } = await supabase.from("curriculum_month_plans").update({
        status: "active",
        review_status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any).eq("id", (existingMonthPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      toast({ title: "Plan activated! ✅" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingMonthPlan) return;
      const { error } = await supabase.from("curriculum_month_plans").delete().eq("id", (existingMonthPlan as any).id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["curriculum-month-plan"] });
      queryClient.invalidateQueries({ queryKey: ["all-month-plans"] });
      setTheme(""); setBigIdea(""); setVocabulary([]); setConcepts([]); setNotes("");
      toast({ title: "Monthly plan deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const ep = existingMonthPlan as any;
  const planStatus = ep?.status || "draft";
  const reviewStatus = ep?.review_status || "draft";
  const canEdit = !!selectedYearPlanId && monthNum > 0;
  const isEditable = reviewStatus === "draft" || reviewStatus === "returned";
  const isPendingReview = reviewStatus === "submitted";
  const reviewInfo = REVIEW_STATUS_LABELS[reviewStatus] || REVIEW_STATUS_LABELS.draft;

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="planning" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Monthly Curriculum Planner
          </h1>
          <p className="text-muted-foreground">
            Plan monthly themes, vocabulary, and concepts linked to your yearly curriculum plan.
          </p>
        </div>

        {/* Selectors */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Curriculum Year Plan</Label>
                <Select value={selectedYearPlanId} onValueChange={(v) => {
                  setSelectedYearPlanId(v);
                  setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("yearPlanId", v); return n; }, { replace: true });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select year plan" /></SelectTrigger>
                  <SelectContent>
                    {yearPlans.map((yp: any) => (
                      <SelectItem key={yp.id} value={yp.id}>
                        {yp.academic_years?.year_name} — {yp.age_groups?.label}
                        {yp.status !== "draft" && ` (${yp.status})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => {
                      const mp = allMonthPlans.find((p: any) => p.month_number === i + 1);
                      return (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m} {mp ? `✓ ${mp.review_status || mp.status}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Age group badge */}
        {activeYearPlan && (
          <div className="flex items-center gap-3">
            <Badge variant="default" className="text-sm px-3 py-1">
              <GraduationCap className="h-3 w-3 mr-1" />
              {ageGroupLabel}
            </Badge>
            <Badge variant="outline" className="text-sm">
              {activeYearPlan.academic_years?.year_name || activeYearPlan.title}
            </Badge>
            <Badge variant={activeYearPlan.status === "active" ? "default" : "secondary"} className="capitalize text-xs">
              Yearly Plan: {activeYearPlan.status}
            </Badge>
          </div>
        )}

        {/* Month overview strip */}
        {selectedYearPlanId && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {MONTHS.map((m, i) => {
              const mp = allMonthPlans.find((p: any) => p.month_number === i + 1);
              const isSelected = selectedMonth === String(i + 1);
              return (
                <Button key={i} size="sm" variant={isSelected ? "default" : mp ? "secondary" : "ghost"}
                  className={cn("text-xs shrink-0", !mp && !isSelected && "text-muted-foreground")}
                  onClick={() => setSelectedMonth(String(i + 1))}
                >
                  {m.substring(0, 3)}
                  {mp && <span className="ml-1 text-[10px]">✓</span>}
                </Button>
              );
            })}
          </div>
        )}

        {/* No year plan selected */}
        {!selectedYearPlanId && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Select a Curriculum Year Plan</p>
              <p className="text-muted-foreground mb-4">Choose a year plan above, or create one in the Yearly Planner first.</p>
              <Button variant="outline" onClick={() => navigate("/yearly-planner?tab=plans")}>
                Go to Yearly Planner
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Theme Bank info */}
        {themeBankTheme && canEdit && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Theme Bank: {themeBankTheme.theme_name}</CardTitle>
                <Badge variant="outline" className="text-xs">Source of Truth</Badge>
              </div>
              {themeBankTheme.big_idea && <CardDescription>"{themeBankTheme.big_idea}"</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(themeBankTheme.theme_weekly_focuses || []).map((wf: any, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">W{wf.week_number}: {wf.focus_title}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form */}
        {canEdit && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>{existingMonthPlan ? "Edit" : "Create"} — {MONTHS[monthNum - 1]} Plan</CardTitle>
                <div className="flex items-center gap-2">
                  {existingMonthPlan && (
                    <>
                      <Badge variant={reviewInfo.variant} className="capitalize">{reviewInfo.label}</Badge>
                      {planStatus === "active" && (
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
              {reviewStatus === "returned" && ep?.review_notes && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mt-2">
                  <p className="text-sm font-medium text-destructive">Reviewer Notes:</p>
                  <p className="text-sm text-muted-foreground">{ep.review_notes}</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {planLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Theme Name</Label>
                      <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. My Family & Home" disabled={!isEditable && !isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Big Idea</Label>
                      <Input value={bigIdea} onChange={(e) => setBigIdea(e.target.value)} placeholder="The central learning idea..." disabled={!isEditable && !isAdmin} />
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <DynamicStringList label="📚 Key Vocabulary" items={vocabulary} onChange={setVocabulary} placeholder="e.g. family, home, sibling" />
                    <DynamicStringList label="💡 Key Concepts" items={concepts} onChange={setConcepts} placeholder="e.g. Families come in different sizes" />
                  </div>

                  {/* AI Concept Suggestions — Pick & Play */}
                  {suggestedConcepts.length > 0 && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <Label className="text-sm font-medium">AI Suggested Concepts — Click to Add</Label>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setConcepts(prev => [...prev, ...suggestedConcepts]);
                            setSuggestedConcepts([]);
                          }}>
                            <Plus className="h-3 w-3 mr-1" /> Add All
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setSuggestedConcepts([])}>
                            <X className="h-3 w-3 mr-1" /> Dismiss
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedConcepts.map((concept, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors py-1.5 px-3"
                            onClick={() => {
                              setConcepts(prev => [...prev, concept]);
                              setSuggestedConcepts(prev => prev.filter((_, idx) => idx !== i));
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> {concept}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Reference Panel — Books, Songs, Objectives */}
                  {(suggestedBooks.length > 0 || suggestedSongs.length > 0 || suggestedObjectives.length > 0) && (
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm font-medium">AI Suggestions (Reference)</Label>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setSuggestedBooks([]); setSuggestedSongs([]); setSuggestedObjectives([]); }}>
                          <X className="h-3 w-3 mr-1" /> Dismiss
                        </Button>
                      </div>
                      {suggestedObjectives.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">🎯 Learning Objectives</p>
                          <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                            {suggestedObjectives.map((o, i) => <li key={i}>{o}</li>)}
                          </ul>
                        </div>
                      )}
                      {suggestedBooks.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">📖 Suggested Books</p>
                          <div className="flex flex-wrap gap-1">
                            {suggestedBooks.map((b, i) => <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>)}
                          </div>
                        </div>
                      )}
                      {suggestedSongs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">🎵 Suggested Songs</p>
                          <div className="flex flex-wrap gap-1">
                            {suggestedSongs.map((s, i) => <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional planning notes..." rows={3} />
                  </div>

                  <Separator />

                  {/* Action buttons - role-based */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-2 flex-wrap">
                      {/* Save always available when editable */}
                      {(isEditable || isAdmin) && (
                        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                          <Save className="h-4 w-4 mr-2" />
                          {saveMutation.isPending ? "Saving..." : "Save Draft"}
                        </Button>
                      )}

                      {/* Teacher: Submit for Review */}
                      {!isAdmin && existingMonthPlan && isEditable && (
                        <Button variant="secondary" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                          <Send className="h-4 w-4 mr-2" />
                          Submit for Review
                        </Button>
                      )}

                      {/* Admin: Direct Activate (own plans or any draft) */}
                      {isAdmin && existingMonthPlan && planStatus !== "active" && (
                        <Button variant="secondary" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
                      )}

                      {/* Admin: Approve submitted plan */}
                      {isAdmin && isPendingReview && (
                        <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                      )}

                      {/* Admin: Return submitted plan */}
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

                      {/* Pending badge for teachers */}
                      {!isAdmin && isPendingReview && (
                        <Badge variant="outline" className="text-sm py-1.5">⏳ Awaiting Approval</Badge>
                      )}

                      <Button variant="outline" onClick={async () => {
                        if (!activeYearPlan || !monthNum) return;
                        toast({ title: "🧠 AI is brainstorming..." });
                        try {
                          const { data, error } = await supabase.functions.invoke("generate-monthly-plan", {
                            body: {
                              month_number: monthNum, month_name: MONTHS[monthNum - 1],
                              age_group: ageGroupLabel, theme_name: theme || themeBankTheme?.theme_name || "",
                              big_idea: bigIdea, weekly_focuses: themeBankTheme?.theme_weekly_focuses || [],
                              theme_vocabulary: vocabulary, theme_concepts: concepts,
                              branch_id: selectedBranchId,
                            },
                          });
                          if (error) throw error;
                          if (data?.error) throw new Error(data.error);
                          if (data?.big_idea) setBigIdea(data.big_idea);
                          if (data?.key_vocabulary?.length) setVocabulary(data.key_vocabulary);
                          if (data?.key_concepts?.length) setSuggestedConcepts(data.key_concepts.filter((c: string) => !concepts.includes(c)));
                          if (data?.objectives?.length) setSuggestedObjectives(data.objectives);
                          if (data?.suggested_books?.length) setSuggestedBooks(data.suggested_books);
                          if (data?.suggested_songs?.length) setSuggestedSongs(data.suggested_songs);
                          toast({ title: "AI suggestions applied! Review vocabulary and pick concepts below. ✨" });
                        } catch (e: any) {
                          toast({ title: "AI Error", description: e.message, variant: "destructive" });
                        }
                      }} disabled={!canEdit}>
                        <Sparkles className="h-4 w-4 mr-2" /> AI Brainstorm
                      </Button>
                    </div>

                    {existingMonthPlan && (
                      <Button variant="outline" className="gap-1" onClick={() => {
                        navigate(`/curriculum/weekly?monthPlanId=${(existingMonthPlan as any).id}&ageGroup=${ageGroupLabel}`);
                      }}>
                        Weekly Plans <ArrowRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Linked Items Panel */}
        {existingMonthPlan && (
          <LinkedItemsPanel
            context="monthly"
            monthPlanId={(existingMonthPlan as any).id}
            yearPlanId={selectedYearPlanId}
            branchId={selectedBranchId || undefined}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
