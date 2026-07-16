import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Clock,
  Trash2,
  Eye,
  Copy,
  Loader2,
  CalendarDays,
  CheckCircle2,
  Pencil,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SavedPlan = {
  id: string;
  title: string;
  age_group: string;
  theme: string;
  duration: string;
  generated_plan: any;
  status: string;
  created_at: string;
  plan_mode?: string;
  start_date?: string;
  completion_status?: string;
  completed_at?: string;
  class_id?: string;
};

interface SavedPlansProps {
  onViewPlan: (plan: SavedPlan) => void;
}

const MODE_LABELS: Record<string, { label: string; icon: typeof Sparkles }> = {
  ai_theme: { label: "AI Theme", icon: Sparkles },
  ai_subject: { label: "AI Subject", icon: CalendarDays },
  enrichment: { label: "Enrichment", icon: GraduationCap },
  manual: { label: "Manual", icon: Pencil },
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function SavedPlans({ onViewPlan }: SavedPlansProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["saved-lesson-plans", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_plans")
        .select("id, title, age_group, theme, duration, generated_plan, status, created_at, learning_area_ids, standard_ids, plan_mode, start_date, completion_status, completed_at, class_id")
        .eq("user_id", user!.id)
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-for-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, class_name").eq("is_active", true);
      return (data as any[]) ?? [];
    },
  });

  const classMap = Object.fromEntries(classes.map((c: any) => [c.id, c.class_name]));

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lesson_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      toast({ title: "Dipadam ✅", description: "Lesson plan deleted." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (plan: any) => {
      const { error } = await supabase.from("lesson_plans").insert({
        user_id: user!.id,
        title: `${plan.title} (Copy)`,
        age_group: plan.age_group,
        theme: plan.theme,
        duration: plan.duration,
        generated_plan: plan.generated_plan,
        learning_area_ids: plan.learning_area_ids ?? [],
        standard_ids: plan.standard_ids ?? [],
        plan_mode: plan.plan_mode,
        start_date: plan.start_date,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      toast({ title: "Disalin ✅", description: "Lesson plan duplicated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("lesson_plans").update({
        completion_status: status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lesson-plans"] });
      toast({ title: "Status updated ✅" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredPlans = filter === "all" ? plans : plans.filter((p: any) => (p.completion_status || "draft") === filter);

  const counts = {
    all: plans.length,
    draft: plans.filter((p: any) => !p.completion_status || p.completion_status === "draft").length,
    in_progress: plans.filter((p: any) => p.completion_status === "in_progress").length,
    completed: plans.filter((p: any) => p.completion_status === "completed").length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center h-48">
        <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm text-center">
          No saved lesson plans yet.
          <br />
          Generate and save a plan to see it here.
        </p>
      </Card>
    );
  }

  const getCompletionProgress = (plan: any) => {
    const days = plan.generated_plan?.days || [];
    if (days.length === 0) return 0;
    const completed = days.filter((d: any) => d.completed).length;
    return Math.round((completed / days.length) * 100);
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all" className="text-xs">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="draft" className="text-xs">Draft ({counts.draft})</TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs">In Progress ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">Completed ({counts.completed})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPlans.map((plan: any) => {
          const dayCount = plan.generated_plan?.days?.length || 0;
          const completionStatus = plan.completion_status || "draft";
          const progress = getCompletionProgress(plan);
          const modeInfo = MODE_LABELS[plan.plan_mode] || MODE_LABELS.ai_theme;
          const ModeIcon = modeInfo.icon;

          return (
            <Card key={plan.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold line-clamp-2">
                    {plan.title}
                  </CardTitle>
                  <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[completionStatus] || ""}`} variant="outline">
                    {completionStatus === "in_progress" ? "In Progress" : completionStatus.charAt(0).toUpperCase() + completionStatus.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">
                    <ModeIcon className="h-3 w-3 mr-1" />
                    {modeInfo.label}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {plan.age_group} tahun
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {plan.theme}
                  </Badge>
                  {plan.class_id && classMap[plan.class_id] && (
                    <Badge variant="outline" className="text-xs">
                      {classMap[plan.class_id]}
                    </Badge>
                  )}
                </div>

                {/* Date range */}
                {plan.start_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(plan.start_date + "T00:00:00"), "d MMM yyyy")}
                    {dayCount > 0 && ` · ${dayCount} days`}
                  </p>
                )}

                {!plan.start_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {plan.duration}
                    {dayCount > 0 && ` · ${dayCount} days`}
                  </p>
                )}

                {/* Progress bar */}
                {completionStatus !== "draft" && dayCount > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                <p className="text-xs text-muted-foreground line-clamp-2">
                  {plan.generated_plan?.overview || "No overview"}
                </p>

                <p className="text-[10px] text-muted-foreground/60">
                  Created {format(new Date(plan.created_at), "d MMM yyyy, h:mm a")}
                  {plan.completed_at && ` · Completed ${format(new Date(plan.completed_at), "d MMM")}`}
                </p>

                <div className="flex gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => navigate(`/curriculum/lessons/${plan.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View Detail
                  </Button>
                  {completionStatus === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => statusMutation.mutate({ id: plan.id, status: "in_progress" })}
                    >
                      Start
                    </Button>
                  )}
                  {completionStatus === "in_progress" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-green-600"
                      onClick={() => statusMutation.mutate({ id: plan.id, status: "completed" })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => duplicateMutation.mutate(plan)}
                    disabled={duplicateMutation.isPending}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Padam rancangan ini?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. The lesson plan "{plan.title}" will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(plan.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Padam
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
