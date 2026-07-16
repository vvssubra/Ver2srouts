import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Save, Sparkles, Loader2, Camera, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { notifyStudentParents } from "@/lib/parent-notify";
import BackToContextBar from "@/components/navigation/BackToContextBar";

const statusOptions = [
  { value: "not_yet", label: "Not Yet", color: "bg-muted text-muted-foreground" },
  { value: "emerging", label: "Emerging", color: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]" },
  { value: "consistent", label: "Consistent", color: "bg-accent/15 text-accent" },
];

const entryTypes = [
  { value: "quick_observation", label: "Quick Observation" },
  { value: "learning_story", label: "Learning Story" },
  { value: "group_observation", label: "Group Observation" },
  { value: "routine_observation", label: "Self-Help / Routine" },
];

export default function RecordObservation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState("quick_observation");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedIndicator, setSelectedIndicator] = useState("");
  const [status, setStatus] = useState("emerging");
  const [title, setTitle] = useState("");
  const [teacherNote, setTeacherNote] = useState("");
  const [parentSummary, setParentSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(false);
  const [internalOnly, setInternalOnly] = useState(false);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-rec-obs"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = memberships[0]?.branch_id || "";
  const { teacherClassIds } = useTeacherClasses(branchId);

  const { data: students = [] } = useQuery({
    queryKey: ["obs-students", teacherClassIds],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, class_id, class_name").eq("is_active", true).order("first_name");
      let list = data ?? [];
      if (teacherClassIds) list = list.filter((s: any) => s.class_id && teacherClassIds.includes(s.class_id));
      return list;
    },
    enabled: !!user,
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["dev-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ["obs-indicators", selectedDomain],
    queryFn: async () => {
      const { data } = await supabase.from("observation_indicators").select("*").eq("domain_id", selectedDomain).order("indicator_code");
      return data ?? [];
    },
    enabled: !!selectedDomain,
  });

  const { data: recentEntries = [], isLoading } = useQuery({
    queryKey: ["recent-journey-entries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("*, students(first_name, last_name), development_domains(name)")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    enabled: !!user,
  });

  const generateParentSummary = async () => {
    if (!teacherNote) { toast({ title: "Write a teacher note first", variant: "destructive" }); return; }
    setGeneratingAI(true);
    try {
      const student = students.find((s: any) => s.id === selectedStudent);
      const domain = domains.find((d: any) => d.id === selectedDomain);
      const indicator = indicators.find((i: any) => i.id === selectedIndicator);
      const { data, error } = await supabase.functions.invoke("generate-parent-summary", {
        body: {
          teacher_note: teacherNote,
          domain_name: domain?.name || "",
          indicator_text: indicator?.indicator_text || "",
          child_name: student ? `${student.first_name}` : "",
          activity_title: title,
        },
      });
      if (error) throw error;
      setParentSummary(data.parent_summary + (data.home_extension ? `\n\n${data.home_extension}` : ""));
      toast({ title: "Parent summary generated!" });
    } catch (e: any) {
      toast({ title: "AI error", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSave = async () => {
    if (!selectedStudent || !title) { toast({ title: "Select a student and add a title", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const student = students.find((s: any) => s.id === selectedStudent);
      // Insert journey entry
      const { data: entry, error: entryErr } = await supabase.from("daily_learning_journey_entries").insert({
        student_id: selectedStudent,
        class_id: student?.class_id || null,
        entry_type: entryType,
        domain_id: selectedDomain || null,
        linked_indicator_id: selectedIndicator || null,
        title,
        teacher_note: teacherNote,
        parent_summary: parentSummary || null,
        next_step: nextStep || null,
        visible_to_parent: visibleToParent,
        created_by: user!.id,
      } as any).select().single();
      if (entryErr) throw entryErr;

      // Also insert evidence record if indicator selected
      if (selectedIndicator && selectedDomain) {
        await supabase.from("student_observation_evidence").insert({
          student_id: selectedStudent,
          class_id: student?.class_id || null,
          indicator_id: selectedIndicator,
          status,
          evidence_note: evidenceNote || teacherNote,
          teacher_id: user!.id,
          next_step: nextStep || null,
          internal_only: internalOnly,
        } as any);
      }

      // If visible to parent, create feed notification
      if (visibleToParent) {
        const { data: parentLinks } = await supabase.from("parent_students").select("parent_id").eq("student_id", selectedStudent).eq("status", "approved");
        if (parentLinks?.length) {
          const notifs = parentLinks.map((pl: any) => ({
            parent_id: pl.parent_id,
            journey_entry_id: (entry as any).id,
          }));
          await supabase.from("parent_feed_notifications").insert(notifs as any);
        }
        // Fan out push + in-app alert to parents
        const childName = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "Your child";
        await notifyStudentParents(
          selectedStudent,
          `✨ New update for ${childName}`,
          title,
          "timeline_update",
          {
            actionUrl: "/child",
            referenceId: (entry as any).id,
            groupKey: `timeline:${selectedStudent}`,
            priority: "normal",
            excludeUserId: user!.id,
          }
        );
      }

      if (visibleToParent) {
        sonnerToast.success("Observation saved & shared with parents", {
          description: "Now visible in the child's Story feed.",
          action: {
            label: "View in Parent Story",
            onClick: () => window.open(`/child?student=${selectedStudent}`, "_blank"),
          },
        });
      } else {
        toast({ title: "Observation saved!" });
      }
      queryClient.invalidateQueries({ queryKey: ["recent-journey-entries"] });
      resetForm();
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setSelectedStudent("");
    setSelectedDomain("");
    setSelectedIndicator("");
    setStatus("emerging");
    setTitle("");
    setTeacherNote("");
    setParentSummary("");
    setNextStep("");
    setVisibleToParent(false);
    setInternalOnly(false);
    setEvidenceNote("");
    setEntryType("quick_observation");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToContextBar />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Record Observation</h1>
            <p className="text-sm text-muted-foreground">Observe and document child learning evidence</p>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Observation
          </Button>
        </div>

        {/* Recent entries feed */}
        <div className="grid gap-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><div className="animate-pulse space-y-2"><div className="h-4 bg-muted rounded w-1/3" /><div className="h-3 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/2" /></div></CardContent></Card>
              ))}
            </div>
          ) : !recentEntries.length ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center">
              <Camera className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-lg font-medium text-foreground mb-1">No observations yet</p>
              <p className="text-sm text-muted-foreground mb-4">Start recording learning evidence for your students</p>
              <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> New Observation</Button>
            </CardContent></Card>
          ) : recentEntries.map((entry: any) => (
            <Card key={entry.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {entry.students?.first_name} {entry.students?.last_name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {entryTypes.find(t => t.value === entry.entry_type)?.label || entry.entry_type}
                      </Badge>
                      {entry.development_domains?.name && (
                        <Badge variant="secondary" className="text-xs">{entry.development_domains.name}</Badge>
                      )}
                      {entry.visible_to_parent && (
                        <Badge className="bg-primary/10 text-primary text-xs">Shared</Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm">{entry.title}</p>
                    {entry.teacher_note && <p className="text-sm text-muted-foreground">{entry.teacher_note}</p>}
                    {entry.parent_summary && (
                      <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-2">
                        <p className="text-xs font-medium text-primary mb-1">Parent Summary</p>
                        <p className="text-sm text-foreground/80">{entry.parent_summary}</p>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* New Observation Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Observation</DialogTitle>
            </DialogHeader>
            <Tabs value={entryType} onValueChange={setEntryType}>
              <TabsList className="grid grid-cols-4 w-full">
                {entryTypes.map(t => <TabsTrigger key={t.value} value={t.value} className="text-xs">{t.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>

            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Student *</Label>
                  <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                    <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>
                      {students.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Domain</Label>
                  <Select value={selectedDomain} onValueChange={(v) => { setSelectedDomain(v); setSelectedIndicator(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                    <SelectContent>
                      {domains.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedDomain && indicators.length > 0 && (
                <div>
                  <Label>Indicator</Label>
                  <Select value={selectedIndicator} onValueChange={setSelectedIndicator}>
                    <SelectTrigger><SelectValue placeholder="Select indicator" /></SelectTrigger>
                    <SelectContent>
                      {indicators.map((ind: any) => (
                        <SelectItem key={ind.id} value={ind.id}>{ind.indicator_code}: {ind.indicator_text}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedIndicator && (
                <div>
                  <Label>Status</Label>
                  <div className="flex gap-2 mt-1">
                    {statusOptions.map(opt => (
                      <Button
                        key={opt.value}
                        variant={status === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatus(opt.value)}
                        className={status === opt.value ? "" : opt.color}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was the child doing?" />
              </div>

              <div>
                <Label>Teacher Note</Label>
                <Textarea value={teacherNote} onChange={e => setTeacherNote(e.target.value)} placeholder="Detailed internal observation..." rows={3} />
              </div>

              <div>
                <Label>Evidence Note</Label>
                <Textarea value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} placeholder="Observable evidence details..." rows={2} />
              </div>

              <div className="border rounded-lg p-3 space-y-3 bg-primary/5">
                <div className="flex items-center justify-between">
                  <Label className="text-primary font-medium">Parent Summary</Label>
                  <Button size="sm" variant="outline" onClick={generateParentSummary} disabled={generatingAI} className="gap-1">
                    {generatingAI ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    AI Generate
                  </Button>
                </div>
                <Textarea value={parentSummary} onChange={e => setParentSummary(e.target.value)} placeholder="Warm, parent-friendly summary..." rows={3} />
              </div>

              <div>
                <Label>Next Step</Label>
                <Input value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="What should we focus on next?" />
              </div>

              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <div className="flex items-center gap-2">
                  <Switch checked={visibleToParent} onCheckedChange={setVisibleToParent} />
                  <Label className="text-sm">Share with parent</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={internalOnly} onCheckedChange={setInternalOnly} />
                  <Label className="text-sm text-muted-foreground">Internal only</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Observation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
