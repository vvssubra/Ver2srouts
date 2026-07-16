import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Eye, RotateCcw, Send, Pencil, Check, FileText } from "lucide-react";
import DOMPurify from "dompurify";

const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html || "", {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction", "srcdoc"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });

const TEMPLATE_TYPES = [
  {
    type: "parent_invite",
    label: "Parent Invitation",
    description: "Sent when inviting a parent to join the platform",
    variables: ["studentName", "branchName", "accessCode", "inviteUrl"],
    defaultSubject: "You're invited to join {{brandName}} — {{studentName}}'s class",
    defaultHeading: "You're Invited! 🎉",
    defaultBody: `<p>You've been invited to connect with <strong>{{studentName}}</strong>'s class at <strong>{{branchName}}</strong>.</p>
<p>Join the platform to stay updated on your child's progress, receive announcements, and manage fees.</p>
{{#accessCode}}
<div style="margin:16px 0;padding:16px;background-color:#f5f3ff;border-radius:8px;text-align:center;">
  <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Your Access Code</p>
  <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;">{{accessCode}}</p>
</div>
{{/accessCode}}`,
    defaultCtaText: "Accept Invitation",
    defaultCtaUrl: "{{inviteUrl}}",
  },
  {
    type: "payment_reminder",
    label: "Payment Reminder",
    description: "Sent when an invoice is overdue",
    variables: ["invoiceNumber", "amountDue", "dueDate", "studentName", "paymentUrl", "branchName", "brandName"],
    defaultSubject: "Payment Reminder — Invoice {{invoiceNumber}} is overdue",
    defaultHeading: "Payment Reminder ⏰",
    defaultBody: `<p>This is a friendly reminder that the following invoice is past its due date:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
  <tr style="background-color:#fafafa;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Invoice</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;">{{invoiceNumber}}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Amount Due</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#dc2626;border-top:1px solid #e4e4e7;">RM {{amountDue}}</td>
  </tr>
  <tr style="background-color:#fafafa;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Due Date</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;border-top:1px solid #e4e4e7;">{{dueDate}}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Student</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;border-top:1px solid #e4e4e7;">{{studentName}}</td>
  </tr>
</table>
<p>Please make your payment at your earliest convenience to avoid any disruption.</p>`,
    defaultCtaText: "Make Payment",
    defaultCtaUrl: "{{paymentUrl}}",
  },
  {
    type: "payment_paid",
    label: "Payment Confirmation",
    description: "Sent after a successful payment",
    variables: ["invoiceNumber", "amountPaid", "paymentDate", "status", "branchName", "brandName"],
    defaultSubject: "Payment Received — Invoice {{invoiceNumber}}",
    defaultHeading: "Payment Confirmed ✅",
    defaultBody: `<p>Thank you! We've received your payment for the following invoice:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
  <tr style="background-color:#fafafa;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Invoice</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;">{{invoiceNumber}}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Amount Paid</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#16a34a;border-top:1px solid #e4e4e7;">RM {{amountPaid}}</td>
  </tr>
  <tr style="background-color:#fafafa;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Date</td>
    <td style="padding:12px 16px;font-size:13px;font-weight:600;border-top:1px solid #e4e4e7;">{{paymentDate}}</td>
  </tr>
</table>
<p>A receipt has been recorded in the system. Thank you for your prompt payment.</p>`,
    defaultCtaText: null,
    defaultCtaUrl: null,
  },
  {
    type: "announcement",
    label: "Announcement",
    description: "Sent when broadcasting announcements via email",
    variables: ["title", "body", "authorName", "branchName", "brandName"],
    defaultSubject: "📢 {{title}}",
    defaultHeading: "{{title}}",
    defaultBody: `<p style="white-space:pre-wrap;">{{body}}</p>
<p style="color:#a1a1aa;font-size:12px;margin-top:16px;">— {{authorName}}, {{branchName}}</p>`,
    defaultCtaText: null,
    defaultCtaUrl: null,
  },
  {
    type: "newsletter",
    label: "Newsletter",
    description: "Sent to all branch parents as a newsletter",
    variables: ["title", "body", "branchName", "brandName"],
    defaultSubject: "📰 {{title}}",
    defaultHeading: "{{title}}",
    defaultBody: `<p style="white-space:pre-wrap;">{{body}}</p>
<p style="color:#a1a1aa;font-size:12px;margin-top:16px;">— {{branchName}} Newsletter</p>`,
    defaultCtaText: null,
    defaultCtaUrl: null,
  },
];

interface Props {
  branchId: string;
  branchName: string;
  brandColor?: string;
}

export default function EmailTemplateEditor({ branchId, branchName, brandColor = "#7c3aed" }: Props) {
  const queryClient = useQueryClient();
  const [editingType, setEditingType] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    heading: "",
    body_html: "",
    cta_text: "",
    cta_url: "",
    is_active: true,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("branch_id", branchId);
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existing = templates.find((t: any) => t.template_type === editingType);
      if (existing) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            subject: form.subject,
            heading: form.heading,
            body_html: form.body_html,
            cta_text: form.cta_text || null,
            cta_url: form.cta_url || null,
            is_active: form.is_active,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({
          branch_id: branchId,
          template_type: editingType!,
          subject: form.subject,
          heading: form.heading,
          body_html: form.body_html,
          cta_text: form.cta_text || null,
          cta_url: form.cta_url || null,
          is_active: form.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates", branchId] });
      setEditingType(null);
      toast({ title: "Template saved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const existing = templates.find((t: any) => t.template_type === editingType);
      if (existing) {
        const { error } = await supabase.from("email_templates").delete().eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates", branchId] });
      setEditingType(null);
      toast({ title: "Template reset to default" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No email found for current user");

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: editingType,
          to: user.email,
          branchId,
          data: {
            studentName: "Test Student",
            branchName,
            accessCode: "ABC123",
            inviteUrl: "#",
            invoiceNumber: "INV-202603-0001",
            amountDue: "500.00",
            amountPaid: "500.00",
            dueDate: new Date().toLocaleDateString(),
            paymentDate: new Date().toLocaleDateString(),
            paymentUrl: "#",
            status: "paid",
            title: "Test Announcement",
            body: "This is a test email to preview your template.",
            authorName: "Admin",
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "Test email sent! Check your inbox." }),
    onError: (e) => toast({ title: "Failed to send test", description: e.message, variant: "destructive" }),
  });

  const startEdit = (type: string) => {
    const existing = templates.find((t: any) => t.template_type === type);
    const def = TEMPLATE_TYPES.find((t) => t.type === type)!;
    setForm({
      subject: existing?.subject ?? def.defaultSubject,
      heading: existing?.heading ?? def.defaultHeading,
      body_html: existing?.body_html ?? def.defaultBody,
      cta_text: existing?.cta_text ?? def.defaultCtaText ?? "",
      cta_url: existing?.cta_url ?? def.defaultCtaUrl ?? "",
      is_active: existing?.is_active ?? true,
    });
    setEditingType(type);
    setShowPreview(false);
  };

  const currentTypeDef = TEMPLATE_TYPES.find((t) => t.type === editingType);

  const replaceVars = (text: string) => {
    return text
      .replace(/\{\{studentName\}\}/g, "Ahmad Bin Ali")
      .replace(/\{\{branchName\}\}/g, branchName)
      .replace(/\{\{brandName\}\}/g, branchName)
      .replace(/\{\{accessCode\}\}/g, "XY3K9M")
      .replace(/\{\{inviteUrl\}\}/g, "#")
      .replace(/\{\{invoiceNumber\}\}/g, "INV-202603-0001")
      .replace(/\{\{amountDue\}\}/g, "500.00")
      .replace(/\{\{amountPaid\}\}/g, "500.00")
      .replace(/\{\{dueDate\}\}/g, "15 Mar 2026")
      .replace(/\{\{paymentDate\}\}/g, "10 Mar 2026")
      .replace(/\{\{paymentUrl\}\}/g, "#")
      .replace(/\{\{status\}\}/g, "Fully Paid")
      .replace(/\{\{title\}\}/g, "School Holiday Notice")
      .replace(/\{\{body\}\}/g, "School will be closed from 20–24 March for the mid-term break.")
      .replace(/\{\{authorName\}\}/g, "Principal")
      .replace(/\{\{#accessCode\}\}[\s\S]*?\{\{\/accessCode\}\}/g, (match) => match.replace(/\{\{#accessCode\}\}/, "").replace(/\{\{\/accessCode\}\}/, ""));
  };

  if (editingType && currentTypeDef) {
    return (
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setEditingType(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <CardTitle className="text-base">Edit: {currentTypeDef.label}</CardTitle>
              <CardDescription>{currentTypeDef.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Variable chips */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Available Variables (click to copy)</Label>
            <div className="flex flex-wrap gap-1.5">
              {currentTypeDef.variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 text-xs font-mono"
                  onClick={() => {
                    navigator.clipboard.writeText(`{{${v}}}`);
                    toast({ title: `Copied {{${v}}}` });
                  }}
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor side */}
            <div className="space-y-3">
              <div>
                <Label>Subject</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div>
                <Label>Heading</Label>
                <Input
                  value={form.heading}
                  onChange={(e) => setForm({ ...form, heading: e.target.value })}
                />
              </div>
              <div>
                <Label>Body (HTML with variables)</Label>
                <Textarea
                  value={form.body_html}
                  onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                  rows={12}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Button Text</Label>
                  <Input
                    value={form.cta_text}
                    onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                    placeholder="e.g. Make Payment"
                  />
                </div>
                <div>
                  <Label>Button URL</Label>
                  <Input
                    value={form.cta_url}
                    onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                    placeholder="e.g. {{paymentUrl}}"
                  />
                </div>
              </div>
            </div>

            {/* Preview side */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs text-muted-foreground">Live Preview</Label>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                  <Eye className="h-3 w-3 mr-1" />{showPreview ? "Hide" : "Show"}
                </Button>
              </div>
              {showPreview && (
                <div className="border rounded-lg overflow-hidden bg-[#f4f4f5]">
                  <div
                    style={{ backgroundColor: brandColor }}
                    className="px-6 py-4 text-center"
                  >
                    <h1 className="text-white font-bold text-sm">{branchName}</h1>
                  </div>
                  <div className="bg-white p-6">
                    <h2 className="text-base font-semibold mb-3">{replaceVars(form.heading)}</h2>
                    <div
                      className="text-sm text-muted-foreground [&_p]:mb-2 [&_table]:w-full [&_td]:p-2 [&_td]:text-xs"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(replaceVars(form.body_html)) }}
                    />
                    {form.cta_text && (
                      <div className="mt-4 text-center">
                        <span
                          className="inline-block px-6 py-2 rounded-lg text-white text-sm font-semibold"
                          style={{ backgroundColor: brandColor }}
                        >
                          {replaceVars(form.cta_text)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="bg-[#fafafa] px-6 py-3 border-t text-center">
                    <p className="text-[10px] text-muted-foreground">
                      © {new Date().getFullYear()} {branchName}. All rights reserved.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Check className="h-4 w-4 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
            <Button variant="outline" onClick={() => sendTestMutation.mutate()} disabled={sendTestMutation.isPending}>
              <Send className="h-4 w-4 mr-1" />
              {sendTestMutation.isPending ? "Sending..." : "Send Test"}
            </Button>
            {templates.find((t: any) => t.template_type === editingType) && (
              <Button variant="ghost" className="text-destructive" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-1" />Reset to Default
              </Button>
            )}
            <Button variant="ghost" className="ml-auto" onClick={() => setEditingType(null)}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Email Templates
        </CardTitle>
        <CardDescription>Customize the content of automated emails sent from this branch</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {TEMPLATE_TYPES.map((tmpl) => {
            const custom = templates.find((t: any) => t.template_type === tmpl.type);
            return (
              <div key={tmpl.type} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{tmpl.label}</p>
                    {custom ? (
                      <Badge variant="default" className="text-[10px] h-5">Customized</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5">Default</Badge>
                    )}
                    {custom && !custom.is_active && (
                      <Badge variant="secondary" className="text-[10px] h-5">Disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => startEdit(tmpl.type)}>
                  <Pencil className="h-3 w-3 mr-1" />Edit
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
