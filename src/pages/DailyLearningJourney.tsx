import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, BookOpen, Eye, Camera, Sparkles, Star, FolderOpen } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { toast } from "@/hooks/use-toast";
import BackToContextBar from "@/components/navigation/BackToContextBar";

const entryTypeLabels: Record<string, string> = {
  quick_observation: "Quick Obs",
  learning_story: "Learning Story",
  group_observation: "Group Obs",
  routine_observation: "Routine",
};

export default function DailyLearningJourney() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [classFilter, setClassFilter] = useState("all");
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-journey"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = memberships[0]?.branch_id || "";
  const { teacherClassIds } = useTeacherClasses(branchId);

  const { data: classes = [] } = useQuery({
    queryKey: ["journey-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const filteredClasses = useMemo(() => {
    if (!teacherClassIds) return classes;
    return classes.filter((c: any) => teacherClassIds.includes(c.id));
  }, [classes, teacherClassIds]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["journey-entries-by-date", dateStr, classFilter],
    queryFn: async () => {
      const startOfDay = `${dateStr}T00:00:00`;
      const endOfDay = `${dateStr}T23:59:59`;
      let query = supabase
        .from("daily_learning_journey_entries")
        .select("*, students(first_name, last_name, class_id, class_name), development_domains(name)")
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .order("created_at", { ascending: false });
      const { data } = await query;
      let list = data ?? [];
      // Filter by teacher class scope
      if (teacherClassIds) {
        list = list.filter((e: any) => e.students?.class_id && teacherClassIds.includes(e.students.class_id));
      }
      if (classFilter !== "all") {
        list = list.filter((e: any) => e.class_id === classFilter);
      }
      return list;
    },
    enabled: !!user,
  });

  const visibleCount = entries.filter((e: any) => e.visible_to_parent).length;
  const pendingCount = entries.filter((e: any) => !e.visible_to_parent).length;

  // Toggle milestone/portfolio mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ entryId, field, value }: { entryId: string; field: string; value: boolean }) => {
      const { error } = await supabase.from("daily_learning_journey_entries").update({ [field]: value } as any).eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-entries-by-date"] });
      toast({ title: "Updated" });
    },
  });
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToContextBar />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Learning Journey</h1>
            <p className="text-sm text-muted-foreground">View and manage daily observations by class</p>
          </div>
        </div>

        {/* Date navigation + filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-sm px-2 min-w-[140px] text-center">
              {format(selectedDate, "EEEE, d MMM yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {filteredClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 ml-auto">
            <Badge variant="secondary">{visibleCount} shared</Badge>
            <Badge variant="outline">{pendingCount} pending</Badge>
          </div>
        </div>

        {/* Entries */}
        <div className="grid gap-3">
          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading entries...</CardContent></Card>
          ) : !entries.length ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-lg mb-1">No entries for this date</p>
              <p className="text-sm">Go to Record Observation to add observations</p>
            </CardContent></Card>
          ) : entries.map((entry: any) => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{entry.students?.first_name} {entry.students?.last_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {entryTypeLabels[entry.entry_type] || entry.entry_type}
                      </Badge>
                      {entry.development_domains?.name && (
                        <Badge variant="secondary" className="text-xs">{entry.development_domains.name}</Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm">{entry.title}</p>
                    {entry.teacher_note && <p className="text-sm text-muted-foreground">{entry.teacher_note}</p>}
                    {entry.parent_summary && (
                      <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-2">
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span className="text-xs font-medium text-primary">Parent Summary</span>
                        </div>
                        <p className="text-sm text-foreground/80">{entry.parent_summary}</p>
                      </div>
                    )}
                    {entry.next_step && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">Next step:</span> {entry.next_step}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {entry.visible_to_parent ? (
                      <Badge className="bg-accent/15 text-accent text-xs gap-1"><Eye className="h-2.5 w-2.5" />Shared</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Draft</Badge>
                    )}
                    <div className="flex gap-1">
                      <button
                        className={`p-1 rounded transition-colors ${entry.milestone_flag ? "text-accent" : "text-muted-foreground/40 hover:text-accent"}`}
                        title="Toggle milestone"
                        onClick={() => toggleMutation.mutate({ entryId: entry.id, field: "milestone_flag", value: !entry.milestone_flag })}
                      >
                        <Star className={`h-3.5 w-3.5 ${entry.milestone_flag ? "fill-accent" : ""}`} />
                      </button>
                      <button
                        className={`p-1 rounded transition-colors ${entry.portfolio_candidate ? "text-primary" : "text-muted-foreground/40 hover:text-primary"}`}
                        title="Toggle portfolio"
                        onClick={() => toggleMutation.mutate({ entryId: entry.id, field: "portfolio_candidate", value: !entry.portfolio_candidate })}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
