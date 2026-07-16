import { useState } from "react";
import { format } from "date-fns";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SortableActivityCard from "@/components/SortableActivityCard";
import InterventionGroupsCard, { type InterventionGroup } from "@/components/InterventionGroupsCard";
import ActivityEditor from "@/components/ActivityEditor";
import type { Activity as ActivityType } from "@/components/ActivityEditor";
import WeeklyTimetable from "@/components/WeeklyTimetable";
import PlanChat from "@/components/PlanChat";
import SharePlanDialog from "@/components/SharePlanDialog";
import BroadcastToParentsDialog from "@/components/BroadcastToParentsDialog";
import type { GeneratedPlan, Worksheet, PlanContext } from "./types";
import {
  Sparkles, CalendarDays, Loader2, Save, MessageSquare,
  FileDown, Share2, Pencil, Plus, CheckCircle2, FileText, ExternalLink, Send,
} from "lucide-react";

interface PlanDisplayProps {
  plan: GeneratedPlan;
  activeDay: string;
  setActiveDay: (v: string) => void;
  ageGroup: string;
  theme: string;
  duration: string;
  methodology?: string;
  onSave?: () => void;
  isSaving?: boolean;
  showChat: boolean;
  setShowChat: (v: boolean) => void;
  planContext: PlanContext;
  onPrint?: () => void;
  planId?: string | null;
  onUpdatePlan?: (plan: GeneratedPlan) => void;
  recommendedWorksheets?: Worksheet[];
  onRegenerate?: () => void;
  interventionGroups?: InterventionGroup[];
}

