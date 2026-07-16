import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Pencil, Send, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface EmailSettingsCardProps {
  branchId: string;
  branchName: string;
  branchSettings: any;
}

export default function EmailSettingsCard({ branchId, branchName, branchSettings }: EmailSettingsCardProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState({
    email_sender_name: "",
    email_brand_color: "#7c3aed",
    email_reply_to: "",
    email_from_address: "",
    email_footer_text: "",
    logo_url: "",
  });

  const senderName = form.email_sender_name || branchSettings?.school_display_name || branchName;
  const brandColor = form.email_brand_color || "#7c3aed";

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${branchId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("newsletter-assets").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("newsletter-assets").getPublicUrl(path);
      setForm({ ...form, logo_url: urlData.publicUrl });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  const startEdit = () => {
    setForm({
      email_sender_name: branchSettings?.email_sender_name || "",
      email_brand_color: branchSettings?.email_brand_color || "#7c3aed",
      email_reply_to: branchSettings?.email_reply_to || "",
      email_from_address: branchSettings?.email_from_address || "",
      email_footer_text: branchSettings?.email_footer_text || "",
      logo_url: branchSettings?.logo_url || "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (branchSettings) {
        const { error } = await supabase.from("branch_settings").update(form as any).eq("id", branchSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branch_settings").insert({ branch_id: branchId, ...form } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-settings", branchId] });
      setEditing(false);
      toast({ title: "Email settings saved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendTestEmail = async () => {
    setSendingTest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No email found for your account");

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "announcement",
          to: user.email,
          branchId,
          data: {
            title: "Test Email — Settings Preview",
            body: "This is a test email to preview your email branding settings. If you're seeing this, your email configuration is working correctly! 🎉",
            authorName: "System Test",
          },
        },
      });
      if (error) throw error;
      toast({ title: "Test email sent", description: `Sent to ${user.email}` });
    } catch (err: any) {
      toast({ title: "Failed to send test", description: err.message, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const displaySenderName = branchSettings?.email_sender_name || branchSettings?.school_display_name || branchName;
  const displayColor = branchSettings?.email_brand_color || "#7c3aed";

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email Communication Settings
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={sendTestEmail} disabled={sendingTest}>
            <Send className="h-4 w-4 mr-2" />{sendingTest ? "Sending…" : "Send Test Email"}
          </Button>
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4 mr-2" />Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Sender Display Name</Label>
                <Input
                  value={form.email_sender_name}
                  onChange={e => setForm({ ...form, email_sender_name: e.target.value })}
                  placeholder={branchSettings?.school_display_name || branchName}
                />
                <p className="text-xs text-muted-foreground mt-1">Name shown in email header. Defaults to school/branch name.</p>
              </div>
              <div>
                <Label>Brand Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.email_brand_color}
                    onChange={e => setForm({ ...form, email_brand_color: e.target.value })}
                    className="h-10 w-12 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={form.email_brand_color}
                    onChange={e => setForm({ ...form, email_brand_color: e.target.value })}
                    placeholder="#7c3aed"
                    className="max-w-32"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Header background color for all outgoing emails.</p>
              </div>
              <div>
                <Label>Reply-To Address</Label>
                <Input
                  type="email"
                  value={form.email_reply_to}
                  onChange={e => setForm({ ...form, email_reply_to: e.target.value })}
                  placeholder="e.g. admin@edukidzs.org"
                />
                <p className="text-xs text-muted-foreground mt-1">Where parent replies go.</p>
              </div>
              <div>
                <Label>From Address</Label>
                <Input
                  type="email"
                  value={form.email_from_address}
                  onChange={e => setForm({ ...form, email_from_address: e.target.value })}
                  placeholder="onboarding@resend.dev"
                />
                <p className="text-xs text-muted-foreground mt-1">Requires a verified domain in Resend.</p>
              </div>
            </div>
            <div>
              <Label>School Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                {form.logo_url ? (
                  <div className="relative">
                    <img src={form.logo_url} alt="Logo" className="h-12 max-w-32 object-contain rounded border" />
                    <button onClick={() => setForm({ ...form, logo_url: "" })} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-md cursor-pointer hover:border-primary/50 transition-colors">
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{uploadingLogo ? "Uploading…" : "Upload logo"}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Displayed in email header above school name.</p>
            </div>
            <div>
              <Label>Footer Text</Label>
              <Textarea
                value={form.email_footer_text}
                onChange={e => setForm({ ...form, email_footer_text: e.target.value })}
                placeholder="Custom footer text for all emails"
                rows={2}
              />
            </div>

            {/* Live Preview */}
            <div>
              <Label className="mb-2 block">Email Preview</Label>
              <div className="border rounded-lg overflow-hidden max-w-md">
                <div style={{ backgroundColor: brandColor }} className="px-6 py-4 text-center">
                  {form.logo_url && <img src={form.logo_url} alt="Logo" className="mx-auto mb-1 max-h-8 object-contain" style={{ filter: "brightness(0) invert(1)" }} />}
                  <span className="text-white font-bold text-sm">{senderName}</span>
                </div>
                <div className="px-6 py-5 bg-background">
                  <p className="text-sm font-semibold text-foreground mb-2">Sample Email Title</p>
                  <p className="text-xs text-muted-foreground">This is how your email content area will look to recipients.</p>
                </div>
                <div className="px-6 py-3 border-t bg-muted/30">
                  <p className="text-[10px] text-muted-foreground text-center">
                    © {new Date().getFullYear()} {senderName}. All rights reserved.
                    {form.email_footer_text && <><br />{form.email_footer_text}</>}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Email Settings"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <p><span className="text-muted-foreground">Sender Name:</span> {displaySenderName}</p>
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Brand Color:</span>
                <span className="inline-block w-4 h-4 rounded border" style={{ backgroundColor: displayColor }} />
                {displayColor}
              </p>
              <p><span className="text-muted-foreground">Reply-To:</span> {branchSettings?.email_reply_to || <span className="italic text-muted-foreground">Not set</span>}</p>
              <p><span className="text-muted-foreground">From Address:</span> {branchSettings?.email_from_address || <span className="italic text-muted-foreground">Default (onboarding@resend.dev)</span>}</p>
              {branchSettings?.email_footer_text && (
                <p className="md:col-span-2"><span className="text-muted-foreground">Footer:</span> {branchSettings.email_footer_text}</p>
              )}
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">Logo:</span>
                {branchSettings?.logo_url ? (
                  <img src={branchSettings.logo_url} alt="Logo" className="h-8 max-w-24 object-contain rounded" />
                ) : (
                  <span className="italic text-muted-foreground">Not set</span>
                )}
              </p>
            </div>

            {/* Mini Preview */}
            <div className="border rounded-lg overflow-hidden max-w-xs">
              <div style={{ backgroundColor: displayColor }} className="px-4 py-2 text-center">
                {branchSettings?.logo_url && <img src={branchSettings.logo_url} alt="Logo" className="mx-auto mb-1 max-h-6 object-contain" style={{ filter: "brightness(0) invert(1)" }} />}
                <span className="text-white font-bold text-xs">{displaySenderName}</span>
              </div>
              <div className="px-4 py-3 bg-background">
                <div className="h-2 w-24 bg-muted rounded mb-1.5" />
                <div className="h-1.5 w-32 bg-muted/60 rounded" />
              </div>
              <div className="px-4 py-1.5 border-t bg-muted/30">
                <div className="h-1 w-20 bg-muted/40 rounded mx-auto" />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
