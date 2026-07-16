import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit, Trash2, BookOpen, Palette, FlaskConical, Blocks, Scissors, Microscope, Theater, ChevronRight, Sparkles, RefreshCw } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

const CENTER_TYPES = [
  { value: "literacy_corner", label: "Literacy Corner", icon: BookOpen, color: "bg-blue-100 dark:bg-blue-950/30 border-blue-200" },
  { value: "numeracy_manipulative", label: "Numeracy & Manipulative", icon: Blocks, color: "bg-green-100 dark:bg-green-950/30 border-green-200" },
  { value: "dramatic_play", label: "Dramatic Play", icon: Theater, color: "bg-pink-100 dark:bg-pink-950/30 border-pink-200" },
  { value: "sensory", label: "Sensory", icon: FlaskConical, color: "bg-yellow-100 dark:bg-yellow-950/30 border-yellow-200" },
  { value: "construction", label: "Construction", icon: Blocks, color: "bg-orange-100 dark:bg-orange-950/30 border-orange-200" },
  { value: "art", label: "Art & Creativity", icon: Palette, color: "bg-purple-100 dark:bg-purple-950/30 border-purple-200" },
  { value: "discovery", label: "Discovery & Science", icon: Microscope, color: "bg-teal-100 dark:bg-teal-950/30 border-teal-200" },
];