export default function PlanDisplay({
  plan,
  activeDay,
  setActiveDay,
  ageGroup,
  theme,
  duration,
  methodology,
  onSave,
  isSaving,
  showChat,
  setShowChat,
  planContext,
  onPrint,
  planId,
  onUpdatePlan,
  recommendedWorksheets = [],
  onRegenerate,
  interventionGroups = [],
}: PlanDisplayProps) {
  const [editingActivity, setEditingActivity] = useState<{ dayIndex: number; actIndex: number } | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(plan.title);
  const [editOverview, setEditOverview] = useState(plan.overview);
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const handleActivitySave = (updated: ActivityType) => {
    if (!editingActivity || !onUpdatePlan) return;
    const newPlan = { ...plan, days: plan.days.map((d, di) =>
      di === editingActivity.dayIndex
        ? { ...d, activities: d.activities.map((a, ai) => ai === editingActivity.actIndex ? updated : a) }
        : d
    )};
    onUpdatePlan(newPlan);
    setEditingActivity(null);
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number) => {
    if (!onUpdatePlan) return;
    const newPlan = { ...plan, days: plan.days.map((d, di) =>
      di === dayIndex
        ? { ...d, activities: d.activities.filter((_, ai) => ai !== actIndex) }
        : d
    )};
    onUpdatePlan(newPlan);
  };

  const handleAddActivity = (dayIndex: number) => {
    if (!onUpdatePlan) return;
    const newActivity = {
      name: "New Activity",
      name_ms: "Aktiviti Baru",
      duration_minutes: 15,
      learning_area: "",
      standards_addressed: [] as string[],
      description: "",
      materials: [] as string[],
      teacher_notes: "",
      expected_outcomes: "",
    };
    const newPlan = { ...plan, days: plan.days.map((d, di) =>
      di === dayIndex ? { ...d, activities: [...d.activities, newActivity] } : d
    )};
    onUpdatePlan(newPlan);
    setEditingActivity({ dayIndex, actIndex: newPlan.days[dayIndex].activities.length - 1 });
  };

  const handleTitleSave = () => {
    if (!onUpdatePlan) return;
    onUpdatePlan({ ...plan, title: editTitle });
    setIsEditingTitle(false);
  };

  const handleOverviewSave = () => {
    if (!onUpdatePlan) return;
    onUpdatePlan({ ...plan, overview: editOverview });
    setIsEditingOverview(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (dayIndex: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onUpdatePlan) return;

    const activities = plan.days[dayIndex].activities;
    const oldIndex = activities.findIndex((_, i) => `act-${dayIndex}-${i}` === active.id);
    const newIndex = activities.findIndex((_, i) => `act-${dayIndex}-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activities, oldIndex, newIndex);
    const newPlan = { ...plan, days: plan.days.map((d, di) =>
      di === dayIndex ? { ...d, activities: reordered } : d
    )};
    onUpdatePlan(newPlan);
  };

  return (
    <div className="space-y-4">
      {/* Plan header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 mr-4">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-lg font-semibold"
                    onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                  />
                  <Button size="sm" onClick={handleTitleSave}><Save className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <CardTitle className="group cursor-pointer" onClick={() => onUpdatePlan && setIsEditingTitle(true)}>
                  {plan.title}
                  {onUpdatePlan && <Pencil className="h-3.5 w-3.5 inline ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />}
                </CardTitle>
              )}
              {isEditingOverview ? (
                <div className="flex items-start gap-2 mt-1">
                  <Textarea
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleOverviewSave}><Save className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <CardDescription className="mt-1 group cursor-pointer" onClick={() => onUpdatePlan && setIsEditingOverview(true)}>
                  {plan.overview}
                  {onUpdatePlan && <Pencil className="h-3 w-3 inline ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {onRegenerate && (
                <Button variant="outline" size="sm" onClick={onRegenerate}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Regenerate
                </Button>
              )}
              <Button
                variant={showChat ? "default" : "outline"}
                size="sm"
                onClick={() => setShowChat(!showChat)}
              >
                <MessageSquare className="mr-1.5 h-4 w-4" />
                {showChat ? "Hide Chat" : "Refine"}
              </Button>
              {onPrint && (
                <Button variant="outline" size="sm" onClick={onPrint}>
                  <FileDown className="mr-1.5 h-4 w-4" />
                  PDF
                </Button>
              )}
              {planId && (
                <SharePlanDialog planId={planId} planTitle={plan.title}>
                  <Button variant="outline" size="sm">
                    <Share2 className="mr-1.5 h-4 w-4" />
                    Share
                  </Button>
                </SharePlanDialog>
              )}
              {planId && (
                <Button variant="outline" size="sm" onClick={async () => {
                  const { supabase } = await import("@/integrations/supabase/client");
                  await supabase.from("lesson_plans")
                    .update({ review_status: "ready_for_review", status: "pending_review" } as any)
                    .eq("id", planId);
                  const { toast } = await import("@/hooks/use-toast");
                  toast.call(null, { title: "Submitted for review" });
                }}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Submit for Review
                </Button>
              )}
              {onSave && !planId && (
                <Button size="sm" onClick={onSave} disabled={isSaving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" />Save Plan</>}
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="secondary">{ageGroup} tahun</Badge>
            <Badge variant="secondary">{theme}</Badge>
            <Badge variant="secondary">{duration}</Badge>
            {methodology && methodology !== "Default KP2026" && (
              <Badge variant="default">{methodology}</Badge>
            )}
          </div>
          {/* Day completion progress */}
          {plan.days.length > 0 && plan.days.some((d) => d.completed) && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Day Progress</span>
                <span>{plan.days.filter(d => d.completed).length} / {plan.days.length} days</span>
              </div>
              <Progress value={Math.round((plan.days.filter(d => d.completed).length / plan.days.length) * 100)} className="h-2" />
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Save as Draft Banner */}
      {onSave && !planId && (
        <Alert className="border-primary/30 bg-primary/5">
          <Save className="h-4 w-4 text-primary" />
          <AlertTitle className="text-sm">Plan not saved yet</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span className="text-xs">Save your plan to enable auto-saving of edits and sharing.</span>
            <Button size="sm" onClick={onSave} disabled={isSaving} className="ml-3">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className={`grid gap-4 ${showChat ? "grid-cols-1 lg:grid-cols-5" : ""}`}>
        {/* Plan content */}
        <div className={showChat ? "lg:col-span-3" : ""}>
          {plan.days.length > 0 && (
            <Tabs value={activeDay} onValueChange={setActiveDay}>
              <TabsList className="flex flex-wrap h-auto gap-1">
                {plan.days.map((day, i) => (
                  <TabsTrigger key={i} value={String(i)} className="text-xs">
                    {day.date ? format(new Date(day.date + "T00:00:00"), "EEE d/M") : `Hari ${day.day}`}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="timetable" className="text-xs">
                  <CalendarDays className="h-3 w-3 mr-1" />
                  Jadual
                </TabsTrigger>
                <TabsTrigger value="assessment" className="text-xs">📋 Penilaian</TabsTrigger>
              </TabsList>

              {plan.days.map((day, i) => {
                const activityIds = day.activities.map((_, j) => `act-${i}-${j}`);
                return (
                <TabsContent key={i} value={String(i)} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      {day.date ? format(new Date(day.date + "T00:00:00"), "EEEE, d MMM yyyy") + " — " : ""}
                      {day.theme_focus}
                    </p>
                    {onUpdatePlan && (
                      <Button
                        variant={day.completed ? "default" : "outline"}
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => {
                          const newPlan = { ...plan, days: plan.days.map((d, di) =>
                            di === i ? { ...d, completed: !d.completed } : d
                          )};
                          onUpdatePlan(newPlan);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {day.completed ? "Completed ✓" : "Mark Complete"}
                      </Button>
                    )}
                  </div>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(i)}>
                    <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {day.activities.map((act, j) => (
                          <SortableActivityCard
                            key={`act-${i}-${j}`}
                            id={`act-${i}-${j}`}
                            activity={act}
                            canEdit={!!onUpdatePlan}
                            onEdit={() => setEditingActivity({ dayIndex: i, actIndex: j })}
                            onDelete={() => handleDeleteActivity(i, j)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  {onUpdatePlan && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed"
                      onClick={() => handleAddActivity(i)}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add Activity
                    </Button>
                  )}
                </TabsContent>
                );
              })}

              {/* Intervention Groups from weekly subject plan */}
              {interventionGroups.length > 0 && (
                <div className="mt-4">
                  <InterventionGroupsCard
                    groups={interventionGroups}
                    onAddToPlan={onUpdatePlan ? (intervention) => {
                      const dayIdx = parseInt(activeDay) || 0;
                      const newActivity = {
                        name: intervention.name,
                        name_ms: intervention.name,
                        duration_minutes: 20,
                        learning_area: "Intervention",
                        standards_addressed: intervention.standards,
                        description: intervention.description,
                        materials: [] as string[],
                        teacher_notes: `Small group: ${intervention.students.join(", ")}`,
                        expected_outcomes: "",
                      };
                      const newPlan = { ...plan, days: plan.days.map((d, di) =>
                        di === dayIdx ? { ...d, activities: [...d.activities, newActivity] } : d
                      )};
                      onUpdatePlan(newPlan);
                    } : undefined}
                  />
                </div>
              )}

              <TabsContent value="timetable">
                <WeeklyTimetable
                  days={plan.days}
                  onSelectActivity={(dayIdx, actIdx) => {
                    setActiveDay(String(dayIdx));
                    setEditingActivity({ dayIndex: dayIdx, actIndex: actIdx });
                  }}
                />
              </TabsContent>

              <TabsContent value="assessment" className="space-y-3">
                {plan.assessment_checklist?.length > 0 ? (
                  plan.assessment_checklist.map((item, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Badge variant="default" className="text-xs shrink-0">{item.standard_code}</Badge>
                          <div>
                            <p className="text-sm">{item.indicator}</p>
                            <div className="flex gap-2 mt-2">
                              {item.rating_scale.map((r) => (
                                <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No assessment checklist generated.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Chat panel */}
        {showChat && (
          <Card className="lg:col-span-2 h-[600px] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Refine with AI
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <PlanChat planContext={planContext} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommended Worksheets */}
      {recommendedWorksheets.length > 0 && (
        <Collapsible defaultOpen>
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Recommended Worksheets ({recommendedWorksheets.length})
                </CardTitle>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                {recommendedWorksheets.map((ws) => (
                  <div key={ws.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{ws.title}</p>
                      <p className="text-xs text-muted-foreground">{ws.subject}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ws.metadata_tags?.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={ws.pdf_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View PDF
                      </a>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Family Connection Card */}
      {plan.parent_connection_snippet && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              💌 Family Connection / Hubungan Keluarga
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
              {plan.parent_connection_snippet}
            </p>
            <Button onClick={() => setShowBroadcast(true)} className="w-full sm:w-auto">
              <Send className="h-4 w-4 mr-1.5" />
              Broadcast to Parents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Broadcast dialog */}
      <BroadcastToParentsDialog
        open={showBroadcast}
        onOpenChange={setShowBroadcast}
        defaultSubject={`This week's adventure: ${plan.title}`}
        defaultBody={plan.parent_connection_snippet || ""}
        lessonPlanId={planId}
        worksheets={recommendedWorksheets?.map((ws) => ({ id: ws.id, title: ws.title, pdf_url: ws.pdf_url })) || []}
      />

      {/* Activity editor dialog */}
      {editingActivity && (
        <ActivityEditor
          activity={plan.days[editingActivity.dayIndex]?.activities[editingActivity.actIndex]}
          open={!!editingActivity}
          onOpenChange={(open) => !open && setEditingActivity(null)}
          onSave={handleActivitySave}
        />
      )}
    </div>
  );
}
