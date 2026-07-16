import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, ExternalLink, Trash2, Star, Users, ChevronDown, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "handbook", label: "Handbook" },
  { value: "annual_planner", label: "Annual Planner" },
  { value: "fees", label: "Fees" },
  { value: "policy", label: "Policy" },
  { value: "forms", label: "Forms" },
  { value: "newsletter", label: "Newsletter" },
  { value: "other", label: "Other" },
] as const;

export default function SchoolDocumentsAdmin() {
  const { user } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const branchId = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">School Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload and manage documents available to parents in the School Documents hub.
          </p>
        </div>
        {!branchId ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Select a branch first.</CardContent></Card>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all" className="mt-4 space-y-4">
              <UploadCard branchId={branchId} userId={user?.id ?? null} defaultCategory="handbook" />
              <DocList branchId={branchId} category={null} />
            </TabsContent>
            {CATEGORIES.map((c) => (
              <TabsContent key={c.value} value={c.value} className="mt-4 space-y-4">
                <UploadCard branchId={branchId} userId={user?.id ?? null} defaultCategory={c.value} />
                <DocList branchId={branchId} category={c.value} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function UploadCard({ branchId, userId, defaultCategory }: { branchId: string; userId: string | null; defaultCategory: string }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [required, setRequired] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!file || !title.trim()) return toast({ title: "Title and file are required", variant: "destructive" });
    setBusy(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${branchId}/${category}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("school-documents").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      const { data: signed, error: sErr } = await supabase.storage
        .from("school-documents")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      // If handbook + required, deactivate prior active handbook
      if (category === "handbook") {
        await supabase
          .from("school_documents")
          .update({ is_active: false })
          .eq("branch_id", branchId)
          .eq("category", "handbook")
          .eq("is_active", true);
      }
      const { error } = await supabase.from("school_documents").insert({
        branch_id: branchId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        file_url: signed.signedUrl,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        version: version.trim() || "1.0",
        is_active: true,
        is_required_for_onboarding: required,
        uploaded_by: userId,
      });
      if (error) throw error;
      toast({ title: "Document uploaded" });
      setTitle(""); setDescription(""); setVersion("1.0"); setRequired(false); setFile(null);
      qc.invalidateQueries({ queryKey: ["school-docs-admin", branchId] });
      qc.invalidateQueries({ queryKey: ["active-handbook"] });
      qc.invalidateQueries({ queryKey: ["parent-school-docs"] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Upload new document</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch id="required" checked={required} onCheckedChange={setRequired} />
            <Label htmlFor="required" className="text-sm font-normal">Required for parent onboarding</Label>
          </div>
          <div>
            <Label>File *</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <Button onClick={upload} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          Upload
        </Button>
      </CardContent>
    </Card>
  );
}

function DocList({ branchId, category }: { branchId: string; category: string | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["school-docs-admin", branchId, category],
    queryFn: async () => {
      let q = supabase.from("school_documents").select("*").eq("branch_id", branchId);
      if (category) q = q.eq("category", category);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("school_documents").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["school-docs-admin", branchId] });
    qc.invalidateQueries({ queryKey: ["parent-school-docs"] });
  };
  const toggleRequired = async (id: string, current: boolean) => {
    await supabase.from("school_documents").update({ is_required_for_onboarding: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["school-docs-admin", branchId] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await supabase.from("school_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["school-docs-admin", branchId] });
    qc.invalidateQueries({ queryKey: ["parent-school-docs"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !data?.length ? (
          <div className="text-sm text-muted-foreground">No documents yet.</div>
        ) : (
          <div className="space-y-2">
            {data.map((d) => (
              <DocRow
                key={d.id}
                d={d}
                branchId={branchId}
                onToggleActive={() => toggleActive(d.id, d.is_active)}
                onToggleRequired={() => toggleRequired(d.id, d.is_required_for_onboarding)}
                onRemove={() => remove(d.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocRow({
  d, branchId, onToggleActive, onToggleRequired, onRemove,
}: {
  d: any; branchId: string;
  onToggleActive: () => void; onToggleRequired: () => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border text-sm">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate flex items-center gap-2 flex-wrap">
            {d.title}
            <Badge variant="outline" className="text-[10px] capitalize">{String(d.category).replace("_", " ")}</Badge>
            <Badge variant="outline" className="text-[10px]">v{d.version}</Badge>
            {d.is_active && <Badge className="text-[10px]">Active</Badge>}
            {d.is_required_for_onboarding && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                <Star className="h-2.5 w-2.5" />Required
              </Badge>
            )}
          </div>
          {d.description && <div className="text-xs text-muted-foreground truncate">{d.description}</div>}
          <div className="text-[11px] text-muted-foreground">{d.file_name}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {d.is_required_for_onboarding && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} title="Acknowledgement tracking">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Users className="h-4 w-4 ml-1" />
            </Button>
          )}
          <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary p-1"><ExternalLink className="h-4 w-4" /></a>
          <div className="flex items-center gap-1.5" title="Active">
            <Switch checked={d.is_active} onCheckedChange={onToggleActive} />
          </div>
          <div className="flex items-center gap-1.5" title="Required for onboarding">
            <Switch checked={d.is_required_for_onboarding} onCheckedChange={onToggleRequired} />
          </div>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      {expanded && d.is_required_for_onboarding && (
        <AckTracker documentId={d.id} branchId={branchId} version={d.version} />
      )}
    </div>
  );
}

function AckTracker({ documentId, branchId, version }: { documentId: string; branchId: string; version: string }) {
  // Parents required = distinct approved parents who have a child in this branch
  const { data: requiredParents, isLoading: pLoading } = useQuery({
    queryKey: ["sda-required-parents", branchId, documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_students")
        .select("parent_id, students!inner(branch_id), profiles:parent_id(first_name,last_name,email)")
        .eq("status", "approved")
        .eq("students.branch_id", branchId);
      if (error) throw error;
      const seen = new Map<string, any>();
      for (const row of (data ?? []) as any[]) {
        if (!seen.has(row.parent_id)) seen.set(row.parent_id, row.profiles ?? {});
      }
      return Array.from(seen.entries()).map(([id, p]) => ({ parent_id: id, ...p }));
    },
  });

  const { data: acks, isLoading: aLoading } = useQuery({
    queryKey: ["sda-acks", documentId, version],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_document_acknowledgements" as any)
        .select("parent_id, acknowledged_at, document_version")
        .eq("document_id", documentId)
        .eq("document_version", version);
      if (error) throw error;
      return data as any[];
    },
  });

  if (pLoading || aLoading) {
    return <div className="px-3 pb-3 text-xs text-muted-foreground">Loading acknowledgement status…</div>;
  }

  const ackMap = new Map<string, string>();
  for (const a of acks ?? []) ackMap.set(a.parent_id, a.acknowledged_at);
  const total = requiredParents?.length ?? 0;
  const acked = (requiredParents ?? []).filter((p) => ackMap.has(p.parent_id));
  const pending = (requiredParents ?? []).filter((p) => !ackMap.has(p.parent_id));

  return (
    <div className="border-t bg-muted/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Required: <b>{total}</b></div>
        <div className="flex items-center gap-1 text-accent"><CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged: <b>{acked.length}</b></div>
        <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Pending: <b>{pending.length}</b></div>
        <div className="text-muted-foreground">(v{version})</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-semibold text-accent mb-1">Acknowledged</div>
          {acked.length === 0 ? (
            <div className="text-xs text-muted-foreground">No parents have acknowledged yet.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {acked.map((p) => (
                <li key={p.parent_id} className="flex justify-between gap-2">
                  <span className="truncate">{(p.first_name ?? "") + " " + (p.last_name ?? "")} {p.email && <span className="text-muted-foreground">({p.email})</span>}</span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(ackMap.get(p.parent_id)!).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">Pending</div>
          {pending.length === 0 ? (
            <div className="text-xs text-muted-foreground">All parents have acknowledged.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {pending.map((p) => (
                <li key={p.parent_id} className="truncate">
                  {(p.first_name ?? "") + " " + (p.last_name ?? "")} {p.email && <span className="text-muted-foreground">({p.email})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}