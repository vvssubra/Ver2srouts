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
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  building: "bg-destructive/15 text-destructive",
  growing: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]",
  confident: "bg-accent/15 text-accent",
};

const domainKeys = ["language", "literacy", "numeracy", "motor", "social", "self_help"] as const;
const domainLabels: Record<string, string> = {
  language: "Communication & Language",
  literacy: "Early Literacy",
  numeracy: "Numeracy & Thinking",
  motor: "Physical & Motor",
  social: "Social-Emotional",
  self_help: "Self-Help & Independence",
};

export default function ClassReadiness() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [generating, setGenerating] = useState(false);

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-readiness"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = memberships[0]?.branch_id || "";

  const { teacherClassIds } = useTeacherClasses(branchId);

  const { data: classes = [] } = useQuery({
    queryKey: ["readiness-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Teachers only see their assigned classes
  const visibleClasses = useMemo(() => {
    if (!teacherClassIds) return classes;
    return classes.filter((c: any) => teacherClassIds.includes(c.id));
  }, [classes, teacherClassIds]);

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["readiness-snapshot", selectedClass, selectedTerm],
    queryFn: async () => {
      const { data } = await supabase
        .from("class_readiness_snapshots")
        .select("*")
        .eq("class_id", selectedClass)
        .eq("term", selectedTerm)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedClass,
  });

  const generateSnapshot = async () => {
    if (!selectedClass) return;
    setGenerating(true);
    try {
      const cls = visibleClasses.find((c: any) => c.id === selectedClass);
      // Get evidence summary
      const { data: evidence } = await supabase
        .from("student_observation_evidence")
        .select("status, indicator_id, observation_indicators(domain_id, development_domains(name))")
        .eq("class_id", selectedClass);

      const { data: studentCount } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("class_id", selectedClass)
        .eq("is_active", true);

      const { data: aiResult, error } = await supabase.functions.invoke("generate-readiness-snapshot", {
        body: {
          class_name: cls?.class_name || "",
          term: selectedTerm,
          evidence_summary: evidence || [],
          student_count: studentCount || 0,
        },
      });
      if (error) throw error;

      // Save snapshot
      const { error: saveErr } = await supabase.from("class_readiness_snapshots").insert({
        class_id: selectedClass,
        term: selectedTerm,
        language_summary_json: aiResult.language || {},
        literacy_summary_json: aiResult.literacy || {},
        numeracy_summary_json: aiResult.numeracy || {},
        motor_summary_json: aiResult.motor || {},
        social_summary_json: aiResult.social || {},
        self_help_summary_json: aiResult.self_help || {},
        next_focus_json: aiResult.next_focus || [],
      } as any);
      if (saveErr) throw saveErr;

      queryClient.invalidateQueries({ queryKey: ["readiness-snapshot"] });
      toast({ title: "Readiness snapshot generated!" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const getDomainData = (key: string) => {
    if (!snapshot) return null;
    const jsonKey = `${key}_summary_json` as keyof typeof snapshot;
    return snapshot[jsonKey] as any;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Class Readiness Snapshot</h1>
            <p className="text-sm text-muted-foreground">AI-powered readiness analysis by domain</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {visibleClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["Term 1", "Term 2", "Term 3", "Term 4"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={generateSnapshot} disabled={!selectedClass || generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Snapshot
          </Button>
        </div>

        {!selectedClass ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Select a class to view readiness</CardContent></Card>
        ) : isLoading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
        ) : !snapshot ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg mb-2">No snapshot yet</p>
            <p className="text-sm">Click "Generate Snapshot" to create an AI readiness analysis</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {domainKeys.map(key => {
                const data = getDomainData(key);
                if (!data) return null;
                return (
                  <Card key={key}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{domainLabels[key]}</CardTitle>
                        <Badge className={statusColors[data.overall_status] || "bg-muted"}>
                          {data.overall_status ? data.overall_status.charAt(0).toUpperCase() + data.overall_status.slice(1) : "N/A"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div><span className="font-medium text-accent">Strength:</span> {data.strength}</div>
                      <div><span className="font-medium text-destructive">Gap:</span> {data.gap}</div>
                      <div><span className="font-medium text-primary">Focus:</span> {data.recommendation}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {snapshot.next_focus_json && Array.isArray(snapshot.next_focus_json) && (snapshot.next_focus_json as any[]).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Priority Focus Areas</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {(snapshot.next_focus_json as any[]).map((item: any, i: number) => (
                      <li key={i} className="text-sm flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {typeof item === "string" ? item : JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">
              Last generated: {new Date(snapshot.created_at).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