export default function LearningCenterPlanner() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState("");
  const [weekStarting, setWeekStarting] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split("T")[0];
  });
  const [editingCenter, setEditingCenter] = useState<any>(null);
  const [showDialog, setShowDialog] = useState(false);

  // Form state for dialog
  const [formCenterType, setFormCenterType] = useState("");
  const [formSetup, setFormSetup] = useState("");
  const [formMaterials, setFormMaterials] = useState("");
  const [formObjectives, setFormObjectives] = useState("");
  const [formObservation, setFormObservation] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, class_name, age_group")
        .eq("branch_id", selectedBranch).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!selectedBranch && selectedBranch !== "all",
  });
  const { teacherClassIds, isTeacher } = useTeacherClasses(selectedBranch);
  const visibleClasses = isTeacher && teacherClassIds && teacherClassIds.length > 0
    ? classes.filter((c: any) => teacherClassIds.includes(c.id))
    : classes;

  const { data: centerPlans = [], isLoading } = useQuery({
    queryKey: ["center-plans", selectedBranch, selectedClass, weekStarting],
    queryFn: async () => {
      const { data } = await supabase.from("learning_center_plans")
        .select("*")
        .eq("branch_id", selectedBranch)
        .eq("class_id", selectedClass)
        .eq("week_starting", weekStarting)
        .order("center_type");
      return data ?? [];
    },
    enabled: !!selectedBranch && selectedBranch !== "all" && !!selectedClass,
  });

  // Fetch the weekly plan context for auto-generation
  const weekDate = new Date(weekStarting);
  const monthNum = weekDate.getMonth() + 1;

  const { data: weeklyContext } = useQuery({
    queryKey: ["weekly-context-for-centers", selectedBranch, selectedClass, monthNum, weekStarting],
    queryFn: async () => {
      // Get monthly plan for this class/month
      const { data: mp } = await supabase
        .from("monthly_curriculum_plans")
        .select("id, theme_bank_id, big_idea, theme_bank(theme_name, theme_weekly_focuses)")
        .eq("branch_id", selectedBranch)
        .eq("class_id", selectedClass)
        .eq("month_number", monthNum)
        .maybeSingle();
      if (!mp) return null;

      // Get weekly plan for this month
      const { data: plans } = await supabase
        .from("weekly_curriculum_plans")
        .select("*")
        .eq("monthly_plan_id", (mp as any).id);

      // Find matching week from theme bank weekly focuses
      const weeklyFocuses = ((mp as any)?.theme_bank?.theme_weekly_focuses || []) as any[];
      
      // Determine which week number this date falls in
      const firstOfMonth = new Date(weekDate.getFullYear(), weekDate.getMonth(), 1);
      const dayOfMonth = weekDate.getDate();
      const weekOfMonth = Math.min(Math.ceil(dayOfMonth / 7), 4);

      const weeklyPlan = (plans || []).find((p: any) => p.week_number === weekOfMonth);
      const themeFocus = weeklyFocuses.find((wf: any) => wf.week_number === weekOfMonth);

      return {
        themeName: (mp as any)?.theme_bank?.theme_name || "",
        bigIdea: (mp as any)?.big_idea || "",
        weeklyFocusTitle: weeklyPlan?.focus_title || themeFocus?.focus_title || "",
        weeklyObjectives: weeklyPlan?.weekly_objectives || [],
        materials: weeklyPlan?.materials || [],
        weekNumber: weekOfMonth,
      };
    },
    enabled: !!selectedBranch && selectedBranch !== "all" && !!selectedClass,
  });

  const selectedClassData = (classes as any[]).find((c: any) => c.id === selectedClass);

  // AI auto-generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!weeklyContext?.themeName) throw new Error("No weekly theme found. Please create a Monthly and Weekly plan first.");

      const { data, error } = await supabase.functions.invoke("generate-learning-centers", {
        body: {
          weeklyTheme: weeklyContext.themeName,
          weeklyFocus: weeklyContext.weeklyFocusTitle,
          weeklyObjectives: weeklyContext.weeklyObjectives,
          materials: weeklyContext.materials,
          ageGroup: selectedClassData?.age_group || "4-5",
          className: selectedClassData?.class_name || "",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.centers as any[];
    },
    onSuccess: async (centers) => {
      // Delete existing center plans for this week/class
      await supabase.from("learning_center_plans")
        .delete()
        .eq("branch_id", selectedBranch)
        .eq("class_id", selectedClass)
        .eq("week_starting", weekStarting);

      // Insert all 7 generated centers
      const rows = centers.map((c: any) => ({
        branch_id: selectedBranch,
        class_id: selectedClass,
        week_starting: weekStarting,
        center_type: c.center_type,
        center_label: c.center_label,
        setup_description: c.setup_description,
        materials_json: c.materials || [],
        learning_objectives_json: c.learning_objectives || [],
        observation_prompts_json: c.observation_prompts || [],
        linked_domains_json: c.linked_domains || [],
        status: "draft",
        created_by: user!.id,
      }));

      const { error } = await supabase.from("learning_center_plans").insert(rows as any);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["center-plans"] });
      toast({ title: "✨ Learning Centers Generated", description: `7 centers created based on theme "${weeklyContext?.themeName}"` });
    },
    onError: (err: any) => toast({ title: "Generation failed", description: err.message, variant: "destructive" }),
  });

  const openCreateDialog = (centerType?: string) => {
    setEditingCenter(null);
    setFormCenterType(centerType || "");
    setFormSetup("");
    setFormMaterials("");
    setFormObjectives("");
    setFormObservation("");
    setShowDialog(true);
  };

  const openEditDialog = (center: any) => {
    setEditingCenter(center);
    setFormCenterType(center.center_type);
    setFormSetup(center.setup_description || "");
    setFormMaterials(Array.isArray(center.materials_json) ? (center.materials_json as string[]).join(", ") : "");
    setFormObjectives(Array.isArray(center.learning_objectives_json) ? (center.learning_objectives_json as string[]).join("\n") : "");
    setFormObservation(Array.isArray(center.observation_prompts_json) ? (center.observation_prompts_json as string[]).join("\n") : "");
    setShowDialog(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        branch_id: selectedBranch,
        class_id: selectedClass,
        week_starting: weekStarting,
        center_type: formCenterType,
        center_label: CENTER_TYPES.find(c => c.value === formCenterType)?.label || formCenterType,
        setup_description: formSetup,
        materials_json: formMaterials.split(",").map(s => s.trim()).filter(Boolean),
        learning_objectives_json: formObjectives.split("\n").map(s => s.trim()).filter(Boolean),
        observation_prompts_json: formObservation.split("\n").map(s => s.trim()).filter(Boolean),
        status: "draft",
        created_by: user!.id,
      };

      if (editingCenter) {
        const { error } = await supabase.from("learning_center_plans")
          .update(payload as any).eq("id", editingCenter.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("learning_center_plans")
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingCenter ? "Center updated" : "Center created" });
      queryClient.invalidateQueries({ queryKey: ["center-plans"] });
      setShowDialog(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_center_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Center removed" });
      queryClient.invalidateQueries({ queryKey: ["center-plans"] });
    },
  });

  const getCenterConfig = (type: string) => CENTER_TYPES.find(c => c.value === type);

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="lessons" />
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Curriculum</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Learning Centers</span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Learning Center Planner</h1>
            <p className="text-muted-foreground">AI-powered learning center setup aligned to your weekly theme</p>
          </div>
          {selectedClass && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !weeklyContext?.themeName}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : centerPlans.length > 0 ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generateMutation.isPending
                ? "Generating..."
                : centerPlans.length > 0
                ? "Regenerate All"
                : "Auto-Generate Centers"}
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Class</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {visibleClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Week Starting</Label>
                <Input type="date" value={weekStarting} onChange={(e) => setWeekStarting(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Theme Context Banner */}
        {selectedClass && weeklyContext?.themeName && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium">Theme:</span>
                <Badge variant="default">{weeklyContext.themeName}</Badge>
                {weeklyContext.weeklyFocusTitle && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground">Week {weeklyContext.weekNumber} Focus: {weeklyContext.weeklyFocusTitle}</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedClass && !weeklyContext?.themeName && (
          <Card className="border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
              No weekly theme found for this period. Create a Monthly & Weekly plan first to enable AI auto-generation.
            </CardContent>
          </Card>
        )}

        {/* Centers Grid */}
        {selectedClass && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {CENTER_TYPES.map((ct) => {
              const plan = centerPlans.find((p: any) => p.center_type === ct.value);
              const Icon = ct.icon;

              return (
                <Card key={ct.value} className={`border ${plan ? ct.color : "border-dashed border-muted-foreground/30"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {ct.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {plan ? (
                      <div className="space-y-2">
                        <p className="text-muted-foreground line-clamp-3">{(plan as any).setup_description || "No setup description"}</p>
                        {Array.isArray((plan as any).materials_json) && (plan as any).materials_json.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {((plan as any).materials_json as string[]).slice(0, 5).map((m: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                            ))}
                            {(plan as any).materials_json.length > 5 && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">+{(plan as any).materials_json.length - 5}</Badge>
                            )}
                          </div>
                        )}
                        {Array.isArray((plan as any).learning_objectives_json) && (plan as any).learning_objectives_json.length > 0 && (
                          <div className="space-y-0.5 mt-1">
                            {((plan as any).learning_objectives_json as string[]).slice(0, 2).map((obj: string, i: number) => (
                              <p key={i} className="text-xs text-muted-foreground">🎯 {obj}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(plan)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate((plan as any).id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => openCreateDialog(ct.value)}>
                        <Plus className="h-3 w-3 mr-1" /> Setup Center
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!selectedClass && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center text-muted-foreground">
              Select a class to plan learning centers.
            </CardContent>
          </Card>
        )}

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCenter ? "Edit" : "Setup"} Learning Center</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Center Type</Label>
                <Select value={formCenterType} onValueChange={setFormCenterType} disabled={!!editingCenter}>
                  <SelectTrigger><SelectValue placeholder="Select center" /></SelectTrigger>
                  <SelectContent>
                    {CENTER_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Setup Description</Label>
                <Textarea placeholder="Describe how this center will be set up..." value={formSetup} onChange={(e) => setFormSetup(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Materials (comma-separated)</Label>
                <Input placeholder="blocks, play dough, crayons" value={formMaterials} onChange={(e) => setFormMaterials(e.target.value)} />
              </div>
              <div>
                <Label>Learning Objectives (one per line)</Label>
                <Textarea placeholder="Children will explore..." value={formObjectives} onChange={(e) => setFormObjectives(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Observation Prompts (one per line)</Label>
                <Textarea placeholder="Watch for children who..." value={formObservation} onChange={(e) => setFormObservation(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formCenterType}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {editingCenter ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
