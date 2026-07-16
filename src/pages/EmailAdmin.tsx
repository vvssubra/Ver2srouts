import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import EmailSettingsCard from "@/components/EmailSettingsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Mail, Send, RotateCcw, Loader2, Globe, Building2, FileText, ListChecks,
  CheckCircle2, AlertCircle, RefreshCcw, ChevronLeft, FileUp, ExternalLink, Trash2,
  FolderOpen, Plus, Search, Copy as CopyIcon, Pencil, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBranches } from "@/hooks/use-branches";
import { formatDistanceToNow } from "date-fns";

type Category = "parents" | "finance" | "staff";
type Section = "sender" | "branch" | "templates" | "documents" | "log";

interface TemplateMeta {
  templateName: string;
  displayName: string;
  category: Category;
  defaultSubject: string;
}

const CATALOG: TemplateMeta[] = [
  { templateName: "parent-welcome-kit", displayName: "Parent Welcome Kit", category: "parents", defaultSubject: "Welcome to {branchName}" },
  { templateName: "parent-password-reset", displayName: "Parent Password Reset", category: "parents", defaultSubject: "Reset your Sprouts password" },
  { templateName: "parent-ptm-status", displayName: "PTM Status", category: "parents", defaultSubject: "Your parent–teacher meeting" },
  { templateName: "moments-digest", displayName: "Daily Moments Digest", category: "parents", defaultSubject: "{momentCount} new moments today" },
  { templateName: "learning-story-ready", displayName: "Learning Story Ready", category: "parents", defaultSubject: "{childName}'s learning story is ready" },
  { templateName: "school-announcement", displayName: "School Announcement", category: "parents", defaultSubject: "{branchName}: {announcementTitle}" },
  { templateName: "chat-message-missed", displayName: "Missed Chat Message", category: "parents", defaultSubject: "{senderName} sent you a message" },
  { templateName: "invoice-issued", displayName: "Invoice Issued", category: "finance", defaultSubject: "Invoice {invoiceNumber} is ready" },
  { templateName: "invoice-receipt", displayName: "Invoice Receipt", category: "finance", defaultSubject: "Payment received" },
  { templateName: "payment-reminder", displayName: "Payment Reminder", category: "finance", defaultSubject: "Reminder: {invoiceNumber}" },
  { templateName: "payslip-published", displayName: "Payslip Published", category: "staff", defaultSubject: "Your {period} payslip is ready" },
  { templateName: "ot-request-status", displayName: "OT Request Status", category: "staff", defaultSubject: "OT request {status}" },
  { templateName: "claim-status", displayName: "Claim Status", category: "staff", defaultSubject: "Claim {status}" },
  { templateName: "leave-status", displayName: "Leave Status", category: "staff", defaultSubject: "Leave {status}" },
  { templateName: "approval-pending", displayName: "Approval Pending (Approver)", category: "staff", defaultSubject: "{requestType} awaiting your approval" },
  { templateName: "staff-welcome", displayName: "Staff Welcome", category: "staff", defaultSubject: "Welcome to Sprouts" },
  { templateName: "enrollment-status", displayName: "Enrolment Status Update", category: "parents", defaultSubject: "Enrolment update" },
  { templateName: "child-absent", displayName: "Child Absent Alert", category: "parents", defaultSubject: "Your child was marked absent" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  parents: "Parents",
  finance: "Finance",
  staff: "Staff",
};

const SECTION_LABEL: Record<Section, string> = {
  sender: "Sender",
  branch: "Branch branding",
  templates: "Templates",
  documents: "Documents",
  log: "Delivery log",
};

const SECTION_ICON: Record<Section, React.ElementType> = {
  sender: Globe,
  branch: Building2,
  templates: FileText,
  documents: FolderOpen,
  log: ListChecks,
};

const DOC_CATEGORIES = [
  { value: "parent", label: "Parent" },
  { value: "staff", label: "Staff" },
  { value: "finance", label: "Finance" },
  { value: "compliance", label: "Compliance" },
  { value: "other", label: "Other" },
] as const;
type DocCategory = (typeof DOC_CATEGORIES)[number]["value"];

export default function EmailAdmin() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { branches } = useBranches();

  const isSuperAdmin = role === "super_admin" || role === "franchisee";

  const initialSection = (params.get("tab") as Section) || (isSuperAdmin ? "sender" : "branch");
  const [section, setSection] = useState<Section>(initialSection);

  useEffect(() => {
    const t = params.get("tab") as Section | null;
    if (t && t !== section) setSection(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const goSection = (v: Section) => {
    setSection(v);
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  const initialBranch = params.get("branch") || "";
  const [selectedBranch, setSelectedBranch] = useState<string>(initialBranch);
  useEffect(() => {
    if (!selectedBranch && branches.length > 0) setSelectedBranch(branches[0].id);
  }, [branches, selectedBranch]);

  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings", selectedBranch],
    enabled: !!selectedBranch && section === "branch",
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_settings").select("*").eq("branch_id", selectedBranch).maybeSingle();
      return data;
    },
  });

  // Global settings
  const { data: globalSettings, refetch: refetchGlobal } = useQuery({
    queryKey: ["email-global-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_global_settings").select("*").eq("singleton", true).maybeSingle();
      return data;
    },
  });
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  useEffect(() => {
    if (globalSettings) {
      setFromName(globalSettings.from_name || "");
      setFromEmail((globalSettings as any).from_email || "");
      setReplyTo(globalSettings.reply_to_email || "");
      setSupportEmail(globalSettings.support_email || "");
    }
  }, [globalSettings]);
  const senderDirty =
    globalSettings && (
      fromName !== (globalSettings.from_name || "") ||
      fromEmail !== ((globalSettings as any).from_email || "") ||
      replyTo !== (globalSettings.reply_to_email || "") ||
      supportEmail !== (globalSettings.support_email || "")
    );

  const saveGlobal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_global_settings")
        .update({
          from_name: fromName || "Sprouts",
          from_email: fromEmail || "onboarding@resend.dev",
          reply_to_email: replyTo || null,
          support_email: supportEmail || null,
          updated_by: user?.id,
        } as any)
        .eq("singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Sender settings updated." });
      refetchGlobal();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Master enable/disable switch — pauses all outgoing transactional emails.
  const emailsEnabled = ((globalSettings as any)?.emails_enabled ?? true) as boolean;
  const toggleMasterEmails = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("email_global_settings")
        .update({ emails_enabled: enabled, updated_by: user?.id } as any)
        .eq("singleton", true);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      toast({
        title: enabled ? "Emails resumed" : "Emails paused",
        description: enabled
          ? "Transactional emails are sending again."
          : "All outgoing transactional emails are paused until you re-enable.",
      });
      refetchGlobal();
    },
    onError: (e: any) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  // Template overrides
  const { data: overrides = {} } = useQuery({
    queryKey: ["email-template-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_template_overrides")
        .select("template_name, enabled, subject, content_overrides, attached_document_ids");
      if (error) throw error;
      const map: Record<string, any> = {};
      (data ?? []).forEach((r: any) => (map[r.template_name] = r));
      return map;
    },
  });

  const [activeTemplate, setActiveTemplate] = useState<string>(CATALOG[0].templateName);

  const toggleEnabled = useMutation({
    mutationFn: async ({ templateName, enabled }: { templateName: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("email_template_overrides")
        .upsert({ template_name: templateName, enabled, updated_by: user?.id }, { onConflict: "template_name" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-template-overrides"] }),
  });

  const sendTestRaw = async (templateName: string, recipient?: string) => {
    const to = recipient || user?.email;
    if (!to) {
      toast({ title: "No email on profile", variant: "destructive" });
      return;
    }
    // Send sample data so admins see how the rendered email looks for templates
    // that depend on runtime values (passwords, names, urls). Real sends always
    // pass the actual templateData from the trigger.
    const SAMPLE: Record<string, Record<string, unknown>> = {
      "parent-welcome-kit": {
        parentName: "Aisha",
        childName: "Ahmad",
        branchName: "Sprouts",
        loginEmail: to,
        tempPassword: "Sp9!tK2mQp4x",
        loginUrl: `${window.location.origin}/auth`,
      },
      "parent-password-reset": {
        parentName: "Aisha",
        resetUrl: `${window.location.origin}/reset-password?token=sample`,
      },
    };
    const templateData = SAMPLE[templateName] ?? {};
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: to,
        idempotencyKey: `test-${templateName}-${Date.now()}`,
        templateData,
      },
    });
    if (error) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    } else if ((data as any)?.success) {
      toast({ title: "Delivered to Resend", description: `Sent to ${to}` });
    } else {
      toast({ title: "Send failed", description: JSON.stringify(data), variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="container max-w-6xl py-6 space-y-6">
        <Header
          isSuperAdmin={isSuperAdmin}
          emailsEnabled={emailsEnabled}
          onToggleEmails={(v) => toggleMasterEmails.mutate(v)}
          toggling={toggleMasterEmails.isPending}
        />

        {/* Section nav: dropdown on mobile, sidebar on desktop */}
        <div className="md:hidden">
          <Select value={section} onValueChange={(v) => goSection(v as Section)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SECTION_LABEL) as Section[]).map((s) => {
                if (s === "sender" && !isSuperAdmin) return null;
                const Icon = SECTION_ICON[s];
                return (
                  <SelectItem key={s} value={s}>
                    <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" />{SECTION_LABEL[s]}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid md:grid-cols-[200px_1fr] gap-6">
          <nav className="hidden md:flex flex-col gap-1">
            {(Object.keys(SECTION_LABEL) as Section[]).map((s) => {
              if (s === "sender" && !isSuperAdmin) return null;
              const Icon = SECTION_ICON[s];
              const active = section === s;
              return (
                <button
                  key={s}
                  onClick={() => goSection(s)}
                  className={
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left " +
                    (active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted")
                  }
                >
                  <Icon className="h-4 w-4" />{SECTION_LABEL[s]}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 space-y-4">
            {section === "sender" && isSuperAdmin && (
              <SenderPanel
                  fromName={fromName} setFromName={setFromName}
                  fromEmail={fromEmail} setFromEmail={setFromEmail}
                  replyTo={replyTo} setReplyTo={setReplyTo}
                  supportEmail={supportEmail} setSupportEmail={setSupportEmail}
                  dirty={!!senderDirty}
                  saving={saveGlobal.isPending}
                  onSave={() => saveGlobal.mutate()}
                  onTest={() => sendTestRaw("parent-welcome-kit")}
              />
            )}

            {section === "branch" && (
              <BranchPanel
                branches={branches}
                selectedBranch={selectedBranch}
                setSelectedBranch={setSelectedBranch}
                branchSettings={branchSettings}
              />
            )}

            {section === "templates" && (
              <TemplatesPanel
                catalog={CATALOG}
                overrides={overrides}
                activeTemplate={activeTemplate}
                setActiveTemplate={setActiveTemplate}
                onToggle={(name, enabled) => toggleEnabled.mutate({ templateName: name, enabled })}
                onTest={(name) => sendTestRaw(name)}
                onChanged={() => qc.invalidateQueries({ queryKey: ["email-template-overrides"] })}
                userId={user?.id}
              />
            )}

            {section === "documents" && (
              <DocumentsPanel userId={user?.id} />
            )}

            {section === "log" && <DeliveryLogPanel />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Header({
  isSuperAdmin,
  emailsEnabled,
  onToggleEmails,
  toggling,
}: {
  isSuperAdmin: boolean;
  emailsEnabled: boolean;
  onToggleEmails: (v: boolean) => void;
  toggling: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email</h1>
          <p className="text-sm text-muted-foreground">Sender, branding, and notification templates.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isSuperAdmin && (
          <div
            className={
              "hidden sm:flex items-center gap-2 rounded-lg border px-3 py-1.5 " +
              (emailsEnabled
                ? "border-success/25 bg-success/10"
                : "border-warning/25 bg-warning/10")
            }
            title={
              emailsEnabled
                ? "All outgoing emails are sending."
                : "All outgoing emails are paused."
            }
          >
            <span className="text-xs font-medium text-foreground">
              {emailsEnabled ? "Emails on" : "Emails paused"}
            </span>
            <Switch
              checked={emailsEnabled}
              disabled={toggling}
              onCheckedChange={onToggleEmails}
            />
          </div>
        )}
        <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-success" /> Resend
        </Badge>
      </div>
    </div>
  );
}

/* ────────────────────────── Sender ────────────────────────── */

function SenderPanel(props: {
  fromName: string; setFromName: (v: string) => void;
  fromEmail: string; setFromEmail: (v: string) => void;
  replyTo: string; setReplyTo: (v: string) => void;
  supportEmail: string; setSupportEmail: (v: string) => void;
  dirty: boolean; saving: boolean;
  onSave: () => void; onTest: () => void;
}) {
  const isSandbox = props.fromEmail.trim().toLowerCase() === "onboarding@resend.dev";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sender</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="From name">
            <Input value={props.fromName} onChange={(e) => props.setFromName(e.target.value)} placeholder="Sprouts" />
          </Field>
          <Field label="From email" hint={isSandbox ? "Using Resend sandbox — verify your domain in Resend for branded sends." : undefined}>
            <Input value={props.fromEmail} onChange={(e) => props.setFromEmail(e.target.value)} placeholder="noreply@yourdomain.com" />
          </Field>
          <Field label="Reply-to">
            <Input type="email" value={props.replyTo} onChange={(e) => props.setReplyTo(e.target.value)} placeholder="hello@yourdomain.com" />
          </Field>
          <Field label="Support email (shown in footer)">
            <Input type="email" value={props.supportEmail} onChange={(e) => props.setSupportEmail(e.target.value)} placeholder="hello@yourdomain.com" />
          </Field>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={props.onSave} disabled={!props.dirty || props.saving}>
            {props.saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Save
          </Button>
          <Button variant="outline" onClick={props.onTest}><Send className="h-4 w-4 mr-1" />Send test</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ──────────────────────── Welcome Kit PDF ──────────────────────── */

function WelcomeKitPanel({
  currentUrl,
  userId,
  onChanged,
}: {
  currentUrl: string;
  userId?: string;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Please pick a .pdf file.", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 25 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const path = `welcome-kit/parent-welcome-kit-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { contentType: "application/pdf", upsert: false, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("email_global_settings")
        .update({ welcome_kit_url: url, updated_by: userId } as any)
        .eq("singleton", true);
      if (updErr) throw updErr;
      toast({ title: "Welcome Kit updated", description: "New PDF is now used in emails." });
      onChanged();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove the custom Welcome Kit PDF? Emails will fall back to the bundled default.")) return;
    const { error } = await supabase
      .from("email_global_settings")
      .update({ welcome_kit_url: null, updated_by: userId } as any)
      .eq("singleton", true);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed", description: "Custom Welcome Kit URL cleared." });
    onChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileUp className="h-4 w-4" /> Parent Welcome Kit PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This PDF is linked from the Parent Welcome Kit email. Upload a new file to replace it instantly — no redeploy needed.
        </p>
        {currentUrl ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between gap-2">
            <a href={currentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline truncate">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{currentUrl.split("/").pop()}</span>
            </a>
            <Button variant="ghost" size="sm" onClick={handleRemove} className="text-destructive hover:text-destructive shrink-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
            No custom PDF uploaded — using bundled default.
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="application/pdf"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.currentTarget.value = "";
            }}
            className="max-w-sm"
          />
          {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────── Branch ────────────────────────── */

function BranchPanel(props: {
  branches: any[];
  selectedBranch: string;
  setSelectedBranch: (v: string) => void;
  branchSettings: any;
}) {
  const current = props.branches.find((b) => b.id === props.selectedBranch);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Branch</Label>
          <Select value={props.selectedBranch} onValueChange={props.setSelectedBranch}>
            <SelectTrigger className="mt-1.5 max-w-md"><SelectValue placeholder="Pick a branch" /></SelectTrigger>
            <SelectContent>
              {props.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      {props.selectedBranch && (
        <EmailSettingsCard
          branchId={props.selectedBranch}
          branchName={current?.name || ""}
          branchSettings={props.branchSettings}
        />
      )}
    </div>
  );
}

/* ────────────────────────── Templates ────────────────────────── */

function TemplatesPanel(props: {
  catalog: TemplateMeta[];
  overrides: Record<string, any>;
  activeTemplate: string;
  setActiveTemplate: (v: string) => void;
  onToggle: (name: string, enabled: boolean) => void;
  onTest: (name: string) => void;
  onChanged: () => void;
  userId?: string;
}) {
  const [filter, setFilter] = useState<"all" | Category>("all");
  const filtered = props.catalog.filter((t) => filter === "all" || t.category === filter);

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4">
      <Card className="md:max-h-[640px] md:overflow-y-auto">
        <CardContent className="p-2 space-y-1">
          <div className="px-1 pb-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="parents">Parents</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtered.map((t) => {
            const ov = props.overrides[t.templateName];
            const enabled = ov?.enabled ?? true;
            const customized = ov && (ov.subject || Object.keys(ov.content_overrides ?? {}).length > 0);
            const active = props.activeTemplate === t.templateName;
            return (
              <button
                key={t.templateName}
                onClick={() => props.setActiveTemplate(t.templateName)}
                className={
                  "w-full text-left px-2 py-2 rounded-md flex items-center gap-2 transition-colors " +
                  (active ? "bg-primary/10" : "hover:bg-muted")
                }
              >
                <span className={"h-2 w-2 rounded-full shrink-0 " + (enabled ? "bg-success/100" : "bg-muted-foreground/40")} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{t.displayName}</span>
                  <span className="block text-[11px] text-muted-foreground uppercase tracking-wide">{CATEGORY_LABEL[t.category]}</span>
                </span>
                {customized && <Badge variant="outline" className="text-[10px]">edited</Badge>}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <TemplateEditor
        key={props.activeTemplate}
        meta={props.catalog.find((t) => t.templateName === props.activeTemplate)!}
        override={props.overrides[props.activeTemplate]}
        onToggle={(enabled) => props.onToggle(props.activeTemplate, enabled)}
        onTest={() => props.onTest(props.activeTemplate)}
        onChanged={props.onChanged}
        userId={props.userId}
      />
    </div>
  );
}

function TemplateEditor({
  meta, override, onToggle, onTest, onChanged, userId,
}: {
  meta: TemplateMeta;
  override: any;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onChanged: () => void;
  userId?: string;
}) {
  const [subject, setSubject] = useState<string>(override?.subject ?? "");
  const [fields, setFields] = useState<Record<string, string>>(override?.content_overrides ?? {});
  const [docIds, setDocIds] = useState<string[]>(override?.attached_document_ids ?? []);
  const enabled = override?.enabled ?? true;

  // Live preview
  const previewQuery = useQuery({
    queryKey: ["email-preview", meta.templateName, subject, fields],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("render-email-preview", {
        body: { templateName: meta.templateName, templateData: {} },
      });
      if (error) throw error;
      return data as { html: string; subject: string };
    },
    staleTime: 5_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim().length > 0));
      const { error } = await supabase
        .from("email_template_overrides")
        .upsert({
          template_name: meta.templateName,
          subject: subject.trim() || null,
          content_overrides: cleaned,
          attached_document_ids: docIds,
          updated_by: userId,
        } as any, { onConflict: "template_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      onChanged();
      previewQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_template_overrides")
        .delete()
        .eq("template_name", meta.templateName);
      if (error) throw error;
    },
    onSuccess: () => {
      setSubject("");
      setFields({});
      setDocIds([]);
      toast({ title: "Reverted to default" });
      onChanged();
      previewQuery.refetch();
    },
  });

  const dirty =
    (subject ?? "") !== (override?.subject ?? "") ||
    JSON.stringify(fields) !== JSON.stringify(override?.content_overrides ?? {}) ||
    JSON.stringify(docIds) !== JSON.stringify(override?.attached_document_ids ?? []);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base truncate">{meta.displayName}</CardTitle>
          <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[meta.category]}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? "On" : "Off"}</span>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={meta.defaultSubject} />
        </Field>
        <Field label="Intro paragraph">
          <Textarea rows={3} value={fields.intro ?? ""} onChange={(e) => setFields({ ...fields, intro: e.target.value })} placeholder="(use default)" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="CTA button label">
            <Input value={fields.ctaLabel ?? ""} onChange={(e) => setFields({ ...fields, ctaLabel: e.target.value })} placeholder="(default)" />
          </Field>
          <Field label="Signoff">
            <Input value={fields.signoff ?? ""} onChange={(e) => setFields({ ...fields, signoff: e.target.value })} placeholder="(default)" />
          </Field>
        </div>

        <AttachedDocsPicker value={docIds} onChange={setDocIds} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Save
          </Button>
          <Button variant="outline" onClick={onTest}><Send className="h-4 w-4 mr-1" />Send test</Button>
          {override && (
            <Button variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
              <RotateCcw className="h-4 w-4 mr-1" />Reset
            </Button>
          )}
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Live preview</Label>
            <Button size="sm" variant="ghost" onClick={() => previewQuery.refetch()} disabled={previewQuery.isFetching}>
              <RefreshCcw className={"h-3.5 w-3.5 mr-1 " + (previewQuery.isFetching ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>
          <div className="rounded-md border bg-muted/30">
            <div className="px-3 py-2 border-b text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Subject:</span>{" "}
              {previewQuery.data?.subject ?? meta.defaultSubject}
            </div>
            <iframe
              title={`Preview of ${meta.displayName}`}
              className="w-full h-[520px] bg-white rounded-b-md"
              srcDoc={previewQuery.data?.html ?? "<div style='padding:24px;font-family:sans-serif;color:#666'>Loading preview…</div>"}
              sandbox=""
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────── Delivery Log ────────────────────────── */

function DeliveryLogPanel() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  const sinceIso = useMemo(() => {
    const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
    return new Date(Date.now() - hours * 3600_000).toISOString();
  }, [range]);

  const { data: rawRows = [], refetch, isFetching } = useQuery({
    queryKey: ["email-send-log", sinceIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  // Deduplicate by message_id, keeping the latest row (already DESC-sorted)
  const dedupedAll = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rawRows as any[]) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [rawRows]);

  const templates = useMemo(
    () => Array.from(new Set(dedupedAll.map((r) => r.template_name).filter(Boolean))).sort(),
    [dedupedAll]
  );

  const stats = useMemo(() => {
    const s = { total: 0, sent: 0, failed: 0, suppressed: 0 };
    for (const r of dedupedAll) {
      s.total++;
      if (r.status === "sent") s.sent++;
      else if (r.status === "failed" || r.status === "dlq" || r.status === "bounced") s.failed++;
      else if (r.status === "suppressed" || r.status === "complained") s.suppressed++;
    }
    return s;
  }, [dedupedAll]);

  const data = useMemo(() => {
    return dedupedAll.filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "sent") return r.status === "sent";
      if (statusFilter === "failed") return ["failed", "dlq", "bounced"].includes(r.status);
      if (statusFilter === "suppressed") return ["suppressed", "complained"].includes(r.status);
      return r.status === statusFilter;
    }).slice(0, 200);
  }, [dedupedAll, templateFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} tone="muted" />
        <StatCard label="Sent" value={stats.sent} tone="success" />
        <StatCard label="Failed" value={stats.failed} tone="danger" />
        <StatCard label="Suppressed" value={stats.suppressed} tone="warning" />
      </div>
      <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Delivery log</CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border bg-background">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={
                  "px-2.5 py-1 text-xs " +
                  (range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")
                }
              >
                {r === "24h" ? "24h" : r === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="All templates" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {templates.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={"h-3.5 w-3.5 mr-1 " + (isFetching ? "animate-spin" : "")} />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {(data ?? []).map((row: any) => {
            const color =
              row.status === "sent" ? "text-success bg-success/100/10" :
              ["failed", "dlq", "bounced"].includes(row.status) ? "text-destructive bg-destructive/10" :
              ["suppressed", "complained"].includes(row.status) ? "text-warning bg-warning/100/10" :
              "text-muted-foreground bg-muted";
            return (
              <div key={row.message_id ?? row.id} className="px-4 py-3 flex items-center gap-3">
                <Badge variant="outline" className={"text-[10px] uppercase " + color}>{row.status}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    <span className="font-medium">{row.template_name}</span>
                    <span className="text-muted-foreground"> → {row.recipient_email}</span>
                  </p>
                  {row.error_message && (
                    <p className="text-xs text-muted-foreground truncate">{row.error_message}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </span>
              </div>
            );
          })}
          {(data ?? []).length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 mx-auto mb-2" />No emails yet.
            </div>
          )}
        </div>
      </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "muted" | "success" | "danger" | "warning" }) {
  const cls =
    tone === "success" ? "text-success" :
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-warning" :
    "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={"text-2xl font-semibold mt-1 " + cls}>{value}</p>
    </div>
  );
}

/* ────────────────────────── PDF Repository ────────────────────────── */

interface EmailDoc {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
}

function useEmailDocuments() {
  return useQuery({
    queryKey: ["email-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_documents")
        .select("id, title, description, category, file_url, file_path, file_size, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailDoc[];
    },
  });
}

function formatBytes(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsPanel({ userId }: { userId?: string }) {
  const qc = useQueryClient();
  const { data: docs = [], isLoading } = useEmailDocuments();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | DocCategory>("all");
  const [editing, setEditing] = useState<EmailDoc | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (catFilter !== "all" && d.category !== catFilter) return false;
      if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [docs, search, catFilter]);

  const deleteDoc = useMutation({
    mutationFn: async (doc: EmailDoc) => {
      // Best-effort storage delete
      await supabase.storage.from("branding").remove([doc.file_path]).catch(() => null);
      const { error } = await supabase.from("email_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Document deleted" });
      qc.invalidateQueries({ queryKey: ["email-documents"] });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">PDF Repository</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Reusable PDFs (welcome kit, handbook, fees, policies). Attach any of these to your email templates.
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setUploadOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Upload PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title…"
                className="pl-8"
              />
            </div>
            <Select value={catFilter} onValueChange={(v) => setCatFilter(v as any)}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No documents yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload PDFs like the Parent Welcome Kit, Staff Handbook, Fees Schedule, or Compliance Policies.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={d}
                  onEdit={() => { setEditing(d); setUploadOpen(true); }}
                  onDelete={() => {
                    if (confirm(`Delete "${d.title}"? This cannot be undone. Templates referencing it will lose the link.`)) {
                      deleteDoc.mutate(d);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {uploadOpen && (
        <DocumentUploadDialog
          existing={editing}
          userId={userId}
          onClose={() => { setUploadOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["email-documents"] }); setUploadOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function DocumentCard({ doc, onEdit, onDelete }: { doc: EmailDoc; onEdit: () => void; onDelete: () => void }) {
  const copyUrl = () => {
    navigator.clipboard.writeText(doc.file_url).then(
      () => toast({ title: "URL copied" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };
  const catLabel = DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category;
  return (
    <div className="rounded-lg border p-3 space-y-2 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{doc.title}</p>
          {doc.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{doc.description}</p>
          )}
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">{catLabel}</Badge>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <FileText className="h-3 w-3" />
        <span>{formatBytes(doc.file_size)}</span>
        <span>·</span>
        <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
      </div>
      <div className="flex items-center gap-1 pt-1">
        <Button size="sm" variant="ghost" asChild>
          <a href={doc.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" />Preview</a>
        </Button>
        <Button size="sm" variant="ghost" onClick={copyUrl}><CopyIcon className="h-3.5 w-3.5 mr-1" />Copy URL</Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DocumentUploadDialog({
  existing, userId, onClose, onSaved,
}: {
  existing: EmailDoc | null;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState<DocCategory>((existing?.category as DocCategory) || "parent");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!existing && !file) {
      toast({ title: "Please pick a PDF file", variant: "destructive" });
      return;
    }
    if (file && file.type !== "application/pdf") {
      toast({ title: "PDF only", variant: "destructive" });
      return;
    }
    if (file && file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 25 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      let file_url = existing?.file_url || "";
      let file_path = existing?.file_path || "";
      let file_size = existing?.file_size ?? null;

      if (file) {
        const safe = file.name.replace(/[^a-z0-9._-]+/gi, "_");
        const path = `email-documents/${crypto.randomUUID()}/${safe}`;
        const { error: upErr } = await supabase.storage
          .from("branding")
          .upload(path, file, { contentType: "application/pdf", upsert: false, cacheControl: "3600" });
        if (upErr) throw upErr;
        // remove old file when replacing
        if (existing?.file_path) {
          await supabase.storage.from("branding").remove([existing.file_path]).catch(() => null);
        }
        const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
        file_url = pub.publicUrl;
        file_path = path;
        file_size = file.size;
      }

      if (existing) {
        const { error } = await supabase
          .from("email_documents")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            category,
            file_url,
            file_path,
            file_size,
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_documents").insert({
          title: title.trim(),
          description: description.trim() || null,
          category,
          file_url,
          file_path,
          file_size,
          mime_type: "application/pdf",
          created_by: userId,
        } as any);
        if (error) throw error;
      }
      toast({ title: existing ? "Document updated" : "Document uploaded" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{existing ? "Edit document" : "Upload PDF"}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Parent Welcome Kit" />
          </Field>
          <Field label="Description (optional)">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown under the title in emails" />
          </Field>
          <Field label="Category">
            <Select value={category} onValueChange={(v) => setCategory(v as DocCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={existing ? "Replace PDF (optional)" : "PDF file"}>
            <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {existing && (
              <p className="text-xs text-muted-foreground">
                Current: <a href={existing.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{existing.file_path.split("/").pop()}</a>
              </p>
            )}
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {existing ? "Save changes" : "Upload"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Attached Documents Picker (in template editor) ──────────────── */

function AttachedDocsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data: docs = [] } = useEmailDocuments();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const byId = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d])), [docs]);
  const selected = value.map((id) => byId[id]).filter(Boolean);

  const available = docs.filter((d) =>
    !value.includes(d.id) &&
    (!search || d.title.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Attached documents</Label>
        <Button size="sm" variant="ghost" onClick={() => navigate("/admin/email?tab=documents")} className="h-7 text-xs">
          <FolderOpen className="h-3.5 w-3.5 mr-1" />Open repository
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pick PDFs from the repository to include as download buttons in this email.
      </p>

      {selected.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No documents attached.</div>
      ) : (
        <div className="space-y-1.5">
          {selected.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1">{d.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {DOC_CATEGORIES.find((c) => c.value === d.category)?.label || d.category}
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onChange(value.filter((id) => id !== d.id))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div>
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Attach from repository
          </Button>
        ) : (
          <div className="rounded-md border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setSearch(""); }}>Done</Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {available.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {docs.length === 0 ? "No documents in repository yet." : "No matches."}
                </p>
              ) : available.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onChange([...value, d.id])}
                  className="w-full text-left flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted text-sm"
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate flex-1">{d.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {DOC_CATEGORIES.find((c) => c.value === d.category)?.label || d.category}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}