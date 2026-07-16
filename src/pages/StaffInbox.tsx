import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Inbox, Send, CheckCircle2, Filter, AlertTriangle, MessageCircle, CheckCheck, Languages, Trash2, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

const INTENT_COLORS: Record<string, string> = {
  concern: "bg-destructive/15 text-destructive border-destructive/30",
  billing: "bg-primary/15 text-primary border-primary/30",
  leave: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  academic: "bg-accent/15 text-accent border-accent/30",
  general: "bg-muted text-muted-foreground",
};

const SENTIMENT_ICONS: Record<string, string> = {
  positive: "🟢",
  neutral: "🔵",
  negative: "🔴",
};

const LANG_LABELS: Record<string, string> = { en: "English", ms: "Bahasa Melayu", zh: "中文", ta: "தமிழ்" };

export default function StaffInbox() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedConvo, setSelectedConvo] = useState<string | null>(
    searchParams.get("convo")
  );
  useEffect(() => {
    const urlConvo = searchParams.get("convo");
    if (urlConvo && urlConvo !== selectedConvo) setSelectedConvo(urlConvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  useEffect(() => {
    const urlConvo = searchParams.get("convo");
    if (selectedConvo && selectedConvo !== urlConvo) {
      const next = new URLSearchParams(searchParams);
      next.set("convo", selectedConvo);
      setSearchParams(next, { replace: true });
    } else if (!selectedConvo && urlConvo) {
      const next = new URLSearchParams(searchParams);
      next.delete("convo");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo]);
  const [messageText, setMessageText] = useState("");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [showTranslations, setShowTranslations] = useState<Record<string, boolean>>({});
  const [deleteConvo, setDeleteConvo] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const lastMsgIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const isSuperAdmin = role === "super_admin";

  const isFranchisee = role === "franchisee" || role === "super_admin" || role === "admin";

  // Get branch for teacher scoping
  const { data: myMemberships } = useQuery({
    queryKey: ["my-branch-inbox", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id, assigned_class_ids").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const inboxBranchId = myMemberships?.[0]?.branch_id;
  const { teacherClassIds } = useTeacherClasses(inboxBranchId);

  // Get scoped student IDs for teacher filtering
  const { data: scopedStudentIds } = useQuery({
    queryKey: ["scoped-student-ids-inbox", inboxBranchId, teacherClassIds],
    queryFn: async () => {
      if (!teacherClassIds) return null; // null = no filtering
      const { data } = await supabase.from("students").select("id").in("class_id", teacherClassIds).eq("is_active", true);
      return data?.map((s: any) => s.id) ?? [];
    },
    enabled: !!inboxBranchId && !!teacherClassIds,
  });

  const staffName = user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name ?? ""}`.trim()
    : "Staff";
  const { onlineUsers, typingUsers, sendTyping } = useChatPresence(selectedConvo, user?.id, staffName);

  // Get user's preferred language
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-lang", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("preferred_language").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });
  const myLang = (myProfile as any)?.preferred_language ?? "en";

  // Get conversations
  const { data: conversations } = useQuery({
    queryKey: ["staff-conversations", user?.id, role],
    queryFn: async () => {
      if (isFranchisee) {
        const { data: memberships } = await supabase
          .from("branch_memberships")
          .select("branch_id")
          .eq("user_id", user!.id);
        const branchIds = memberships?.map((m: any) => m.branch_id) ?? [];
        if (!branchIds.length) return [];

        const { data } = await supabase
          .from("conversations")
          .select("*, students(first_name, last_name)")
          .in("branch_id", branchIds)
          .order("updated_at", { ascending: false });
        return data ?? [];
      } else {
        const { data: parts } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user!.id);
        const convoIds = parts?.map((p: any) => p.conversation_id) ?? [];
        if (!convoIds.length) return [];

        const { data } = await supabase
          .from("conversations")
          .select("*, students(first_name, last_name)")
          .in("id", convoIds)
          .order("updated_at", { ascending: false });
        return data ?? [];
      }
    },
    enabled: !!user,
  });

  // Filter conversations by teacher's scoped students
  const scopedConversations = useMemo(() => {
    if (!conversations) return [];
    if (!scopedStudentIds) return conversations;
    return conversations.filter((c: any) => scopedStudentIds.includes(c.student_id));
  }, [conversations, scopedStudentIds]);

  // Per-conversation unread counts
  const convoIds = scopedConversations?.map((c: any) => c.id) ?? [];
  const { data: convoUnreadMap = {} } = useQuery({
    queryKey: ["staff-convo-unread", convoIds, user?.id],
    queryFn: async () => {
      if (!convoIds.length || !user) return {};
      const { data } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .eq("is_read", false)
        .is("read_at", null)
        .neq("sender_id", user.id)
        .in("conversation_id", convoIds);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1;
      });
      return counts;
    },
    enabled: convoIds.length > 0 && !!user,
  });

  const filteredConversations = scopedConversations?.filter((c: any) => {
    if (intentFilter !== "all" && c.ai_intent_tag !== intentFilter) return false;
    if (sentimentFilter !== "all" && c.ai_sentiment !== sentimentFilter) return false;
    return true;
  }) ?? [];

  const parentIds = [...new Set(conversations?.map((c: any) => c.parent_id) ?? [])];
  const { data: parentProfiles } = useQuery({
    queryKey: ["parent-profiles-inbox", parentIds],
    queryFn: async () => {
      if (!parentIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", parentIds);
      return data ?? [];
    },
    enabled: parentIds.length > 0,
  });

  const getParentName = (id: string) => {
    const p = parentProfiles?.find((pr: any) => pr.id === id);
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Parent" : "Parent";
  };

  const { data: messages } = useQuery({
    queryKey: ["staff-chat-messages", selectedConvo],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", selectedConvo!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!selectedConvo,
  });

  const msgSenderIds = [...new Set(messages?.map((m: any) => m.sender_id) ?? [])];
  const { data: msgProfiles } = useQuery({
    queryKey: ["msg-profiles", msgSenderIds],
    queryFn: async () => {
      if (!msgSenderIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", msgSenderIds);
      return data ?? [];
    },
    enabled: msgSenderIds.length > 0,
  });

  const getMsgSenderName = (id: string) => {
    if (id === user?.id) return "You";
    const p = msgProfiles?.find((pr: any) => pr.id === id);
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "User" : "User";
  };

  const invalidateChatState = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-chat-messages", selectedConvo] });
    queryClient.invalidateQueries({ queryKey: ["staff-conversations"] });
    queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
    queryClient.invalidateQueries({ queryKey: ["staff-convo-unread"] });
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  // Mark messages + related bell notifications as read only when the exact thread is open.
  useEffect(() => {
    if (!selectedConvo || !messages || !user) return;
    const unreadFromOthers = messages.filter((m: any) => m.sender_id !== user.id && !m.is_read);
    if (unreadFromOthers.length > 0) {
      const ids = unreadFromOthers.map((m: any) => m.id);
      supabase
        .from("chat_messages")
        .update({ is_read: true, read_at: new Date().toISOString() } as any)
        .in("id", ids)
        .then(() => invalidateChatState());
    }
    supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("group_key", `chat:${selectedConvo}`)
      .eq("is_read", false)
      .then(() => invalidateChatState());
  }, [messages, selectedConvo, user]);

  // Realtime — filtered by current conversation, with PWA/network reconnect + poll fallback
  useChatRealtime({
    userId: user?.id,
    selectedConversationId: selectedConvo,
    scope: "staff",
    messageQueryKeys: [
      ["staff-chat-messages", selectedConvo],
      ["unread-message-counts"],
      ["staff-convo-unread"],
    ],
    conversationQueryKeys: [["staff-conversations"]],
  });

  // ---- Auto-scroll: target the Radix ScrollArea viewport.
  const getViewport = () =>
    scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;

  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      const dist = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      wasNearBottomRef.current = dist < 140;
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [selectedConvo]);

  const scrollToLatest = (behavior: ScrollBehavior = "smooth") => {
    const vp = getViewport();
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    if (vp) vp.scrollTo({ top: vp.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    if (!selectedConvo) return;
    lastMsgIdRef.current = null;
    wasNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToLatest("auto"));
    setTimeout(() => scrollToLatest("auto"), 80);
  }, [selectedConvo, messages?.length ? "loaded" : "empty"]);

  useEffect(() => {
    if (!messages || !messages.length) return;
    const last = messages[messages.length - 1] as any;
    if (!last?.id || last.id === lastMsgIdRef.current) return;
    const isOwn = last.sender_id === user?.id;
    lastMsgIdRef.current = last.id;
    if (isOwn || wasNearBottomRef.current) {
      requestAnimationFrame(() => scrollToLatest("smooth"));
      setTimeout(() => scrollToLatest("smooth"), 80);
    }
  }, [messages, user?.id]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConvo || !messageText.trim()) return;
      const text = messageText.trim();
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: selectedConvo,
        sender_id: user!.id,
        text_body: text,
      } as any);
      if (error) throw error;

      // Notify the parent about the staff reply
      const convo = conversations?.find((c: any) => c.id === selectedConvo);
      if (convo) {
        const subject = convo.subject || "Conversation";
        const preview = text.length > 140 ? `${text.slice(0, 137)}...` : text;
        await supabase.from("notifications").insert({
          user_id: convo.parent_id,
          title: `${staffName} · ${subject}`,
          message: preview,
          type: "chat",
          action_url: `/parent-chat?convo=${selectedConvo}`,
          group_key: `chat:${selectedConvo}`,
          reference_id: selectedConvo,
          priority: "high",
        } as any).then(() => {});
      }
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["staff-chat-messages", selectedConvo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConvo) return;
      const { error } = await supabase
        .from("conversations")
        .update({ status: "resolved" } as any)
        .eq("id", selectedConvo);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Conversation resolved" });
      queryClient.invalidateQueries({ queryKey: ["staff-conversations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedConvoData = conversations?.find((c: any) => c.id === selectedConvo);

  const deleteConvoMutation = useMutation({
    mutationFn: async (convo: any) => {
      await supabase.from("chat_messages").delete().eq("conversation_id", convo.id);
      await supabase.from("conversation_participants").delete().eq("conversation_id", convo.id);
      const { error } = await supabase.from("conversations").delete().eq("id", convo.id);
      if (error) throw error;
      await supabase.from("audit_logs" as any).insert({
        actor_id: user!.id,
        action: "delete_conversation",
        target_type: "conversation",
        target_id: convo.id,
        target_label: convo.subject || "No subject",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-conversations"] });
      setDeleteConvo(null);
      if (selectedConvo === deleteConvo?.id) setSelectedConvo(null);
      toast({ title: "Conversation deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getTranslation = (msg: any) => {
    if (!msg.translated_text || myLang === "en") return null;
    const translations = typeof msg.translated_text === "string" ? JSON.parse(msg.translated_text) : msg.translated_text;
    return translations?.[myLang] ?? null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Inbox className="h-6 w-6 text-primary" />
              Parent Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isFranchisee ? "All parent messages for your branch" : "Messages routed to you"}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Intents</SelectItem>
                <SelectItem value="concern">Concern</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="leave">Leave</SelectItem>
                <SelectItem value="academic">Academic</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sentiment</SelectItem>
                <SelectItem value="positive">🟢 Positive</SelectItem>
                <SelectItem value="neutral">🔵 Neutral</SelectItem>
                <SelectItem value="negative">🔴 Negative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid md:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-220px)]">
          {(!isMobile || !selectedConvo) && (
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Conversations</span>
                <Badge variant="secondary" className="text-[10px]">{filteredConversations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <ScrollArea className="h-[calc(100vh-300px)]">
              {!filteredConversations.length ? (
                <p className="text-center text-sm text-muted-foreground py-8">No conversations</p>
              ) : (
                filteredConversations.map((c: any) => (
                  <div
                    key={c.id}
                    className={`px-4 py-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedConvo === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                    onClick={() => setSelectedConvo(c.id)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-medium truncate flex-1">{c.subject || "No subject"}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {(convoUnreadMap[c.id] ?? 0) > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                            {convoUnreadMap[c.id]}
                          </span>
                        )}
                        {c.ai_sentiment && (
                          <span className="text-[10px]">{SENTIMENT_ICONS[c.ai_sentiment] ?? ""}</span>
                        )}
                        {c.ai_intent_tag && (
                          <Badge variant="outline" className={`text-[9px] px-1.5 ${INTENT_COLORS[c.ai_intent_tag] ?? ""}`}>
                            {c.ai_intent_tag}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      {onlineUsers.has(c.parent_id) && (
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0" title="Online" />
                      )}
                      {getParentName(c.parent_id)} · {c.students?.first_name ?? ""}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant={c.status === "open" ? "default" : "secondary"} className="text-[10px]">
                        {c.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                        </span>
                        {isSuperAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConvo(c); }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete conversation"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {c.ai_intent_tag === "concern" && c.status === "open" && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Requires attention
                      </div>
                    )}
                  </div>
                ))
              )}
            </ScrollArea>
          </Card>
          )}

          {(!isMobile || selectedConvo) && (
          <Card className="flex min-h-0 flex-col overflow-hidden">
            {selectedConvo && selectedConvoData ? (
              <>
                <CardHeader className="py-3 px-4 border-b shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isMobile && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedConvo(null)}>
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                      )}
                      <div>
                        <CardTitle className="text-sm">{selectedConvoData.subject}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {getParentName(selectedConvoData.parent_id)} · {selectedConvoData.students?.first_name} {selectedConvoData.students?.last_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedConvoData.ai_intent_tag && (
                        <Badge variant="outline" className={`text-[10px] ${INTENT_COLORS[selectedConvoData.ai_intent_tag] ?? ""}`}>
                          {selectedConvoData.ai_intent_tag}
                        </Badge>
                      )}
                      {selectedConvoData.status === "open" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <ScrollArea className="min-h-0 flex-1 p-4" ref={scrollRef}>
                  <div className="space-y-3">
                    {messages?.map((msg: any) => {
                      const isMe = msg.sender_id === user?.id;
                      const translation = getTranslation(msg);
                      const showTrans = showTranslations[msg.id];
                      return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                            {!isMe && (
                              <p className="text-[10px] font-medium mb-0.5 opacity-70">{getMsgSenderName(msg.sender_id)}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.text_body}</p>
                            {translation && !showTrans && (
                              <button
                                className="text-[10px] opacity-60 hover:opacity-100 flex items-center gap-0.5 mt-1"
                                onClick={() => setShowTranslations((p) => ({ ...p, [msg.id]: true }))}
                              >
                                <Languages className="h-3 w-3" /> Translate
                              </button>
                            )}
                            {translation && showTrans && (
                              <div className="mt-1.5 pt-1.5 border-t border-current/10">
                                <p className="text-[10px] opacity-50 mb-0.5">{LANG_LABELS[myLang] ?? myLang}</p>
                                <p className="text-xs whitespace-pre-wrap opacity-80">{translation}</p>
                              </div>
                            )}
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? "justify-end" : ""}`}>
                              <span className="text-[10px] opacity-60">
                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                              </span>
                              {isMe && (
                                <CheckCheck className={`h-3 w-3 ${msg.read_at ? "text-blue-400" : "opacity-40"}`} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} className="h-1" aria-hidden="true" />
                  </div>
                </ScrollArea>
                {/* Typing indicator */}
                {typingUsers.size > 0 && (
                  <div className="px-4 pb-1 text-xs text-muted-foreground animate-pulse shrink-0">
                    {[...typingUsers.values()].join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing...
                  </div>
                )}
                {selectedConvoData.status === "open" && (
                  <div className="border-t p-3 flex gap-2 shrink-0">
                    <Input
                      placeholder="Type a reply..."
                      value={messageText}
                      onChange={(e) => { setMessageText(e.target.value); sendTyping(); }}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMutation.mutate())}
                      className="flex-1"
                    />
                    <Button size="icon" onClick={() => sendMutation.mutate()} disabled={!messageText.trim() || sendMutation.isPending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {selectedConvoData.status === "resolved" && (
                  <div className="border-t p-3 text-center text-sm text-muted-foreground">
                    This conversation has been resolved.
                  </div>
                )}
              </>
            ) : (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation to view</p>
                </div>
              </CardContent>
            )}
          </Card>
          )}
        </div>
      </div>
      {/* Delete Conversation Confirm */}
      <ConfirmDeleteDialog
        open={!!deleteConvo}
        onOpenChange={(open) => { if (!open) setDeleteConvo(null); }}
        title="Delete Conversation"
        description={`This will permanently delete the conversation "${deleteConvo?.subject || "No subject"}" and all its messages.`}
        confirmLabel="Delete Conversation"
        confirmText={deleteConvo?.subject || "No subject"}
        affectedItems={["All chat messages in this conversation", "Participant records"]}
        isPending={deleteConvoMutation.isPending}
        onConfirm={() => deleteConvo && deleteConvoMutation.mutate(deleteConvo)}
      />
    </DashboardLayout>
  );
}
