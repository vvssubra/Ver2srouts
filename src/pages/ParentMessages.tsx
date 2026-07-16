import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Megaphone, Mail, MailOpen, Send, ArrowLeft, Loader2, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";

type FeedItem = {
  id: string;
  type: "message" | "announcement";
  subject: string;
  body: string;
  sender_name: string;
  created_at: string;
  is_read: boolean;
  is_broadcast: boolean;
  raw: any;
};

export default function ParentMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Auto-clear bell/push notifications for announcements + newsletters
  // once the parent reaches the messages page.
  useMarkNotificationsRead(["announcement", "newsletter", "message"]);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: children } = useQuery({
    queryKey: ["my-children-branches", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_students")
        .select("student_id, students(id, branch_id, first_name, last_name, class_name)")
        .eq("parent_id", user!.id);
      return (data ?? []).map((d: any) => d.students).filter(Boolean);
    },
    enabled: !!user,
  });

  const branchIds = [...new Set(children?.map((c: any) => c.branch_id) ?? [])];
  const childClassNames = [...new Set(children?.map((c: any) => c.class_name).filter(Boolean) ?? [])];

  // Fetch parent_messages
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["parent-messages", user?.id],
    queryFn: async () => {
      const { data: direct } = await supabase
        .from("parent_messages")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });

      let broadcasts: any[] = [];
      if (branchIds.length > 0) {
        const { data: bc } = await supabase
          .from("parent_messages")
          .select("*")
          .is("recipient_id", null)
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false });
        broadcasts = bc ?? [];
      }

      const all = [...(direct ?? []), ...broadcasts];
      const unique = Array.from(new Map(all.map((m) => [m.id, m])).values());
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return unique;
    },
    enabled: !!user && branchIds.length > 0,
  });

  // Fetch announcements for parent's branches
  const { data: announcements } = useQuery({
    queryKey: ["parent-announcements", branchIds, user?.id],
    queryFn: async () => {
      if (!branchIds.length) return [];
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false });

      // Filter by target_type. Support legacy values ("all", "class", "specific")
      // and new namespaced values ("parents_all", "parents_class", "parents_specific").
      // Staff-targeted announcements are hidden from parents.
      return (data ?? []).filter((a: any) => {
        const t = a.target_type;
        if (t === "staff" || t === "staff_all" || t === "staff_specific") return false;
        if (t === "all" || t === "parents_all") return true;
        if (t === "class" || t === "parents_class") {
          return childClassNames.includes(a.target_class);
        }
        if (t === "specific" || t === "parents_specific") {
          return (a.target_parent_ids ?? []).includes(user!.id);
        }
        // Unknown / null target_type: do NOT leak to all parents. Only the
        // legacy explicit "all" / "parents_all" values above open the
        // audience up. Anything else must be treated as not-for-me.
        return false;
      });
    },
    enabled: !!user && branchIds.length > 0,
  });

  // Fetch announcement reads
  const { data: myReads } = useQuery({
    queryKey: ["my-announcement-reads", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("parent_user_id", user!.id);
      return new Set((data ?? []).map((r: any) => r.announcement_id));
    },
    enabled: !!user,
  });

  // Sender profiles
  const senderIds = [...new Set(messages?.map((m: any) => m.sender_id) ?? [])];
  const announcementCreatorIds = [...new Set(announcements?.map((a: any) => a.created_by) ?? [])];
  const allProfileIds = [...new Set([...senderIds, ...announcementCreatorIds])];

  const { data: senderProfiles } = useQuery({
    queryKey: ["sender-profiles", allProfileIds],
    queryFn: async () => {
      if (!allProfileIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", allProfileIds);
      return data ?? [];
    },
    enabled: allProfileIds.length > 0,
  });

  const getProfileName = (id: string) => {
    const p = senderProfiles?.find((s: any) => s.id === id);
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Staff" : "Staff";
  };

  // Build unified feed
  const feedItems: FeedItem[] = [
    ...(messages ?? []).map((m: any) => ({
      id: m.id,
      type: "message" as const,
      subject: m.subject,
      body: m.body,
      sender_name: getProfileName(m.sender_id),
      created_at: m.created_at,
      is_read: m.is_read ?? false,
      is_broadcast: !m.recipient_id,
      raw: m,
    })),
    ...(announcements ?? []).map((a: any) => ({
      id: `ann-${a.id}`,
      type: "announcement" as const,
      subject: a.title,
      body: a.body,
      sender_name: getProfileName(a.created_by),
      created_at: a.created_at,
      is_read: myReads?.has(a.id) ?? false,
      is_broadcast: true,
      raw: a,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Mark message as read
  const markReadMutation = useMutation({
    mutationFn: async (msgId: string) => {
      await supabase.from("parent_messages").update({ is_read: true } as any).eq("id", msgId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-messages"] });
      queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
    },
  });

  // Mark announcement as read
  const markAnnouncementReadMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      await supabase.from("announcement_reads").insert({
        announcement_id: announcementId,
        parent_user_id: user!.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-announcement-reads"] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || selectedItem.type !== "message" || !replyText.trim()) return;
      const msg = selectedItem.raw;
      const { error } = await supabase.from("parent_messages").insert({
        branch_id: msg.branch_id,
        sender_id: user!.id,
        recipient_id: msg.sender_id,
        student_id: msg.student_id,
        subject: `Re: ${msg.subject}`,
        body: replyText.trim(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText("");
      toast({ title: "Reply sent" });
      queryClient.invalidateQueries({ queryKey: ["parent-messages"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("parent-messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "parent_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["parent-messages"] });
        queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["parent-announcements"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const unreadCount = feedItems.filter((item) => !item.is_read).length;

  const openItem = (item: FeedItem) => {
    setSelectedItem(item);
    if (item.type === "message" && !item.is_read && item.raw.recipient_id === user?.id) {
      markReadMutation.mutate(item.raw.id);
    }
    if (item.type === "announcement" && !item.is_read) {
      markAnnouncementReadMutation.mutate(item.raw.id);
    }
  };

  if (messagesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading updates...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              School Updates
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              Announcements and notices from your child's school
              {unreadCount > 0 && (
                <Badge variant="destructive">{unreadCount} unread</Badge>
              )}
            </p>
          </div>
          {selectedItem && (
            <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)} className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
        </div>

        {selectedItem ? (
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-semibold break-words">{selectedItem.subject}</h2>
                  <p className="text-sm text-muted-foreground">
                    From: {selectedItem.sender_name} · {formatDistanceToNow(new Date(selectedItem.created_at), { addSuffix: true })}
                  </p>
                </div>
                {selectedItem.type === "announcement" && (
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Bell className="h-3 w-3" /> Announcement
                  </Badge>
                )}
                {selectedItem.type === "message" && selectedItem.is_broadcast && (
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Megaphone className="h-3 w-3" /> Notice
                  </Badge>
                )}
              </div>
              <div className="border-t pt-4 whitespace-pre-wrap text-sm leading-relaxed">
                {selectedItem.body}
              </div>

              {selectedItem.type === "message" && selectedItem.raw.recipient_id && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Reply</p>
                  <Textarea
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                  />
                  <Button
                    size="sm"
                    onClick={() => replyMutation.mutate()}
                    disabled={!replyText.trim() || replyMutation.isPending}
                  >
                    {replyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Send Reply
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-220px)] min-w-0">
            {!feedItems.length ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p>No updates yet. Your child's school will send notices here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 pr-1">
                {feedItems.map((item) => {
                  const isUnread = !item.is_read;
                  return (
                    <Card
                      key={item.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${isUnread ? "border-primary/30 bg-primary/5" : ""}`}
                      onClick={() => openItem(item)}
                    >
                      <CardContent className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 min-w-0">
                        <div className="mt-1 shrink-0">
                          {item.type === "announcement" ? (
                            <Bell className={`h-5 w-5 ${isUnread ? "text-primary" : "text-muted-foreground"}`} />
                          ) : isUnread ? (
                            <Mail className="h-5 w-5 text-primary" />
                          ) : (
                            <MailOpen className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm break-words min-w-0 ${isUnread ? "font-semibold" : "font-medium"}`}>
                              {item.subject}
                            </p>
                            {item.type === "announcement" && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                <Bell className="h-2.5 w-2.5 mr-0.5" /> Announcement
                              </Badge>
                            )}
                            {item.type === "message" && item.is_broadcast && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                <Megaphone className="h-2.5 w-2.5 mr-0.5" /> Notice
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.sender_name}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                            {item.body.slice(0, 100)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1 sm:hidden">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 hidden sm:inline">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </DashboardLayout>
  );
}
