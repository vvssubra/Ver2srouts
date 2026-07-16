import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Trash2, BookOpen, Share2, Image, Filter } from "lucide-react";
import AddObservationDialog from "@/components/AddObservationDialog";

const proficiencyColors: Record<string, string> = {
  TP1: "bg-destructive/15 text-destructive border-destructive/30",
  TP2: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  TP3: "bg-accent/15 text-accent border-accent/30",
};

export default function Observations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedArea, setSelectedArea] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  // Get user's branch
  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-obs"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const userBranchId = memberships[0]?.branch_id || "";

  // Teacher class scoping
  const { teacherClassIds } = useTeacherClasses(userBranchId);

  const { data: students } = useQuery({
    queryKey: ["all-my-students", teacherClassIds],
    queryFn: async () => {
      let query = supabase.from("students").select("*, class_name, class_id").eq("is_active", true).order("first_name");
      const { data } = await query;
      let list = data ?? [];
      // Filter by teacher's assigned classes
      if (teacherClassIds) {
        list = list.filter((s: any) => s.class_id && teacherClassIds.includes(s.class_id));
      }
      return list;
    },
    enabled: !!user,
  });

  const classOptions = useMemo(() => {
    const classes = new Map<string, string>();
    students?.forEach((s: any) => { if (s.class_id && s.class_name) classes.set(s.class_id, s.class_name); });
    return Array.from(classes.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [students]);

  const { data: areas } = useQuery({
    queryKey: ["learning-areas"],
    queryFn: async () => {
      const { data } = await supabase.from("learning_areas").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: standards } = useQuery({
    queryKey: ["standards-for-area", selectedArea],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_standards")
        .select("*")
        .eq("learning_area_id", selectedArea)
        .order("sort_order");
      return data ?? [];
    },
    enabled: !!selectedArea,
  });

  const { data: observations, isLoading } = useQuery({
    queryKey: ["recent-observations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("*, students(first_name, last_name), curriculum_standards(code, title_ms, title_en)")
        .order("observed_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user,
  });

  const deleteObservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_observations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recent-observations"] }),
  });

  // Filter observations by class and teacher scope
  const filteredObservations = useMemo(() => {
    if (!observations) return [];
    let list = observations;
    // Filter by teacher's assigned students
    if (teacherClassIds && students) {
      const scopedIds = new Set(students.map((s: any) => s.id));
      list = list.filter((obs: any) => scopedIds.has(obs.student_id));
    }
    if (classFilter !== "all") {
      const studentIdsInClass = new Set(students?.filter((s: any) => s.class_id === classFilter).map((s: any) => s.id) ?? []);
      list = list.filter((obs: any) => studentIdsInClass.has(obs.student_id));
    }
    return list;
  }, [observations, classFilter, students, teacherClassIds]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pemerhatian / Observations</h1>
            <p className="text-sm text-muted-foreground">Record student observations against curriculum standards</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <AddObservationDialog
              students={students ?? []}
              areas={areas ?? []}
              standards={standards ?? []}
              selectedArea={selectedArea}
              setSelectedArea={setSelectedArea}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["recent-observations"] })}
              branchId={userBranchId}
            />
          </div>
        </div>

        <div className="grid gap-3">
          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading observations...</CardContent></Card>
          ) : !filteredObservations?.length ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No observations found. {classFilter !== "all" ? "Try a different class filter." : 'Click "New Observation" to start.'}</CardContent></Card>
          ) : filteredObservations.map((obs: any) => (
            <Card key={obs.id} className="group">
              <CardContent className="flex items-start gap-4 p-4">
                {/* Media thumbnail */}
                {obs.media_url && (
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted">
                    <img src={obs.media_url} alt="Activity" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">
                      {obs.students?.first_name} {obs.students?.last_name}
                    </span>
                    <Badge variant="outline" className={proficiencyColors[obs.proficiency_level] ?? ""}>
                      {obs.proficiency_level}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{obs.curriculum_standards?.code}</span>
                    {obs.is_shared_with_parent && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs gap-1">
                        <Share2 className="h-2.5 w-2.5" />Shared
                      </Badge>
                    )}
                    {obs.media_url && !obs.media_url && (
                      <Image className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {obs.curriculum_standards?.title_ms}
                    {obs.curriculum_standards?.title_en ? ` / ${obs.curriculum_standards.title_en}` : ""}
                  </p>
                  {obs.notes && <p className="text-sm text-foreground/80">{obs.notes}</p>}

                  {/* AI Learning Story */}
                  {obs.ai_learning_story && (
                    <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-primary">Learning Story</span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{obs.ai_learning_story}</p>
                    </div>
                  )}

                  {obs.evidence_url && (
                    <a href={obs.evidence_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                      View Evidence
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{obs.observed_at}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => deleteObservation.mutate(obs.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
