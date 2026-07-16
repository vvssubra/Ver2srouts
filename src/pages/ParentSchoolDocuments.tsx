import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useParentChildren } from "@/hooks/use-parent-children";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import {
  BookOpen, CalendarDays, Receipt, ShieldCheck, FileText, Megaphone, Folder,
  Search, Download, ExternalLink, CheckCircle2, Loader2,
} from "lucide-react";

const CATEGORY_META: Record<string, { label: string; icon: any }> = {
  handbook: { label: "Handbook", icon: BookOpen },
  annual_planner: { label: "Annual Planner", icon: CalendarDays },
  fees: { label: "Fees", icon: Receipt },
  policy: { label: "Policies", icon: ShieldCheck },
  forms: { label: "Forms", icon: FileText },
  newsletter: { label: "Newsletters", icon: Megaphone },
  other: { label: "Other", icon: Folder },
};

export default function ParentSchoolDocuments() {
  const { user } = useAuth();
  const [q, setQ] = useState("");

  const { branchIds } = useParentChildren();

  // Auto-clear bell + push notifications for documents/handbook/fees memos
  // once the parent has landed here — covers in-app, OS-push taps and
  // direct nav.
  useMarkNotificationsRead([
    "school_document_required",
    "school_document",
    "document",
    "handbook",
  ]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["parent-school-docs", branchIds],
    enabled: !!branchIds?.length,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_documents")
        .select("*")
        .in("branch_id", branchIds!)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: acks } = useQuery({
    queryKey: ["parent-school-doc-acks", user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_document_acknowledgements" as any)
        .select("document_id, document_version, acknowledged_at")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data as any[];
    },
  });

  const ackMap = useMemo(() => {
    const m = new Map<string, { acknowledged_at: string; version: string }>();
    for (const a of acks ?? []) m.set(`${a.document_id}:${a.document_version}`, { acknowledged_at: a.acknowledged_at, version: a.document_version });
    return m;
  }, [acks]);

  const filtered = useMemo(() => {
    if (!docs) return [];
    const term = q.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((d) =>
      [d.title, d.description, d.category, d.file_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [docs, q]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const d of filtered) {
      const k = d.category in CATEGORY_META ? d.category : "other";
      (g[k] ||= []).push(d);
    }
    return g;
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">School Documents</h1>
          <p className="text-sm text-muted-foreground">
            Handbooks, policies, forms and other resources from your school.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {isLoading ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : !filtered.length ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
            {q ? "No documents match your search." : "Your school hasn't shared any documents yet."}
          </CardContent></Card>
        ) : (
          Object.entries(CATEGORY_META).map(([key, meta]) => {
            const items = grouped[key];
            if (!items?.length) return null;
            const Icon = meta.icon;
            return (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" /> {meta.label}
                    <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3">
                  {items.map((d) => (
                    <DocumentItem
                      key={d.id}
                      doc={d}
                      ack={ackMap.get(`${d.id}:${d.version}`) ?? null}
                      parentId={user?.id ?? null}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}

function DocumentItem({
  doc, ack, parentId,
}: { doc: any; ack: { acknowledged_at: string; version: string } | null; parentId: string | null }) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const requiresAck = !!doc.is_required_for_onboarding;
  const isAcked = !!ack;

  const ackMutation = useMutation({
    mutationFn: async () => {
      if (!parentId) throw new Error("Not signed in");
      const { error } = await supabase.from("school_document_acknowledgements" as any).insert({
        document_id: doc.id,
        parent_id: parentId,
        document_version: doc.version,
      });
      if (error) throw error;

      // Clear related bell notifications for this document version
      const groupKey = `school-document-required-${doc.id}-v${doc.version}-${parentId}`;
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", parentId)
        .eq("group_key", groupKey);
    },
    onSuccess: () => {
      toast({ title: "Document acknowledged", description: "Thank you for confirming." });
      qc.invalidateQueries({ queryKey: ["parent-school-doc-acks"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-feed"] });
    },
    onError: (e) => {
      toast({ title: "Could not acknowledge", description: friendlyError(e), variant: "destructive" });
    },
  });

  return (
    <div className="rounded-md border p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium break-words flex items-center gap-2 flex-wrap">
            {doc.title}
            {requiresAck && (
              isAcked
                ? <Badge className="text-[10px] bg-accent/20 text-accent border border-accent/30">Acknowledged</Badge>
                : <Badge variant="secondary" className="text-[10px]">Acknowledgement required</Badge>
            )}
          </div>
          {doc.description && (
            <div className="text-xs text-muted-foreground line-clamp-2">{doc.description}</div>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">v{doc.version}</Badge>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={doc.file_url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
          </a>
        </Button>
        <Button size="sm" asChild>
          <a href={doc.file_url} download={doc.file_name ?? undefined}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </a>
        </Button>
      </div>

      {requiresAck && (
        <div className="mt-2 pt-2 border-t">
          {isAcked ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              <span>
                Acknowledged on{" "}
                {new Date(ack!.acknowledged_at).toLocaleString(undefined, {
                  dateStyle: "medium", timeStyle: "short",
                })}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                  className="mt-0.5"
                />
                <span>I confirm that I have read and understood this school document.</span>
              </label>
              <Button
                size="sm"
                disabled={!checked || ackMutation.isPending}
                onClick={() => ackMutation.mutate()}
              >
                {ackMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Acknowledge Document
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}