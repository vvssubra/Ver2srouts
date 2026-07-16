import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, AlertTriangle, Trophy, BarChart3, Trash2 } from "lucide-react";

const CATEGORIES = [
  { value: "health_safety", label: "Health & Safety" },
  { value: "teacher_quality", label: "Teacher Quality" },
  { value: "curriculum_standards", label: "Curriculum Standards" },
  { value: "facility", label: "Facility" },
  { value: "general", label: "General" },
];

type TempQuestion = { question_text: string; category: string; is_critical: boolean };

export default function QaDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<TempQuestion[]>([]);
  const [newQ, setNewQ] = useState("");
  const [newCat, setNewCat] = useState("health_safety");
  const [newCritical, setNewCritical] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["audit-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_templates").select("*, audit_questions(*)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: audits = [] } = useQuery({
    queryKey: ["branch-audits-all"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_audits").select("*, branches(name), audit_responses(*, audit_questions(is_critical, question_text))").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const completedAudits = audits.filter((a: any) => a.status === "completed");
  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((s: number, a: any) => s + (a.max_score > 0 ? (a.total_score / a.max_score) * 100 : 0), 0) / completedAudits.length)
    : 0;

  const criticalFailures = audits.flatMap((a: any) =>
    (a.audit_responses ?? []).filter((r: any) => r.status === "fail" && r.audit_questions?.is_critical && r.corrective_status === "open")
      .map((r: any) => ({ ...r, branchName: a.branches?.name, auditDate: a.created_at }))
  );

  // Branch leaderboard: latest completed audit per branch
  const branchScores: Record<string, { name: string; score: number; max: number; date: string }> = {};
  completedAudits.forEach((a: any) => {
    const bid = a.branch_id;
    if (!branchScores[bid] || new Date(a.created_at) > new Date(branchScores[bid].date)) {
      branchScores[bid] = { name: a.branches?.name ?? "Unknown", score: a.total_score, max: a.max_score, date: a.created_at };
    }
  });
  const leaderboard = Object.values(branchScores).sort((a, b) => (b.max > 0 ? b.score / b.max : 0) - (a.max > 0 ? a.score / a.max : 0));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: tmpl, error } = await supabase.from("audit_templates").insert({ title, description, created_by: user!.id }).select().single();
      if (error) throw error;
      if (questions.length > 0) {
        const insertRows = questions.map((q, i) => ({
          template_id: tmpl.id,
          question_text: q.question_text,
          category: q.category as "health_safety" | "teacher_quality" | "curriculum_standards" | "facility" | "general",
          is_critical: q.is_critical,
          sort_order: i,
        }));
        const { error: qErr } = await supabase.from("audit_questions").insert(insertRows);
        if (qErr) throw qErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-templates"] });
      setShowCreate(false);
      setTitle(""); setDescription(""); setQuestions([]);
      toast({ title: "Audit template created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addQuestion = () => {
    if (!newQ.trim()) return;
    setQuestions([...questions, { question_text: newQ, category: newCat, is_critical: newCritical }]);
    setNewQ(""); setNewCritical(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">QA & Compliance</h1>
            <p className="text-muted-foreground">Branch quality assurance dashboard</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Compliance Score</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgScore}%</div>
              <Progress value={avgScore} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{audits.length}</div>
              <p className="text-xs text-muted-foreground">{completedAudits.length} completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Critical Failures</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{criticalFailures.length}</div>
              <p className="text-xs text-muted-foreground">Open corrective actions</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-warning0" /> Branch Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No completed audits yet.</p>}
              {leaderboard.map((b, i) => {
                const pct = b.max > 0 ? Math.round((b.score / b.max) * 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{b.name}</span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Critical Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Critical Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {criticalFailures.length === 0 && <p className="text-sm text-muted-foreground">No critical failures.</p>}
              {criticalFailures.slice(0, 10).map((f: any) => (
                <div key={f.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium">{f.audit_questions?.question_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{f.branchName} • {new Date(f.auditDate).toLocaleDateString()}</p>
                  {f.auditor_notes && <p className="text-xs mt-1">Notes: {f.auditor_notes}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Templates list */}
        <Card>
          <CardHeader>
            <CardTitle>Audit Templates</CardTitle>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates created yet.</p>
            ) : (
              <div className="space-y-3">
                {templates.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-sm text-muted-foreground">{t.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t.audit_questions?.length ?? 0} questions</p>
                    </div>
                    <Badge variant="secondary">{t.audit_questions?.filter((q: any) => q.is_critical).length ?? 0} critical</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Template Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Audit Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Facility & Safety Check" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." />
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-semibold">Questions</Label>
                <div className="mt-3 space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border p-2 text-sm">
                      <div className="flex-1">
                        <p>{q.question_text}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{CATEGORIES.find(c => c.value === q.category)?.label}</Badge>
                          {q.is_critical && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3 rounded-lg border p-3 bg-muted/30">
                  <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Question text..." onKeyDown={(e) => e.key === "Enter" && addQuestion()} />
                  <div className="flex flex-wrap gap-3 items-center">
                    <Select value={newCat} onValueChange={setNewCat}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch checked={newCritical} onCheckedChange={setNewCritical} />
                      <Label className="text-sm">Critical</Label>
                    </div>
                    <Button variant="secondary" size="sm" onClick={addQuestion}>Add</Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
