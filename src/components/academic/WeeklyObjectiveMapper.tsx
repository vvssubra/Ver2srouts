import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Target } from "lucide-react";

interface Props {
  weekPlanId?: string;
  ageGroupLabel: string;
  monthPlanId?: string;
  previewMode?: boolean;
  pendingObjectives?: any[];
  onPendingChange?: (objectives: any[]) => void;
}

export default function WeeklyObjectiveMapper({ weekPlanId, ageGroupLabel, monthPlanId, previewMode = false, pendingObjectives = [], onPendingChange }: Props) {
  const queryClient = useQueryClient();
  const [domainFilter, setDomainFilter] = useState("all");
  const [showPicker, setShowPicker] = useState(false);

  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  // Get the monthly plan's saved linked learning goals to filter objectives
  const { data: monthPlanOutcomeIds = [] } = useQuery({
    queryKey: ["month-plan-outcome-ids", monthPlanId],
    queryFn: async () => {
      const { data: mp, error } = await supabase
        .from("curriculum_month_plans")
        .select("focus_outcomes")
        .eq("id", monthPlanId!)
        .maybeSingle();
      if (error) throw error;

      const focusOutcomes = Array.isArray((mp as any)?.focus_outcomes)
        ? (mp as any).focus_outcomes.filter(Boolean)
        : [];

      return focusOutcomes;
    },
    enabled: !!monthPlanId,
  });

  // Currently linked objectives (only when we have a saved plan)
  const { data: linkedObjectives = [] } = useQuery({
    queryKey: ["weekly-focus-objectives", weekPlanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("weekly_focus_objectives")
        .select("*, lesson_objectives(id, code, title, objective_type, difficulty_level, age_groups(label), development_domains(name))")
        .eq("week_plan_id", weekPlanId!);
      return (data as any[]) ?? [];
    },
    enabled: !!weekPlanId,
  });

  // Available objectives filtered by monthly plan's learning goals
  const { data: allObjectives = [] } = useQuery({
    queryKey: ["objectives-for-picker", domainFilter, monthPlanOutcomeIds],
    queryFn: async () => {
      let q = supabase
        .from("lesson_objectives")
        .select("id, code, title, objective_type, difficulty_level, learning_area, yearly_outcome_id, age_groups(label), development_domains(name)")
        .eq("is_active", true)
        .order("code");
      if (domainFilter !== "all") q = q.eq("domain_id", domainFilter);
      // Filter by monthly plan's learning goals if available
      if (monthPlanOutcomeIds.length > 0) {
        q = q.in("yearly_outcome_id", monthPlanOutcomeIds);
      }
      const { data } = await q;
      return (data as any[]) ?? [];
    },
    enabled: showPicker && monthPlanOutcomeIds.length > 0,
  });

  const linkedIds = new Set(linkedObjectives.map((lo: any) => lo.lesson_objective_id));
  const pendingIds = new Set(pendingObjectives.map((po: any) => po.code));
  const available = allObjectives.filter((o: any) => !linkedIds.has(o.id) && !pendingIds.has(o.code));

  const addMutation = useMutation({
    mutationFn: async ({ objectiveId, priority }: { objectiveId: string; priority: string }) => {
      if (!weekPlanId) throw new Error("No saved plan");
      const { error } = await supabase.from("weekly_focus_objectives").insert({
        week_plan_id: weekPlanId,
        lesson_objective_id: objectiveId,
        priority,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-focus-objectives", weekPlanId] });
      toast({ title: "Objective linked" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("weekly_focus_objectives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-focus-objectives", weekPlanId] });
      toast({ title: "Objective unlinked" });
    },
  });

  const handleAddObjective = (obj: any, priority: string) => {
    if (previewMode && !weekPlanId) {
      // Preview mode — add to pending
      onPendingChange?.([...pendingObjectives, { code: obj.code, priority, title: obj.title }]);
    } else {
      addMutation.mutate({ objectiveId: obj.id, priority });
    }
  };

  const handleRemovePending = (code: string) => {
    onPendingChange?.(pendingObjectives.filter((po: any) => po.code !== code));
  };

  const priorityColor = (p: string | null) => {
    if (p === "primary") return "bg-primary/10 text-primary";
    if (p === "secondary") return "bg-muted text-muted-foreground";
    return "bg-orange-50 text-orange-700";
  };

  const totalCount = linkedObjectives.length + pendingObjectives.length;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Term Objectives ({totalCount})
            {previewMode && !weekPlanId && <Badge variant="outline" className="text-xs ml-1">Preview — save draft to persist</Badge>}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowPicker(!showPicker)}>
            {showPicker ? "Close" : <><Plus className="h-3.5 w-3.5 mr-1" /> Link Objective</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Pending objectives (from AI brainstorm, not yet saved) */}
        {pendingObjectives.length > 0 && (
          <div className="space-y-2">
            {pendingObjectives.map((po: any) => (
              <div key={po.code} className="flex items-center justify-between gap-2 rounded-md border border-dashed border-primary/30 p-2.5 bg-primary/5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-xs">{po.code}</Badge>
                    <Badge variant="outline" className={`text-xs ${priorityColor(po.priority)}`}>{po.priority || "primary"}</Badge>
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  </div>
                  <p className="text-sm font-medium mt-1">{po.title}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleRemovePending(po.code)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Linked objectives list */}
        {linkedObjectives.length === 0 && pendingObjectives.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No objectives linked to this week yet. Add some to guide lesson planning.</p>
        ) : (
          <div className="space-y-2">
            {linkedObjectives.map((lo: any) => (
              <div key={lo.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-xs">{lo.lesson_objectives?.code}</Badge>
                    <Badge variant="outline" className={`text-xs ${priorityColor(lo.priority)}`}>{lo.priority || "primary"}</Badge>
                    <Badge variant="secondary" className="text-xs">{lo.lesson_objectives?.age_groups?.label}</Badge>
                  </div>
                  <p className="text-sm font-medium mt-1">{lo.lesson_objectives?.title}</p>
                  <p className="text-xs text-muted-foreground">{lo.lesson_objectives?.development_domains?.name}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeMutation.mutate(lo.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Picker */}
        {showPicker && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Filter Domain:</Label>
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {domains.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {monthPlanOutcomeIds.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No learning goals linked to the monthly plan. Add learning goals to the monthly planner first.</p>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No more objectives to link. Create more in Term Objectives.</p>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {available.map((obj: any) => (
                  <div key={obj.id} className="flex items-center justify-between gap-2 rounded border p-2 hover:bg-background">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-muted-foreground">{obj.code}</span>
                        <Badge variant="secondary" className="text-xs">{obj.age_groups?.label}</Badge>
                      </div>
                      <p className="text-sm truncate">{obj.title}</p>
                      <p className="text-xs text-muted-foreground">{obj.development_domains?.name}{obj.learning_area ? ` · ${obj.learning_area}` : ""}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddObjective(obj, "primary")}>
                        Primary
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleAddObjective(obj, "secondary")}>
                        Support
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
