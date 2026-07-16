import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowRight, Target, BookOpen, CalendarRange, Microscope, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LinkedItemsPanelProps {
  context: "monthly" | "weekly" | "yearly-outcome";
  monthPlanId?: string;
  weekPlanId?: string;
  yearlyOutcomeId?: string;
  yearPlanId?: string;
  branchId?: string;
}

function CollapsibleOutcomes({ outcomes }: { outcomes: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const INITIAL_SHOW = 6;
  const hasMore = outcomes.length > INITIAL_SHOW;

  return (
    <div>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-muted-foreground">Learning Goals ({outcomes.length})</p>
          {hasMore && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1">
                {isOpen ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show all</>}
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
        <div className="space-y-1">
          {outcomes.slice(0, INITIAL_SHOW).map((o: any) => (
            <div key={o.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-muted/50">
              <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">{o.outcome_code}</Badge>
              <span className="text-muted-foreground leading-snug">{o.outcome_title || "Untitled"}</span>
            </div>
          ))}
        </div>
        <CollapsibleContent>
          <div className="space-y-1 mt-1">
            {outcomes.slice(INITIAL_SHOW).map((o: any) => (
              <div key={o.id} className="flex items-start gap-2 text-xs p-1.5 rounded bg-muted/50">
                <Badge variant="outline" className="text-[10px] font-mono shrink-0 mt-0.5">{o.outcome_code}</Badge>
                <span className="text-muted-foreground leading-snug">{o.outcome_title || "Untitled"}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function LinkedItemsPanel({ context, monthPlanId, weekPlanId, yearlyOutcomeId, yearPlanId, branchId }: LinkedItemsPanelProps) {
  const navigate = useNavigate();

  // For monthly: show linked weekly plans
  const { data: linkedWeeks = [] } = useQuery({
    queryKey: ["linked-weeks", monthPlanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_week_plans")
        .select("id, week_number, title, focus_area, review_status")
        .eq("month_plan_id", monthPlanId!)
        .order("week_number");
      return (data as any[]) ?? [];
    },
    enabled: context === "monthly" && !!monthPlanId,
  });

  // For monthly: show linked yearly outcomes via year plan
  const { data: linkedOutcomes = [] } = useQuery({
    queryKey: ["linked-outcomes-for-plan", yearPlanId],
    queryFn: async () => {
      if (!yearPlanId) return [];
      // Get the age_group_id from the year plan
      const { data: yp } = await supabase.from("curriculum_year_plans").select("age_group_id").eq("id", yearPlanId).single();
      if (!yp) return [];
      const { data } = await supabase
        .from("yearly_outcomes")
        .select("id, outcome_code, outcome_title, development_domains(name)")
        .eq("age_group_id", (yp as any).age_group_id)
        .order("outcome_code")
        .limit(10);
      return (data as any[]) ?? [];
    },
    enabled: (context === "monthly" || context === "weekly") && !!yearPlanId,
  });

  // For yearly outcome: show linked objectives
  const { data: linkedObjectives = [] } = useQuery({
    queryKey: ["linked-objectives", yearlyOutcomeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_objectives")
        .select("id, code, title, bloom_level")
        .eq("yearly_outcome_id", yearlyOutcomeId!)
        .eq("is_active", true)
        .order("code");
      return (data as any[]) ?? [];
    },
    enabled: context === "yearly-outcome" && !!yearlyOutcomeId,
  });

  // For yearly outcome: show linked observations
  const { data: linkedObservations = [] } = useQuery({
    queryKey: ["linked-observations-outcome", yearlyOutcomeId],
    queryFn: async () => {
      // Observations are linked via indicators → objectives → yearly outcomes
      // For now, show count
      const { count } = await supabase
        .from("lesson_objectives")
        .select("id", { count: "exact", head: true })
        .eq("yearly_outcome_id", yearlyOutcomeId!)
        .eq("is_active", true);
      return count ?? 0;
    },
    enabled: context === "yearly-outcome" && !!yearlyOutcomeId,
  });

  const statusVariant = (s: string) => {
    if (s === "approved") return "default" as const;
    if (s === "submitted") return "outline" as const;
    if (s === "returned") return "destructive" as const;
    return "secondary" as const;
  };

  if (context === "monthly") {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" /> Linked Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Weekly Plans */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Weekly Plans ({linkedWeeks.length})</p>
            {linkedWeeks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No weekly plans yet</p>
            ) : (
              <div className="space-y-1">
                {linkedWeeks.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                    <span>Week {w.week_number}: {w.title || w.focus_area || "Untitled"}</span>
                    <Badge variant={statusVariant(w.review_status || "draft")} className="text-[10px]">
                      {w.review_status || "draft"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Linked Outcomes - Collapsible */}
          {linkedOutcomes.length > 0 && (
            <CollapsibleOutcomes outcomes={linkedOutcomes} />
          )}
        </CardContent>
      </Card>
    );
  }

  if (context === "yearly-outcome" && yearlyOutcomeId) {
    return (
      <div className="space-y-2 pt-2 border-t">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ClipboardList className="h-3 w-3" /> {linkedObjectives.length} linked term objectives
        </p>
        {linkedObjectives.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {linkedObjectives.slice(0, 4).map((o: any) => (
              <Badge key={o.id} variant="outline" className="text-[10px]">
                {o.code}: {o.title?.substring(0, 30)}…
              </Badge>
            ))}
            {linkedObjectives.length > 4 && (
              <Badge variant="secondary" className="text-[10px]">+{linkedObjectives.length - 4} more</Badge>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7"
          onClick={() => navigate(`/objective-bank?outcomeId=${yearlyOutcomeId}`)}
        >
          View term objectives <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  return null;
}
