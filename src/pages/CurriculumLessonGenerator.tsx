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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  Sparkles, Loader2, Save, BookOpen, Target, Users, Palette,
  Eye, MessageSquare, Home, ChevronRight, Edit, CheckCircle2,
  AlertTriangle, Lightbulb, Play,
} from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type GeneratedPlan = any;

export default function CurriculumLessonGenerator() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const queryClient = useQueryClient();

  // Step state
  const [step, setStep] = useState<"setup" | "preview" | "edit">("setup");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("1");
  const [methodology, setMethodology] = useState("Play-based");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const monthNum = selectedMonth ? parseInt(selectedMonth) : 0;

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, class_name, age_group")
        .eq("branch_id", selectedBranch).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!selectedBranch,
  });

  const selectedClassData = classes.find((c: any) => c.id === selectedClass);

  // Fetch monthly plan for the selected class/month
  const { data: monthlyPlan } = useQuery({
    queryKey: ["monthly-plan", selectedClass, monthNum],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_curriculum_plans")
        .select("*, theme_bank(theme_name, big_idea, key_vocabulary_json, key_concepts_json)")
        .eq("class_id", selectedClass)
        .eq("month_number", monthNum)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedClass && monthNum > 0,
  });

  // Fetch weekly plan
  const { data: weeklyPlan } = useQuery({
    queryKey: ["weekly-plan", monthlyPlan?.id, selectedWeek],
    queryFn: async () => {
      if (!monthlyPlan?.id) return null;
      const { data } = await supabase.from("weekly_curriculum_plans")
        .select("*")
        .eq("monthly_plan_id", monthlyPlan.id)
        .eq("week_number", parseInt(selectedWeek))
        .maybeSingle();
      return data;
    },
    enabled: !!monthlyPlan?.id,
  });

  // Fetch theme bank weekly focuses for display
  const { data: themeWeeklyFocuses = [] } = useQuery({
    queryKey: ["theme-weekly-focuses", monthlyPlan?.theme_bank_id],
    queryFn: async () => {
      if (!monthlyPlan?.theme_bank_id) return [];
      const { data } = await supabase.from("theme_weekly_focuses")
        .select("*").eq("theme_bank_id", monthlyPlan.theme_bank_id).order("week_number");
      return data ?? [];
    },
    enabled: !!monthlyPlan?.theme_bank_id,
  });

  const currentWeeklyFocus = themeWeeklyFocuses.find((f: any) => f.week_number === parseInt(selectedWeek));

  const handleGenerate = async () => {
    if (!selectedClass || !monthNum) {
      toast({ title: "Missing information", description: "Select a class and month first.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const themeName = (monthlyPlan as any)?.theme_bank?.theme_name || MONTHS[monthNum - 1];
      const bigIdea = (monthlyPlan as any)?.theme_bank?.big_idea || (monthlyPlan as any)?.big_idea || "";

      const { data, error } = await supabase.functions.invoke("generate-curriculum-lesson", {
        body: {
          ageGroup: selectedClassData?.age_group?.replace(/[^0-9]/g, "") || "4",
          monthTheme: themeName,
          weeklyFocus: weeklyPlan?.focus_title || currentWeeklyFocus?.focus_title || "",
          bigIdea,
          monthlyPlanId: monthlyPlan?.id,
          weeklyPlanId: weeklyPlan?.id,
          themeBankId: monthlyPlan?.theme_bank_id,
          classId: selectedClass,
          branchId: selectedBranch,
          methodology,
          teacherNotes,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedPlan(data.plan);
      setStep("preview");
      toast({ title: "Plan generated!", description: "Review and edit before saving." });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedPlan || !user) return;
    setIsSaving(true);
    try {
      const ageNum = selectedClassData?.age_group?.replace(/[^0-9]/g, "") || "4";

      // Save lesson plan
      const { data: saved, error } = await supabase.from("lesson_plans").insert({
        user_id: user.id,
        title: generatedPlan.title || `${generatedPlan.month_theme} — Week ${selectedWeek}`,
        age_group: ageNum,
        theme: generatedPlan.month_theme || "",
        duration: "1 week",
        generated_plan: generatedPlan as any,
        status: "draft",
        class_id: selectedClass,
        branch_id: selectedBranch,
        monthly_plan_id: monthlyPlan?.id || null,
        weekly_plan_id: weeklyPlan?.id || null,
        theme_bank_id: monthlyPlan?.theme_bank_id || null,
        methodology,
        teacher_notes: teacherNotes || null,
        objective_ids_json: generatedPlan.domain_objectives?.map((o: any) => o.outcome_code) || [],
        domain_tags_json: generatedPlan.domain_objectives?.map((o: any) => o.domain) || [],
        center_plan_json: generatedPlan.center_setups || [],
        provocations_json: generatedPlan.provocations || [],
        observation_targets_json: generatedPlan.observation_targets || [],
        parent_story_prompt: generatedPlan.parent_story_prompt || null,
        ptm_evidence_tags_json: generatedPlan.ptm_evidence_tags || [],
        family_extension_json: generatedPlan.family_connection || {},
        plan_mode: "curriculum",
      } as any).select("id").single();

      if (error) throw error;

      // Log coverage automatically
      if (saved?.id && generatedPlan.domain_objectives) {
        const coverageLogs = generatedPlan.domain_objectives.map((obj: any) => ({
          branch_id: selectedBranch,
          class_id: selectedClass,
          standard_code: obj.outcome_code || "GENERAL",
          subject_name: obj.domain || "General",
          week_starting: new Date().toISOString().split("T")[0],
          lesson_plan_id: saved.id,
          coverage_type: "lesson_plan",
          weekly_focus: generatedPlan.weekly_focus || null,
          month_number: monthNum,
        }));

        await supabase.from("class_coverage_logs").insert(coverageLogs);
      }

      // Save center plans
      if (saved?.id && generatedPlan.center_setups) {
        const centerPlans = generatedPlan.center_setups.map((c: any) => ({
          lesson_plan_id: saved.id,
          branch_id: selectedBranch,
          class_id: selectedClass,
          center_type: c.center,
          center_label: c.center?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) || c.center,
          setup_description: c.setup || "",
          materials_json: c.materials || [],
          learning_objectives_json: [c.learning_focus || ""],
          linked_domains_json: [],
          status: "draft",
          created_by: user.id,
          week_starting: new Date().toISOString().split("T")[0],
        }));

        await supabase.from("learning_center_plans").insert(centerPlans);
      }

      toast({ title: "Lesson plan saved!", description: "Coverage logged automatically." });
      queryClient.invalidateQueries({ queryKey: ["lesson-plans"] });
      setStep("setup");
      setGeneratedPlan(null);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Curriculum</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Lesson Generator</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lesson Plan Generator</h1>
            <p className="text-muted-foreground">AI-powered curriculum-aligned lesson planning</p>
          </div>
          {step !== "setup" && (
            <Button variant="outline" onClick={() => { setStep("setup"); setGeneratedPlan(null); }}>
              ← Back to Setup
            </Button>
          )}
        </div>

        {/* Context Bar */}
        {monthlyPlan && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="text-xs">
                  🎨 {(monthlyPlan as any)?.theme_bank?.theme_name || "Theme"}
                </Badge>
                {currentWeeklyFocus && (
                  <Badge variant="secondary" className="text-xs">
                    📌 Week {selectedWeek}: {currentWeeklyFocus.focus_title}
                  </Badge>
                )}
                {selectedClassData && (
                  <Badge className="text-xs">
                    👶 Age {selectedClassData.age_group}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "setup" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Inputs */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Generator Inputs
                  </CardTitle>
                  <CardDescription>Configure the lesson plan context</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Branch</Label>
                    </div>
                    <div>
                      <Label>Class</Label>
                      <Select value={selectedClass} onValueChange={setSelectedClass}>
                        <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>
                          {classes.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.class_name} (Age {c.age_group})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Month</Label>
                      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Week</Label>
                      <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4].map((w) => (
                            <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>


                  {/* Methodology is now auto-detected from school settings */}
                  <div className="rounded-md border border-muted bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      💡 Teaching methodology is automatically applied from your school's adopted methodologies configured in Theme Bank settings.
                    </p>
                  </div>

                  <div>
                    <Label>Teacher Notes (optional)</Label>
                    <Textarea
                      placeholder="Add notes about specific children's needs, available materials, or focus areas..."
                      value={teacherNotes}
                      onChange={(e) => setTeacherNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleGenerate}
                    disabled={isGenerating || !selectedClass || !selectedMonth}
                  >
                    {isGenerating ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating Plan...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Generate Lesson Plan</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Context sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Curriculum Context</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {monthlyPlan ? (
                    <>
                      <div>
                        <span className="text-muted-foreground">Theme:</span>{" "}
                        <span className="font-medium">{(monthlyPlan as any)?.theme_bank?.theme_name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Big Idea:</span>{" "}
                        <span>{(monthlyPlan as any)?.big_idea || (monthlyPlan as any)?.theme_bank?.big_idea || "—"}</span>
                      </div>
                      {weeklyPlan && (
                        <div>
                          <span className="text-muted-foreground">Weekly Focus:</span>{" "}
                          <span className="font-medium">{weeklyPlan.focus_title}</span>
                        </div>
                      )}
                    </>
                  ) : selectedClass && monthNum > 0 ? (
                    <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>No monthly curriculum plan found. The generator will use theme bank defaults.</span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Select a class and month to see curriculum context.</p>
                  )}

                  {themeWeeklyFocuses.length > 0 && (
                    <>
                      <Separator />
                      <div className="font-medium">Weekly Focuses</div>
                      {themeWeeklyFocuses.map((f: any) => (
                        <div
                          key={f.id}
                          className={`px-2 py-1 rounded text-xs ${f.week_number === parseInt(selectedWeek) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}
                        >
                          Week {f.week_number}: {f.focus_title}
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {(step === "preview" || step === "edit") && generatedPlan && (
          <div className="space-y-6">
            {/* Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{generatedPlan.title}</h2>
                    <p className="text-muted-foreground">{generatedPlan.essential_question}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(step === "edit" ? "preview" : "edit")}>
                      <Edit className="h-4 w-4 mr-1" />
                      {step === "edit" ? "Preview" : "Edit"}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Save Plan
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {generatedPlan.domain_objectives?.map((obj: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {obj.domain_code || obj.domain}: {obj.objective?.substring(0, 40)}...
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="flow">
              <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
                <TabsTrigger value="flow"><Play className="h-3 w-3 mr-1" /> Daily Flow</TabsTrigger>
                <TabsTrigger value="activities"><BookOpen className="h-3 w-3 mr-1" /> Activities</TabsTrigger>
                <TabsTrigger value="centers"><Palette className="h-3 w-3 mr-1" /> Centers</TabsTrigger>
                <TabsTrigger value="observation"><Eye className="h-3 w-3 mr-1" /> Observation</TabsTrigger>
                <TabsTrigger value="family"><Home className="h-3 w-3 mr-1" /> Family</TabsTrigger>
                <TabsTrigger value="assessment"><Target className="h-3 w-3 mr-1" /> Assessment</TabsTrigger>
              </TabsList>

              <TabsContent value="flow" className="mt-4">
                <Card>
                  <CardHeader><CardTitle>Daily Flow</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {generatedPlan.daily_flow && Object.entries(generatedPlan.daily_flow).map(([key, val]: [string, any]) => (
                        <div key={key} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="w-32 shrink-0">
                            <div className="font-medium text-sm capitalize">{key.replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{val?.duration}</div>
                          </div>
                          <div className="text-sm">{val?.description || val?.focus || ""}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activities" className="mt-4 space-y-4">
                {generatedPlan.activities?.map((act: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold">{act.title}</h4>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">{act.type}</Badge>
                            <Badge variant="outline" className="text-xs">{act.domain}</Badge>
                            <Badge variant="outline" className="text-xs">{act.duration}</Badge>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{act.learning_objective}</p>

                      {act.procedure && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-medium uppercase text-muted-foreground">Procedure</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {["introduction", "activity", "conclusion"].map((phase) => (
                              <div key={phase} className="p-2 bg-muted/50 rounded text-xs">
                                <div className="font-medium capitalize mb-1">{phase}</div>
                                {act.procedure[phase]}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {act.differentiation && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs">
                            <div className="font-medium text-blue-700 dark:text-blue-300 mb-1">Support</div>
                            {act.differentiation.support}
                          </div>
                          <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded text-xs">
                            <div className="font-medium text-green-700 dark:text-green-300 mb-1">Core</div>
                            {act.differentiation.core}
                          </div>
                          <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded text-xs">
                            <div className="font-medium text-purple-700 dark:text-purple-300 mb-1">Extension</div>
                            {act.differentiation.extension}
                          </div>
                        </div>
                      )}

                      {act.materials && act.materials.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {act.materials.map((m: string, mi: number) => (
                            <Badge key={mi} variant="outline" className="text-xs">{m}</Badge>
                          ))}
                        </div>
                      )}

                      {act.provocation_questions && (
                        <div className="mt-2">
                          <div className="text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" /> Provocations
                          </div>
                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                            {act.provocation_questions.map((q: string, qi: number) => (
                              <li key={qi}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {act.observation_cues && (
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {act.observation_cues}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="centers" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generatedPlan.center_setups?.map((center: any, i: number) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm capitalize">
                          {center.center?.replace(/_/g, " ")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <p>{center.setup}</p>
                        <div className="text-xs text-muted-foreground">
                          <strong>Focus:</strong> {center.learning_focus}
                        </div>
                        {center.materials?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {center.materials.map((m: string, mi: number) => (
                              <Badge key={mi} variant="outline" className="text-xs">{m}</Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="observation" className="mt-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Eye className="h-4 w-4" /> Observation Targets
                    </h4>
                    {generatedPlan.observation_targets?.map((t: any, i: number) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg">
                        <div className="font-medium text-sm">{t.domain}</div>
                        <div className="text-sm text-muted-foreground">{t.indicator}</div>
                        <div className="text-xs text-green-700 dark:text-green-400 mt-1">
                          ✓ Evidence: {t.evidence_example}
                        </div>
                      </div>
                    ))}

                    {generatedPlan.observation_prompts?.length > 0 && (
                      <>
                        <Separator />
                        <h4 className="font-semibold text-sm">Teacher Prompts</h4>
                        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                          {generatedPlan.observation_prompts.map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="family" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Parent Story Prompt
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm italic">"{generatedPlan.parent_story_prompt}"</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4" /> Home Extension
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <p>{generatedPlan.family_connection?.parent_snippet}</p>
                      <Separator />
                      <p className="text-muted-foreground">{generatedPlan.family_connection?.home_extension}</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="assessment" className="mt-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm mb-2">PTM Evidence Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {generatedPlan.ptm_evidence_tags?.map((tag: string, i: number) => (
                          <Badge key={i} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Assessment Indicators</h4>
                      <ul className="space-y-1 text-sm">
                        {generatedPlan.assessment?.indicators?.map((ind: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            {ind}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {generatedPlan.assessment?.next_step_rules?.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Next Steps</h4>
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {generatedPlan.assessment.next_step_rules.map((r: string, i: number) => (
                              <li key={i}>→ {r}</li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Materials summary */}
            {generatedPlan.materials?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">All Materials Needed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {generatedPlan.materials.map((m: string, i: number) => (
                      <Badge key={i} variant="outline">{m}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Provocations */}
            {generatedPlan.provocations?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Provocations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {generatedPlan.provocations.map((p: any, i: number) => (
                      <div key={i} className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
                        <Badge variant="outline" className="text-xs mb-1">{p.type}</Badge>
                        <p>{p.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{p.linked_domain}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
