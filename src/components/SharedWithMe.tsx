import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Users, Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";

interface SharedWithMeProps {
  onViewPlan: (plan: any) => void;
}

export default function SharedWithMe({ onViewPlan }: SharedWithMeProps) {
  const { user } = useAuth();

  const { data: sharedPlans = [], isLoading } = useQuery({
    queryKey: ["shared-with-me", user?.id],
    queryFn: async () => {
      // Get shared_plans entries for this user
      const { data: shares, error } = await supabase
        .from("shared_plans")
        .select("id, lesson_plan_id, shared_by, created_at")
        .eq("shared_with", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!shares?.length) return [];

      // Fetch the actual lesson plans
      const planIds = shares.map((s: any) => s.lesson_plan_id);
      const { data: plans } = await supabase
        .from("lesson_plans")
        .select("id, title, age_group, theme, duration, generated_plan, created_at")
        .in("id", planIds);

      // Fetch sharer profiles
      const sharerIds = [...new Set(shares.map((s: any) => s.shared_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", sharerIds);

      return shares.map((s: any) => ({
        ...s,
        plan: plans?.find((p: any) => p.id === s.lesson_plan_id),
        sharer: profiles?.find((p: any) => p.id === s.shared_by),
      })).filter((s: any) => s.plan);
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sharedPlans.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center h-48">
        <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm text-center">
          No plans shared with you yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sharedPlans.map((item: any) => {
        const plan = item.plan;
        const dayCount = plan.generated_plan?.days?.length || 0;
        const sharerName = item.sharer?.first_name
          ? `${item.sharer.first_name} ${item.sharer.last_name || ""}`
          : item.sharer?.email || "Unknown";

        return (
          <Card key={item.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold line-clamp-2">
                {plan.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Shared by <span className="font-medium">{sharerName}</span>
              </p>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">{plan.age_group} tahun</Badge>
                <Badge variant="secondary" className="text-xs">{plan.theme}</Badge>
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />{plan.duration}
                </Badge>
                {dayCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <CalendarDays className="h-3 w-3 mr-1" />{dayCount} hari
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2">
                {plan.generated_plan?.overview || "No overview"}
              </p>

              <p className="text-[10px] text-muted-foreground/60">
                Shared {format(new Date(item.created_at), "d MMM yyyy")}
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onViewPlan(plan)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                View Plan
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
