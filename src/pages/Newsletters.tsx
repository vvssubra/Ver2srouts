import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { notifyUsers } from "@/lib/notify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Send, FileText, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import NewsletterComposer, { type ContentBlock } from "@/components/NewsletterComposer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Newsletters() {
  const { user, role } = useAuth();
  // Any signed-in staff member (i.e. not a parent) can create newsletters.
  const canEdit = !!user && role !== "parent";
  const { activeBranchIds, selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const audienceParam = searchParams.get("audience"); // "staff" | "parents" | null
  const [audienceTab, setAudienceTab] = useState<"staff" | "parents">(
    audienceParam === "parents" ? "parents" : "staff",
  );
  const isStaffView = audienceTab === "staff";
  const [composing, setComposing] = useState<string | null>(null); // null = list, "new" = new, uuid = editing

  // Get user's branch
  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(name)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const branchId =
    selectedBranchId && selectedBranchId !== "all"
      ? selectedBranchId
      : membership?.branch_id;
  const listBranchIds =
    role === "super_admin" && (!selectedBranchId || selectedBranchId === "all")
      ? activeBranchIds
      : branchId
      ? [branchId]
      : [];

  // Get branch settings for branding
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_settings")
        .select("email_brand_color, email_sender_name, school_display_name, logo_url")
        .eq("branch_id", branchId!)
        .maybeSingle();
      return data;
    },
  });

  // Fetch newsletters
  const { data: newsletters, isLoading } = useQuery({
    queryKey: ["newsletters", listBranchIds.join(",")],
    enabled: listBranchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletters")
        .select("*")
        .in("branch_id", listBranchIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get the newsletter being edited
  const editingNewsletter = composing && composing !== "new"
    ? newsletters?.find((n) => n.id === composing) : undefined;

  const filteredNewsletters = (newsletters ?? []).filter((n: any) => {
    if (isStaffView) return n.target_audience === "staff";
    return n.target_audience !== "staff";
  });

  const brandColor = branchSettings?.email_brand_color || "#7c3aed";
  const brandName = branchSettings?.email_sender_name || branchSettings?.school_display_name || (membership as any)?.branches?.name || "School";
  const logoUrl = branchSettings?.logo_url;

  const saveMutation = useMutation({
    mutationFn: async (data: { title: string; subject: string; content_blocks: ContentBlock[]; target_audience: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingNewsletter) {
        const { error } = await supabase
          .from("newsletters")
          .update({
            title: data.title,
            subject: data.subject,
            content_blocks: data.content_blocks as any,
            target_audience: data.target_audience,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingNewsletter.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("newsletters")
          .insert({
            branch_id: branchId!,
            title: data.title,
            subject: data.subject,
            content_blocks: data.content_blocks as any,
            target_audience: data.target_audience,
          })
          .select("id")
          .single();
        if (error) throw error;
        setComposing(inserted.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters", branchId] });
      toast({ title: "Newsletter saved" });
    },
    onError: (e) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { title: string; subject: string; content_blocks: ContentBlock[]; target_audience: string }) => {
      // Save first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let newsletterId = editingNewsletter?.id;
      if (!newsletterId) {
        const { data: inserted, error } = await supabase
          .from("newsletters")
          .insert({
            branch_id: branchId!,
            title: data.title,
            subject: data.subject,
            content_blocks: data.content_blocks as any,
            target_audience: data.target_audience,
          })
          .select("id")
          .single();
        if (error) throw error;
        newsletterId = inserted.id;
      } else {
        await supabase.from("newsletters").update({
          title: data.title,
          subject: data.subject,
          content_blocks: data.content_blocks as any,
          target_audience: data.target_audience,
        }).eq("id", newsletterId);
      }

      // Get recipients based on audience
      let recipientEmails: string[] = [];

      if (data.target_audience === "parents" || data.target_audience === "both") {
        // Get parent emails via parent_students -> profiles
        const { data: parentLinks } = await supabase
          .from("parent_students")
          .select("parent_id, students!inner(branch_id)")
          .eq("students.branch_id", branchId!);
        if (parentLinks) {
          const parentIds = [...new Set(parentLinks.map((pl: any) => pl.parent_id))];
          if (parentIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("email")
              .in("id", parentIds);
            recipientEmails.push(...(profiles?.map((p) => p.email).filter(Boolean) as string[] || []));
          }
        }
      }

      if (data.target_audience === "staff" || data.target_audience === "both") {
        const { data: members } = await supabase
          .from("branch_memberships")
          .select("user_id")
          .eq("branch_id", branchId!);
        if (members) {
          const staffIds = members.map((m) => m.user_id);
          if (staffIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("email")
              .in("id", staffIds);
            recipientEmails.push(...(profiles?.map((p) => p.email).filter(Boolean) as string[] || []));
          }
        }
      }

      // Deduplicate
      recipientEmails = [...new Set(recipientEmails)];

      if (recipientEmails.length === 0) {
        throw new Error("No recipients found for the selected audience");
      }

      // Send via edge function
      const { error: sendError } = await supabase.functions.invoke("send-email", {
        body: {
          type: "newsletter_composed",
          to: recipientEmails,
          branchId,
          data: {
            subject: data.subject,
            content_blocks: data.content_blocks,
          },
        },
      });
      if (sendError) throw sendError;

      // Update newsletter status
      await supabase.from("newsletters").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        recipient_count: recipientEmails.length,
      }).eq("id", newsletterId);
    },
    onSuccess: (_: any, { data }: any) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters", branchId] });
      toast({ title: "Newsletter sent!" });
      // Notify targeted users in-app
      if (branchId) {
        const notifyRecipients = async () => {
          const userIds: string[] = [];
          if (data.target_audience === "parents" || data.target_audience === "both") {
            const { data: parentLinks } = await supabase.from("parent_students").select("parent_id, students!inner(branch_id)").eq("students.branch_id", branchId!);
            if (parentLinks) userIds.push(...parentLinks.map((pl: any) => pl.parent_id));
          }
          if (data.target_audience === "staff" || data.target_audience === "both") {
            const { data: members } = await supabase.from("branch_memberships").select("user_id").eq("branch_id", branchId!);
            if (members) userIds.push(...members.map((m) => m.user_id));
          }
          const unique = [...new Set(userIds)].filter((id) => id !== user?.id);
          if (unique.length) {
            const newsletterId: string | undefined = (data as any)?.id;
            notifyUsers(
              unique,
              "New Newsletter",
              `"${data.subject}" has been published.`,
              "newsletter",
              newsletterId,
              "/parent-messages",
              newsletterId ? `newsletter:${newsletterId}` : undefined,
              "normal",
            );
          }
        };
        notifyRecipients();
      }
      setComposing(null);
    },
    onError: (e) => toast({ title: "Error sending", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("newsletters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters", branchId] });
      toast({ title: "Newsletter deleted" });
    },
  });

  if (!branchId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <p className="text-muted-foreground">You must be assigned to a branch to manage newsletters.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (composing !== null) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <NewsletterComposer
            branchId={branchId}
            newsletter={editingNewsletter ? {
              ...editingNewsletter,
              content_blocks: (editingNewsletter.content_blocks as any) || [],
            } : undefined}
            brandColor={brandColor}
            brandName={brandName}
            logoUrl={logoUrl}
            lockedAudience={isStaffView ? "staff" : "parents"}
            onSave={(data) => saveMutation.mutateAsync(data)}
            onSend={(data) => sendMutation.mutateAsync(data)}
            onBack={() => setComposing(null)}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Newsletter</h1>
            <p className="text-sm text-muted-foreground">
              {isStaffView
                ? "Internal updates sent only to your staff team"
                : "Create and send rich newsletters to parents"}
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setComposing("new")}>
              <Plus className="h-4 w-4 mr-2" /> New Newsletter
            </Button>
          )}
        </div>

        <Tabs value={audienceTab} onValueChange={(v) => setAudienceTab(v as "staff" | "parents")}>
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="parents">Parents</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !filteredNewsletters?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">No newsletters yet. Create your first one!</p>
              {canEdit && (
                <Button onClick={() => setComposing("new")}><Plus className="h-4 w-4 mr-2" /> Create Newsletter</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredNewsletters.map((nl) => (
              <Card key={nl.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setComposing(nl.id)}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{nl.title}</h3>
                      <Badge variant={nl.status === "sent" ? "default" : "secondary"}>
                        {nl.status === "sent" ? "Sent" : "Draft"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{nl.target_audience}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {nl.status === "sent"
                        ? `Sent ${format(new Date(nl.sent_at!), "MMM d, yyyy")} to ${nl.recipient_count} recipients`
                        : `Last updated ${format(new Date(nl.updated_at), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {nl.status === "draft" && canEdit && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Newsletter?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(nl.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
