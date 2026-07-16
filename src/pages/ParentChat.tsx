import { useState, useEffect, useLayoutEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Send, Plus, Loader2, CheckCheck, Moon, Languages, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useParentChatUnread, PARENT_CHAT_UNREAD_KEY } from "@/hooks/use-parent-chat-unread";

const INTENT_COLORS: Record<string, string> = {
  concern: "bg-destructive/15 text-destructive",
  billing: "bg-primary/15 text-primary",
  leave: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]",
  academic: "bg-accent/15 text-accent",
  general: "bg-muted text-muted-foreground",
};

const LANG_LABELS: Record<string, string> = { en: "English", ms: "Bahasa Melayu", zh: "中文", ta: "தமிழ்" };

export default function ParentChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedConvo, setSelectedConvo] = useState<string | null>(
    searchParams.get("convo")
  );
  // Keep URL <-> state in sync (so notification deep-links open the right thread).
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
  const [newSubjectPreset, setNewSubjectPreset] = useState("");
  const [newSubjectCustom, setNewSubjectCustom] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newChildId, setNewChildId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTranslations, setShowTranslations] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const lastMsgIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const userName = user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name ?? ""}`.trim()
    : "Parent";
  const { onlineUsers, typingUsers, sendTyping } = useChatPresence(selectedConvo, user?.id, userName);

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

  // Get children
  const { data: children } = useQuery({
    queryKey: ["my-children-chat", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_students")
        .select("student_id, students(id, first_name, last_name, branch_id)")
        .eq("parent_id", user!.id);
      return (data ?? []).map((d: any) => d.students).filter(Boolean);
    },
    enabled: !!user,
  });

  // Get conversations
  const { data: conversations } = useQuery({
    queryKey: ["parent-conversations", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*, students(first_name, last_name)")
        .eq("parent_id", user!.id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Get messages for selected conversation
  const { data: messages } = useQuery({
    queryKey: ["chat-messages", selectedConvo],
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

  // Get sender profiles
  const senderIds = [...new Set(messages?.map((m: any) => m.sender_id) ?? [])];
  const { data: profiles } = useQuery({
    queryKey: ["chat-profiles", senderIds],
    queryFn: async () => {
      if (!senderIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name, is_quiet_hours_enabled, quiet_hours_start, quiet_hours_end").in("id", senderIds);
      return data ?? [];
    },
    enabled: senderIds.length > 0,
  });

  // Get conversation participants to check quiet hours
  const { data: participants } = useQuery({
    queryKey: ["convo-participants", selectedConvo],
    queryFn: async () => {
      if (!selectedConvo) return [];
      const { data } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", selectedConvo);
      return data ?? [];
    },
    enabled: !!selectedConvo,
  });

  // Check if any staff participant is in quiet hours
  const participantIds = participants?.map((p: any) => p.user_id) ?? [];
  const { data: staffProfiles } = useQuery({
    queryKey: ["staff-quiet-hours", participantIds],
    queryFn: async () => {
      if (!participantIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, is_quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
        .in("id", participantIds);
      return data ?? [];
    },
    enabled: participantIds.length > 0,
  });

  const getQuietHoursStaff = () => {
    if (!staffProfiles) return null;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    for (const sp of staffProfiles as any[]) {
      if (!sp.is_quiet_hours_enabled || !sp.quiet_hours_start || !sp.quiet_hours_end) continue;
      const start = sp.quiet_hours_start.slice(0, 5);
      const end = sp.quiet_hours_end.slice(0, 5);
      // Handle overnight ranges (e.g. 18:00 - 08:00)
      const inRange = start <= end
        ? currentTime >= start && currentTime < end
        : currentTime >= start || currentTime < end;
      if (inRange) return { name: `${sp.first_name ?? ""} ${sp.last_name ?? ""}`.trim(), endTime: end };
    }
    return null;
  };

  const quietStaff = getQuietHoursStaff();

  const getName = (id: string) => {
    if (id === user?.id) return "You";
    const p = profiles?.find((pr: any) => pr.id === id);
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Staff" : "Staff";
  };

  const invalidateChatState = () => {
    queryClient.invalidateQueries({ queryKey: ["chat-messages", selectedConvo] });
    queryClient.invalidateQueries({ queryKey: ["parent-conversations"] });
    queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
    queryClient.invalidateQueries({ queryKey: ["parent-convo-unread"] });
    queryClient.invalidateQueries({ queryKey: ["parent-bottom-chat-unread"] });
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: PARENT_CHAT_UNREAD_KEY(user.id) });
    }
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
        .then(() => {
          if (user?.id && selectedConvo) {
            queryClient.setQueryData(PARENT_CHAT_UNREAD_KEY(user.id), (old: any) => {
              if (!old) return old;
              const current = old.unreadByConversation[selectedConvo] ?? 0;
              const nextByConversation = { ...old.unreadByConversation };
              delete nextByConversation[selectedConvo];
              return {
                totalUnread: Math.max(0, old.totalUnread - current),
                unreadByConversation: nextByConversation,
              };
            });
          }
          invalidateChatState();
        });
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
    scope: "parent",
    messageQueryKeys: [
      ["chat-messages", selectedConvo],
      ["unread-message-counts"],
      ["parent-convo-unread"],
    ],
    conversationQueryKeys: [["parent-conversations"]],
  });

  // ---- Auto-scroll: target the Radix ScrollArea viewport (the outer node is
  // not the scroll container) and only auto-scroll when it's the user's own
  // message or they were already near the bottom.
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

  // Snap instantly to the bottom whenever a conversation is opened/changed.
  useLayoutEffect(() => {
    if (!selectedConvo) return;
    lastMsgIdRef.current = null;
    wasNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToLatest("auto"));
    setTimeout(() => scrollToLatest("auto"), 80);
  }, [selectedConvo, messages?.length ? "loaded" : "empty"]);

  // Smart smooth-scroll on new messages.
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

  // Per-conversation unread counts
  const { unreadByConversation: parentConvoUnreadMap } = useParentChatUnread();

  // Send message
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

      // Notify all conversation participants (staff) about the follow-up
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", selectedConvo)
        .neq("user_id", user!.id);
      const convo = conversations?.find((c: any) => c.id === selectedConvo);
      if (parts?.length) {
        const subject = convo?.subject || "Conversation";
        const preview = text.length > 140 ? `${text.slice(0, 137)}...` : text;
        const notifs = parts.map((p: any) => ({
          user_id: p.user_id,
          title: `${userName} · ${subject}`,
          message: preview,
          type: "chat",
          action_url: `/staff-inbox?convo=${selectedConvo}`,
          group_key: `chat:${selectedConvo}`,
          reference_id: selectedConvo,
          priority: "high",
        }));
        await supabase.from("notifications").insert(notifs as any).then(() => {});
      }
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", selectedConvo] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // New conversation
  const newConvoMutation = useMutation({
    mutationFn: async () => {
      const subject = newSubjectPreset === "custom" ? newSubjectCustom.trim() : newSubjectPreset;
      if (!newChildId || !subject || !newMessage.trim()) return;
      const child = children?.find((c: any) => c.id === newChildId);
      if (!child) throw new Error("Child not found");

      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .insert({
          branch_id: child.branch_id,
          student_id: newChildId,
          parent_id: user!.id,
          subject,
        } as any)
        .select()
        .single();
      if (convoErr) throw convoErr;

      const { error: msgErr } = await supabase.from("chat_messages").insert({
        conversation_id: convo.id,
        sender_id: user!.id,
        text_body: newMessage.trim(),
      } as any);
      if (msgErr) throw msgErr;

      supabase.functions.invoke("classify-message", {
        body: { conversation_id: convo.id, message_text: newMessage.trim() },
      });

      return convo;
    },
    onSuccess: (convo) => {
      setDialogOpen(false);
      setNewSubjectPreset("");
      setNewSubjectCustom("");
      setNewMessage("");
      setNewChildId("");
      if (convo) setSelectedConvo(convo.id);
      queryClient.invalidateQueries({ queryKey: ["parent-conversations"] });
      toast({ title: "Conversation started", description: "Your message is being routed to the right team member." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedConvoData = conversations?.find((c: any) => c.id === selectedConvo);

  const getTranslation = (msg: any) => {
    if (!msg.translated_text || myLang === "en") return null;
    const translations = typeof msg.translated_text === "string" ? JSON.parse(msg.translated_text) : msg.translated_text;
    return translations?.[myLang] ?? null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-primary" />
              Chat with School
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Send messages directly to your child's teachers</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Conversation</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a Conversation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Select value={newChildId} onValueChange={setNewChildId}>
                  <SelectTrigger><SelectValue placeholder="Select child" /></SelectTrigger>
                  <SelectContent>
                    {children?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newSubjectPreset} onValueChange={(v) => { setNewSubjectPreset(v); if (v !== "custom") setNewSubjectCustom(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Leave">Leave</SelectItem>
                    <SelectItem value="Billing">Billing</SelectItem>
                    <SelectItem value="Academic">Academic</SelectItem>
                    <SelectItem value="Concern">Concern</SelectItem>
                    <SelectItem value="Health">Health</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {newSubjectPreset === "custom" && (
                  <Input placeholder="Enter custom subject" value={newSubjectCustom} onChange={(e) => setNewSubjectCustom(e.target.value)} />
                )}
                <Textarea placeholder="Your message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={4} />
                <Button className="w-full" onClick={() => newConvoMutation.mutate()} disabled={!newChildId || !newSubjectPreset || (newSubjectPreset === "custom" && !newSubjectCustom.trim()) || !newMessage.trim() || newConvoMutation.isPending}>
                  {newConvoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Send
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid md:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)]">
          {/* Conversation List */}
          {(!isMobile || !selectedConvo) && (
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Conversations</CardTitle>
            </CardHeader>
            <ScrollArea className="h-[calc(100vh-300px)]">
              {!conversations?.length ? (
                <p className="text-center text-sm text-muted-foreground py-8">No conversations yet</p>
              ) : (
                conversations.map((c: any) => (
                  <div
                    key={c.id}
                    className={`px-4 py-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${selectedConvo === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                    onClick={() => setSelectedConvo(c.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{c.subject || "No subject"}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {(parentConvoUnreadMap[c.id] ?? 0) > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                            {parentConvoUnreadMap[c.id]}
                          </span>
                        )}
                        {c.ai_intent_tag && c.ai_intent_tag !== "general" && (
                          <Badge variant="outline" className={`text-[10px] ml-1 ${INTENT_COLORS[c.ai_intent_tag] ?? ""}`}>
                            {c.ai_intent_tag}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.students ? `${c.students.first_name} ${c.students.last_name}` : ""}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge variant={c.status === "open" ? "default" : "secondary"} className="text-[10px]">
                        {c.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
          </Card>
          )}

          {/* Chat Panel */}
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
                        {selectedConvoData.students?.first_name} {selectedConvoData.students?.last_name}
                      </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {selectedConvoData.ai_intent_tag && (
                        <Badge variant="outline" className={`text-[10px] ${INTENT_COLORS[selectedConvoData.ai_intent_tag] ?? ""}`}>
                          {selectedConvoData.ai_intent_tag}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Quiet Hours Banner */}
                {quietStaff && (
                  <div className="bg-muted/80 px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground border-b shrink-0">
                    <Moon className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>{quietStaff.name || "Teacher"}</strong> is currently away. Messages will be notified at <strong>{quietStaff.endTime}</strong>.
                    </span>
                  </div>
                )}

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
                              <p className="text-[10px] font-medium mb-0.5 opacity-70">{getName(msg.sender_id)}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.text_body}</p>
                            {/* Translation */}
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
                  <div className="border-t p-3 pb-safe-plus-2 flex gap-2 shrink-0">
                    <Input
                      placeholder="Type a message..."
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
                  <div className="border-t p-3 pb-safe-plus-2 text-center text-sm text-muted-foreground">
                    This conversation has been resolved.
                  </div>
                )}
              </>
            ) : (
              <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation or start a new one</p>
                </div>
              </CardContent>
            )}
          </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
