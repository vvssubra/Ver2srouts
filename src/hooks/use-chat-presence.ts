import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceState {
  onlineUsers: Set<string>;
  typingUsers: Map<string, string>; // user_id -> display name
}

export function useChatPresence(
  conversationId: string | null,
  userId: string | undefined,
  userName: string
) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingClearTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!conversationId || !userId) return;

    const channel = supabase.channel(`chat-presence-${conversationId}`, {
      config: { presence: { key: userId } },
    });

    // Presence: online status
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        ids.add(key);
      }
      setOnlineUsers(ids);
    });

    // Broadcast: typing indicator
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.user_id === userId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(payload.user_id, payload.name);
        return next;
      });

      // Clear after 3s
      const existing = typingClearTimers.current.get(payload.user_id);
      if (existing) clearTimeout(existing);
      typingClearTimers.current.set(
        payload.user_id,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.delete(payload.user_id);
            return next;
          });
          typingClearTimers.current.delete(payload.user_id);
        }, 3000)
      );
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: userId,
          name: userName,
          online_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;

    return () => {
      typingClearTimers.current.forEach((t) => clearTimeout(t));
      typingClearTimers.current.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, userId, userName]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !userId) return;
    
    // Debounce: only send every 2s
    if (typingTimeoutRef.current) return;
    
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: userId, name: userName },
    });

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [userId, userName]);

  return { onlineUsers, typingUsers, sendTyping };
}
