import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, MinusCircle, ChevronRight, ChevronLeft, Upload, Camera } from "lucide-react";

type ResponseData = { question_id: string; status: string; auditor_notes: string; photo_evidence_url: string };

export default function QaFieldAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"select" | "audit" | "done">("select");
  const [branchId, setBranchId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, ResponseData>>({});
  const [uploading, setUploading] = useState(false);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["audit-templates-list"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_templates").select("id, title").order("title");
      return data ?? [];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["audit-questions", templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data } = await supabase.from("audit_questions").select("*").eq("template_id", templateId).order("sort_order");
      return data ?? [];
    },
    enabled: !!templateId,
  });

  const currentQ = questions[currentIdx];
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(responses).length;
  const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const score = useMemo(() => {
    let total = 0, max = 0;
    questions.forEach((q: any) => {
      const r = responses[q.id];
      if (r && r.status !== "na") {
        max++;
        if (r.status === "pass") total++;
      }
    });
    return { total, max };
  }, [responses, questions]);

  const setResponse = (qId: string, field: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] || { question_id: qId, status: "na", auditor_notes: "", photo_evidence_url: "" }), [field]: value },
    }));
  };

  const handlePhotoUpload = async (qId: string, file: File) => {
    setUploading(true);
    const path = `${branchId}/${Date.now()}_${file.name}`;
    try {
      const { uploadAndSign } = await import("@/lib/storage/signedUrl");
      const url = await uploadAndSign("audit-evidence", path, file);
      setResponse(qId, "photo_evidence_url", url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: audit, error: aErr } = await supabase.from("branch_audits").insert({
        branch_id: branchId,
        auditor_id: user!.id,
        template_id: templateId,
        status: "completed",
        total_score: score.total,
        max_score: score.max,
        completed_at: new Date().toISOString(),
      }).select().single();
      if (aErr) throw aErr;

      const rows = questions.map((q: any) => {
        const r = responses[q.id] || { status: "na", auditor_notes: "", photo_evidence_url: "" };
        return {
          audit_id: audit.id,
          question_id: q.id,
          status: r.status,
          auditor_notes: r.auditor_notes || null,
          photo_evidence_url: r.photo_evidence_url || null,
          corrective_action: r.status === "fail" ? r.auditor_notes : null,
          corrective_status: r.status === "fail" ? "open" : "open",
        };
      });
      const { error: rErr } = await supabase.from("audit_responses").insert(rows);
      if (rErr) throw rErr;
    },
    onSuccess: () => { setStep("done"); toast({ title: "Audit submitted successfully" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = { health_safety: "Health & Safety", teacher_quality: "Teacher Quality", curriculum_standards: "Curriculum Standards", facility: "Facility", general: "General" };
    return map[cat] || cat;
  };

  const startAudit = () => {
    if (!branchId || !templateId) { toast({ title: "Select branch and template" }); return; }
    setResponses({}); setCurrentIdx(0); setStep("audit");
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Field Audit Tool</h1>

        {step === "select" && (
          <Card>
            <CardHeader><CardTitle>Start New Audit</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Choose branch..." /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Select Audit Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Choose template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {templateId && <p className="text-sm text-muted-foreground">{questions.length} questions loaded</p>}
              <Button onClick={startAudit} disabled={!branchId || !templateId || questions.length === 0} className="w-full">
                Start Audit <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "audit" && currentQ && (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Question {currentIdx + 1} of {totalQuestions}</span>
                <span>{progressPct}% complete</span>
              </div>
              <Progress value={progressPct} />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{categoryLabel(currentQ.category)}</Badge>
                  {currentQ.is_critical && <Badge variant="destructive">Critical</Badge>}
                </div>
                <CardTitle className="text-lg mt-2">{currentQ.question_text}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {[
                    { val: "pass", label: "Pass", icon: CheckCircle2, cls: "border-success/200 bg-success/100/10 text-success" },
                    { val: "fail", label: "Fail", icon: XCircle, cls: "border-destructive bg-destructive/10 text-destructive" },
                    { val: "na", label: "N/A", icon: MinusCircle, cls: "border-muted-foreground bg-muted text-muted-foreground" },
                  ].map((opt) => {
                    const active = responses[currentQ.id]?.status === opt.val;
                    return (
                      <Button
                        key={opt.val}
                        variant="outline"
                        className={`flex-1 h-14 text-base ${active ? opt.cls + " border-2" : ""}`}
                        onClick={() => setResponse(currentQ.id, "status", opt.val)}
                      >
                        <opt.icon className="mr-2 h-5 w-5" /> {opt.label}
                      </Button>
                    );
                  })}
                </div>

                {responses[currentQ.id]?.status === "fail" && (
                  <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 animate-in slide-in-from-top-2">
                    <div>
                      <Label>Corrective Action Notes *</Label>
                      <Textarea
                        value={responses[currentQ.id]?.auditor_notes || ""}
                        onChange={(e) => setResponse(currentQ.id, "auditor_notes", e.target.value)}
                        placeholder="Describe what needs to be fixed..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Photo Evidence</Label>
                      <div className="mt-1">
                        {responses[currentQ.id]?.photo_evidence_url ? (
                          <div className="space-y-2">
                            <img src={responses[currentQ.id].photo_evidence_url} alt="Evidence" className="rounded-lg max-h-40 object-cover" />
                            <Button variant="outline" size="sm" onClick={() => setResponse(currentQ.id, "photo_evidence_url", "")}>Remove</Button>
                          </div>
                        ) : (
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed p-4 hover:bg-muted/50 transition-colors">
                            <Camera className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{uploading ? "Uploading..." : "Upload photo"}</span>
                            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading}
                              onChange={(e) => e.target.files?.[0] && handlePhotoUpload(currentQ.id, e.target.files[0])} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="outline" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  {currentIdx < totalQuestions - 1 ? (
                    <Button onClick={() => setCurrentIdx(currentIdx + 1)} disabled={!responses[currentQ.id]?.status || (responses[currentQ.id]?.status === "fail" && !responses[currentQ.id]?.auditor_notes)}>
                      Next <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || answeredCount < totalQuestions}>
                      {submitMutation.isPending ? "Submitting..." : "Submit Audit"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {step === "done" && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-success0 mx-auto" />
              <h2 className="text-2xl font-bold">Audit Complete</h2>
              <p className="text-lg">Score: {score.total} / {score.max} ({score.max > 0 ? Math.round((score.total / score.max) * 100) : 0}%)</p>
              <Button onClick={() => { setStep("select"); setBranchId(""); setTemplateId(""); }}>Start Another Audit</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
