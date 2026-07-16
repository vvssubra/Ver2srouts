import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, BookOpen, Eye, Target,
  Home, Play, CheckCircle2,
  Trash2, ChevronRight, Clock, Palette, MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import type { GeneratedPlan } from "@/components/lesson-planner/types";
import ClassStudentsSection from "@/components/lesson-planner/ClassStudentsSection";
import BackToContextBar from "@/components/navigation/BackToContextBar";
import PerChildDifferentiationCard from "@/components/lesson-planner/PerChildDifferentiationCard";

export default function LessonPlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["lesson-plan-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_plans")
        .select("*, classes(class_name, age_group), profiles:user_id(first_name, last_name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: async (newReviewStatus: string) => {
      // Map review_status to status for backward compat
      const statusMap: Record<string, string> = {
        draft: "draft",
        ready_for_review: "pending_review",
        approved: "approved",
        published: "published",
        returned_for_revision: "draft",
      };
      const { error } = await supabase.from("lesson_plans")
        .update({ review_status: newReviewStatus, status: statusMap[newReviewStatus] || newReviewStatus } as any)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["lesson-plan-detail", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lesson_plans").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan deleted" });
      navigate("/lesson-planner");
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-muted-foreground">Plan not found.</div>
      </DashboardLayout>
    );
  }

  const gp = (plan as any).generated_plan as GeneratedPlan | null;
  const teacherName = (plan as any).profiles
    ? `${(plan as any).profiles.first_name || ""} ${(plan as any).profiles.last_name || ""}`.trim()
    : null;

  // Extract data from the actual generated plan structure
  const days = gp?.days || [];
  const assessmentChecklist = gp?.assessment_checklist || [];
  const parentSnippet = gp?.parent_connection_snippet || "";

  // Collect all observation cues from activities
  const allObservationCues: { day: number; activityName: string; cues: string }[] = [];
  days.forEach((day) => {
    day.activities?.forEach((act) => {
      if (act.observation_cues) {
        allObservationCues.push({
          day: day.day,
          activityName: act.name || act.name_ms,
          cues: act.observation_cues,
        });
      }
    });
  });

  // Collect materials from activities for centers-like view
  const learningAreas = new Map<string, { activities: string[]; materials: string[] }>();
  days.forEach((day) => {
    day.activities?.forEach((act) => {
      const area = act.learning_area || "General";
      if (!learningAreas.has(area)) learningAreas.set(area, { activities: [], materials: [] });
      const entry = learningAreas.get(area)!;
      entry.activities.push(act.name || act.name_ms);
      act.materials?.forEach((m) => {
        if (!entry.materials.includes(m)) entry.materials.push(m);
      });
    });
  });

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <BackToContextBar />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => navigate("/lesson-planner")} className="hover:text-foreground">Lesson Plans</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{plan.title}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{plan.title}</h1>
              {(() => {
                const rs = (plan as any).review_status || "draft";
                const labels: Record<string, { text: string; cls: string }> = {
                  draft: { text: "Draft", cls: "" },
                  ready_for_review: { text: "Pending Review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" },
                  approved: { text: "Approved", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300" },
                  published: { text: "Published", cls: "bg-primary/15 text-primary border-primary/30" },
                  returned_for_revision: { text: "Needs Revision", cls: "bg-destructive/15 text-destructive border-destructive/30" },
                };
                const cfg = labels[rs] || labels.draft;
                return <Badge variant="outline" className={cfg.cls}>{cfg.text}</Badge>;
              })()}
            </div>
            <div className="flex gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
              <span>Age {plan.age_group}</span>
              <span>•</span>
              <span>{plan.theme}</span>
              <span>•</span>
              <span>{(plan as any).classes?.class_name || "No class"}</span>
              {teacherName && (
                <>
                  <span>•</span>
                  <span>By {teacherName}</span>
                </>
              )}
            </div>
            {gp?.overview && (
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{gp.overview}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {(() => {
              const rs = (plan as any).review_status || "draft";
              if (rs === "draft" || rs === "returned_for_revision") {
                return (
                  <Button size="sm" onClick={() => statusMutation.mutate("ready_for_review")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {rs === "returned_for_revision" ? "Resubmit for Review" : "Submit for Review"}
                  </Button>
                );
              }
              if (rs === "ready_for_review") {
                return (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1.5">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting Review
                  </Badge>
                );
              }
              if (rs === "approved") {
                return (
                  <Button size="sm" onClick={() => statusMutation.mutate("published")}>
                    <Play className="h-4 w-4 mr-1" /> Publish
                  </Button>
                );
              }
              if (rs === "published") {
                return (
                  <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("approved")}>
                    Unpublish
                  </Button>
                );
              }
              return null;
            })()}
            <Button variant="destructive" size="sm" onClick={() => {
              if (confirm("Delete this plan?")) deleteMutation.mutate();
            }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!gp || days.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No generated plan content found.</p>
              <p className="text-sm mt-1">This plan may have been saved before content was generated.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="flow">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
              <TabsTrigger value="flow"><Play className="h-3 w-3 mr-1" /> Daily Flow</TabsTrigger>
              <TabsTrigger value="activities"><BookOpen className="h-3 w-3 mr-1" /> Activities</TabsTrigger>
              <TabsTrigger value="centers"><Palette className="h-3 w-3 mr-1" /> Learning Areas</TabsTrigger>
              <TabsTrigger value="observe"><Eye className="h-3 w-3 mr-1" /> Observe</TabsTrigger>
              <TabsTrigger value="family"><Home className="h-3 w-3 mr-1" /> Family</TabsTrigger>
              <TabsTrigger value="assess"><Target className="h-3 w-3 mr-1" /> Assess</TabsTrigger>
              <TabsTrigger value="students">👩‍🎓 Students</TabsTrigger>
            </TabsList>

            {/* Flow Tab — Daily Overview */}
            <TabsContent value="flow" className="mt-4 space-y-3">
              {days.map((day, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {day.date ? format(new Date(day.date + "T00:00:00"), "EEE, d MMM") : `Day ${day.day}`}
                        </Badge>
                        <span className="font-medium text-sm">{day.theme_focus}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {day.activities?.length || 0} activities
                        {day.completed && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {day.activities?.map((act, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] font-normal">
                          {act.name || act.name_ms} ({act.duration_minutes}m)
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Activities Tab — Full Details */}
            <TabsContent value="activities" className="mt-4 space-y-4">
              {days.map((day, di) => (
                <div key={di} className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground border-b pb-1">
                    {day.date ? format(new Date(day.date + "T00:00:00"), "EEEE, d MMM yyyy") : `Day ${day.day}`}
                    {" — "}{day.theme_focus}
                  </h3>
                  {day.activities?.map((act, ai) => (
                    <Card key={ai}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold">{act.name || act.name_ms}</h4>
                          <Badge variant="outline" className="text-xs shrink-0">{act.duration_minutes} min</Badge>
                        </div>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {act.learning_area && <Badge variant="secondary" className="text-[10px]">{act.learning_area}</Badge>}
                          {act.standards_addressed?.map((s, si) => (
                            <Badge key={si} variant="default" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                        {act.description && <p className="text-sm text-muted-foreground mt-2">{act.description}</p>}
                        {act.learning_objective && (
                          <p className="text-sm mt-1"><strong className="text-xs uppercase text-muted-foreground">Objective:</strong> {act.learning_objective}</p>
                        )}
                        {act.procedure && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {(["introduction", "activity", "conclusion"] as const).map((p) => (
                              <div key={p} className="p-2 bg-muted/50 rounded text-xs">
                                <div className="font-medium capitalize mb-1">{p}</div>
                                {act.procedure?.[p] || <span className="text-muted-foreground italic">—</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {act.materials?.length > 0 && (
                          <div className="mt-2">
                            <span className="text-[10px] uppercase text-muted-foreground font-medium">Materials: </span>
                            <span className="text-xs">{act.materials.join(", ")}</span>
                          </div>
                        )}
                        {act.differentiation_strategies && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs">
                              <div className="font-medium text-blue-700 dark:text-blue-300 text-[10px] uppercase">Support Needed</div>
                              {act.differentiation_strategies.support_needed}
                            </div>
                            <div className="p-2 bg-purple-50 dark:bg-purple-950/30 rounded text-xs">
                              <div className="font-medium text-purple-700 dark:text-purple-300 text-[10px] uppercase">Advanced Challenge</div>
                              {act.differentiation_strategies.advanced_challenge}
                            </div>
                          </div>
                        )}
                        {act.teacher_notes && (
                          <p className="mt-2 text-xs text-muted-foreground italic">💡 {act.teacher_notes}</p>
                        )}
                        {act.observation_cues && (
                          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {act.observation_cues}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))}
            </TabsContent>

            {/* Centers / Learning Areas Tab */}
            <TabsContent value="centers" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(learningAreas.entries()).map(([area, data], i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{area}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>
                        <span className="text-[10px] uppercase text-muted-foreground font-medium">Activities</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {data.activities.map((a, j) => (
                            <Badge key={j} variant="outline" className="text-[10px]">{a}</Badge>
                          ))}
                        </div>
                      </div>
                      {data.materials.length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase text-muted-foreground font-medium">Materials</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {data.materials.map((m, j) => (
                              <Badge key={j} variant="secondary" className="text-[10px]">{m}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {learningAreas.size === 0 && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                    No learning area data available in this plan.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Observe Tab */}
            <TabsContent value="observe" className="mt-4 space-y-3">
              {allObservationCues.length > 0 ? (
                allObservationCues.map((obs, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Eye className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div>
                          <div className="flex gap-2 items-center">
                            <Badge variant="outline" className="text-[10px]">Day {obs.day}</Badge>
                            <span className="text-sm font-medium">{obs.activityName}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{obs.cues}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No observation cues found in this plan's activities.
                </div>
              )}
              {assessmentChecklist.length > 0 && (
                <>
                  <Separator />
                  <h4 className="font-semibold text-sm">Assessment Checklist</h4>
                  {assessmentChecklist.map((item, i) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <Badge variant="default" className="text-xs shrink-0">{item.standard_code}</Badge>
                          <div>
                            <p className="text-sm">{item.indicator}</p>
                            <div className="flex gap-1.5 mt-1">
                              {item.rating_scale?.map((r) => (
                                <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </TabsContent>

            {/* Family Tab */}
            <TabsContent value="family" className="mt-4">
              {parentSnippet ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Parent Connection
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm italic text-muted-foreground">"{parentSnippet}"</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No parent/family connection content in this plan.
                </div>
              )}
            </TabsContent>

            {/* Assess Tab */}
            <TabsContent value="assess" className="mt-4 space-y-3">
              {assessmentChecklist.length > 0 ? (
                assessmentChecklist.map((item, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Badge variant="default" className="text-xs shrink-0">{item.standard_code}</Badge>
                        <div>
                          <p className="text-sm">{item.indicator}</p>
                          <div className="flex gap-2 mt-2">
                            {item.rating_scale?.map((r) => (
                              <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No assessment checklist found in this plan.
                </div>
              )}
            </TabsContent>

            {/* Students Tab */}
            <TabsContent value="students" className="mt-4">
              {(plan as any).class_id ? (
                <div className="space-y-4">
                  <PerChildDifferentiationCard
                    classId={(plan as any).class_id}
                    lessonPlanId={(plan as any).id}
                  />
                  <ClassStudentsSection classId={(plan as any).class_id} />
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No class assigned to this plan.
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
