import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Upload, FileText, BookOpen, Trash2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ParentOnboardingAdmin() {
  const { user } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const branchId = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Parent Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Manage the Terms &amp; Conditions and School Handbook shown in the parent first-run wizard.
          </p>
        </div>
        <Tabs defaultValue="tnc">
          <TabsList>
            <TabsTrigger value="tnc" className="gap-1.5">
              <FileText className="h-4 w-4" /> Terms &amp; Conditions
            </TabsTrigger>
            <TabsTrigger value="handbook" className="gap-1.5">
              <BookOpen className="h-4 w-4" /> School Handbook
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tnc" className="mt-4">
            <TncManager branchId={branchId} userId={user?.id ?? null} />
          </TabsContent>
          <TabsContent value="handbook" className="mt-4">
            <HandbookManager branchId={branchId} userId={user?.id ?? null} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function TncManager({ branchId, userId }: { branchId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const { data: versions, isLoading } = useQuery({
    queryKey: ["tnc-versions-admin", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tnc_versions")
        .select("*")
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const active = useMemo(() => versions?.find((v) => v.is_active) ?? null, [versions]);
  const [title, setTitle] = useState("Terms & Conditions");
  const [version, setVersion] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (active) {
      setTitle(active.title ?? "Terms & Conditions");
      setContent(active.content_md ?? "");
      setVersion("");
    }
  }, [active?.id]);

  const publishNew = async () => {
    if (!branchId) return toast({ title: "Select a branch first", variant: "destructive" });
    if (!version.trim() || !content.trim())
      return toast({ title: "Version and content are required", variant: "destructive" });
    setSaving(true);
    try {
      await supabase
        .from("tnc_versions")
        .update({ is_active: false })
        .eq("branch_id", branchId)
        .eq("is_active", true);
      const { error } = await supabase.from("tnc_versions").insert({
        branch_id: branchId,
        title,
        version: version.trim(),
        content_md: content,
        is_active: true,
        created_by: userId,
      });
      if (error) throw error;
      toast({ title: "New T&C version published" });
      setVersion("");
      qc.invalidateQueries({ queryKey: ["tnc-versions-admin", branchId] });
      qc.invalidateQueries({ queryKey: ["active-tnc"] });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveInPlace = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tnc_versions")
        .update({ title, content_md: content })
        .eq("id", active.id);
      if (error) throw error;
      toast({ title: "T&C updated" });
      qc.invalidateQueries({ queryKey: ["tnc-versions-admin", branchId] });
      qc.invalidateQueries({ queryKey: ["active-tnc"] });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!branchId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a branch to manage its Terms &amp; Conditions.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Active version
            {active ? (
              <Badge variant="outline">v{active.version}</Badge>
            ) : (
              <Badge variant="secondary">None — using default text</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Content (Markdown supported)</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              placeholder="## Terms & Conditions..."
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label>New version label (e.g. 2026-06)</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026-06" />
            </div>
            <div className="flex gap-2">
              {active && (
                <Button variant="outline" onClick={saveInPlace} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save edits
                </Button>
              )}
              <Button onClick={publishNew} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Publish new version
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Publishing a new version archives the previous one and requires parents to re-accept on next sign-in.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !versions?.length ? (
            <div className="text-sm text-muted-foreground">No versions yet.</div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={v.is_active ? "default" : "outline"}>v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(v.effective_from).toLocaleDateString()}
                    </span>
                    {v.branch_id === null && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{v.title}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HandbookManager({ branchId, userId }: { branchId: string | null; userId: string | null }) {
  const qc = useQueryClient();
  const { data: handbooks, isLoading } = useQuery({
    queryKey: ["handbooks-admin", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_documents")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("category", "handbook")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    if (!branchId || !file || !title.trim())
      return toast({ title: "Title and file are required", variant: "destructive" });
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${branchId}/handbook/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("school-documents").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      const { data: signed, error: sErr } = await supabase.storage
        .from("school-documents")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      // Mark prior handbooks inactive
      await supabase
        .from("school_documents")
        .update({ is_active: false })
        .eq("branch_id", branchId)
        .eq("category", "handbook")
        .eq("is_active", true);
      const { error: insErr } = await supabase.from("school_documents").insert({
        branch_id: branchId,
        category: "handbook",
        title: title.trim(),
        version: version.trim() || "1.0",
        file_url: signed.signedUrl,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        is_active: true,
        is_required_for_onboarding: true,
        uploaded_by: userId,
      });
      if (insErr) throw insErr;
      toast({ title: "Handbook uploaded" });
      setFile(null);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["handbooks-admin", branchId] });
      qc.invalidateQueries({ queryKey: ["active-handbook"] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    if (!current && branchId) {
      await supabase
        .from("school_documents")
        .update({ is_active: false })
        .eq("branch_id", branchId)
        .eq("category", "handbook")
        .eq("is_active", true);
    }
    await supabase.from("school_documents").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["handbooks-admin", branchId] });
    qc.invalidateQueries({ queryKey: ["active-handbook"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this handbook?")) return;
    await supabase.from("school_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["handbooks-admin", branchId] });
  };

  if (!branchId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a branch to manage its handbook.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload new handbook (PDF)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Parent Handbook 2026" />
            </div>
            <div>
              <Label>Version</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
            </div>
          </div>
          <div>
            <Label>File (PDF) *</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={upload} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Upload & set active
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Handbooks</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !handbooks?.length ? (
            <div className="text-sm text-muted-foreground">No handbooks uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              {handbooks.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {h.title}
                      <Badge variant="outline" className="text-[10px]">v{h.version}</Badge>
                      {h.is_active && <Badge className="text-[10px]">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{h.file_name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={h.file_url} target="_blank" rel="noreferrer" className="text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={h.is_active} onCheckedChange={() => toggleActive(h.id, h.is_active)} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(h.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}