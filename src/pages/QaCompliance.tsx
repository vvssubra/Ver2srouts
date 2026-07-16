import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, XCircle, Upload, Camera, AlertTriangle } from "lucide-react";

export default function QaCompliance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);

  const { data: audits = [] } = useQuery({
    queryKey: ["my-branch-audits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_audits")
        .select("*, branches(name), audit_templates(title), audit_responses(*, audit_questions(question_text, is_critical, category))")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const latestAudit = audits[0];
  const latestScore = latestAudit && latestAudit.max_score > 0
    ? Math.round((latestAudit.total_score / latestAudit.max_score) * 100)
    : null;

  const failedItems = audits.flatMap((a: any) =>
    (a.audit_responses ?? [])
      .filter((r: any) => r.status === "fail" && r.corrective_status !== "accepted")
      .map((r: any) => ({
        ...r,
        auditId: a.id,
        branchId: a.branch_id,
        branchName: a.branches?.name,
        templateTitle: a.audit_templates?.title,
        auditDate: a.created_at,
      }))
  );

  const uploadProof = async (responseId: string, file: File, branchId: string) => {
    setUploading(responseId);
    const path = `${branchId}/corrective/${Date.now()}_${file.name}`;
    let url: string;
    try {
      const { uploadAndSign } = await import("@/lib/storage/signedUrl");
      url = await uploadAndSign("audit-evidence", path, file);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
      setUploading(null);
      return;
    }
    const { error: uErr } = await supabase.from("audit_responses").update({
      corrective_proof_url: url,
      corrective_status: "resolved",
      resolved_at: new Date().toISOString(),
    }).eq("id", responseId);

    if (uErr) { toast({ title: "Error", description: uErr.message, variant: "destructive" }); }
    else {
      toast({ title: "Proof uploaded, marked as resolved" });
      qc.invalidateQueries({ queryKey: ["my-branch-audits"] });
    }
    setUploading(null);
  };

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = { health_safety: "Health & Safety", teacher_quality: "Teacher Quality", curriculum_standards: "Curriculum Standards", facility: "Facility", general: "General" };
    return map[cat] || cat;
  };

  const statusBadge = (s: string) => {
    if (s === "open") return <Badge variant="destructive">Open</Badge>;
    if (s === "resolved") return <Badge className="bg-warning/100 text-white">Resolved - Pending Review</Badge>;
    return <Badge className="bg-success/20 text-white">Accepted</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
          <p className="text-muted-foreground">View audit results and resolve corrective actions</p>
        </div>

        {/* Latest Score */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Latest Audit Score</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {latestScore !== null ? (
                <>
                  <div className="text-3xl font-bold">{latestScore}%</div>
                  <Progress value={latestScore} className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">{latestAudit.audit_templates?.title}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No audits yet</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{audits.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{failedItems.filter((f: any) => f.corrective_status === "open").length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Audit History */}
        <Card>
          <CardHeader><CardTitle>Audit History</CardTitle></CardHeader>
          <CardContent>
            {audits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audits conducted yet.</p>
            ) : (
              <div className="space-y-3">
                {audits.map((a: any) => {
                  const pct = a.max_score > 0 ? Math.round((a.total_score / a.max_score) * 100) : 0;
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{a.audit_templates?.title}</p>
                        <p className="text-sm text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{pct}%</p>
                        <Badge variant={a.status === "completed" ? "default" : "secondary"}>{a.status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Corrective Actions */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Corrective Actions Required</CardTitle></CardHeader>
          <CardContent>
            {failedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No corrective actions required. Great job!</p>
            ) : (
              <div className="space-y-4">
                {failedItems.map((item: any) => (
                  <div key={item.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{item.audit_questions?.question_text}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">{categoryLabel(item.audit_questions?.category)}</Badge>
                          {item.audit_questions?.is_critical && <Badge variant="destructive" className="text-xs">Critical</Badge>}
                          {statusBadge(item.corrective_status)}
                        </div>
                        {item.auditor_notes && <p className="text-sm text-muted-foreground mt-2">Notes: {item.auditor_notes}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{item.templateTitle} • {new Date(item.auditDate).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {item.corrective_proof_url && (
                      <div>
                        <Label className="text-xs">Uploaded Proof:</Label>
                        <img src={item.corrective_proof_url} alt="Corrective proof" className="mt-1 rounded-lg max-h-32 object-cover" />
                      </div>
                    )}

                    {item.corrective_status === "open" && (
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed p-3 hover:bg-muted/50 transition-colors">
                        <Camera className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {uploading === item.id ? "Uploading..." : "Upload proof & mark as resolved"}
                        </span>
                        <input type="file" accept="image/*" className="hidden" disabled={uploading === item.id}
                          onChange={(e) => e.target.files?.[0] && uploadProof(item.id, e.target.files[0], item.branchId)} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
