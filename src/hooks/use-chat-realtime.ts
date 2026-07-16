import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { bumpParentChatUnread, PARENT_CHAT_UNREAD_KEY } from "@/hooks/use-parent-chat-unread";

/**
 * Reliable realtime for chat surfaces.
 * - Filters by conversation_id when one is selected (no more global broadcast).
 * - Resubscribes on tab visibility + network online events (PWA backgrounding,
 *   WiFi <-> cellular handoff).
 * - Falls back to polling every 20s if the channel never reaches SUBSCRIBED.
 */
export function useChatRealtime(opts: {
  userId: string | undefined;
  selectedConversationId: string | null;
  /** Query keys to invalidate on any chat_messages event. */
  messageQueryKeys: any[][];
  /** Query keys to invalidate on any conversations event. */
  conversationQueryKeys: any[][];
  /** Unique scope (e.g. "parent" or "staff") to avoid channel-name collisions. */
  scope: string;
}) {
  const { userId, selectedConversationId, messageQueryKeys, conversationQueryKeys, scope } = opts;
  const queryClient = useQueryClient();
  const statusRef = useRef<string>("idle");
  const reconnectKey = useRef(0);
  // Latest query keys (avoid stale closure when component re-renders).
  const keysRef = useRef({ messageQueryKeys, conversationQueryKeys });
  keysRef.current = { messageQueryKeys, conversationQueryKeys };

  // Invalidate all relevant queries — used by realtime callbacks and fallbacks.
  const invalidateAll = () => {
    for (const k of keysRef.current.messageQueryKeys) queryClient.invalidateQueries({ queryKey: k });
    for (const k of keysRef.current.conversationQueryKeys) queryClient.invalidateQueries({ queryKey: k });
  };

  // Optimistically push an INSERTed message into the active conversation cache
  // so the new row appears within ~tens of ms, without waiting on the refetch.
  const pushInsert = (row: any) => {
    if (!row || !row.id || !row.conversation_id) return;
    for (const key of keysRef.current.messageQueryKeys) {
      // Only message-list keys are shaped like ["...chat-messages", convoId].
      const tail = key[key.length - 1];
      if (tail !== row.conversation_id) continue;
      queryClient.setQueryData(key, (old: any) => {
        const arr = Array.isArray(old) ? old : [];
        if (arr.some((m: any) => m?.id === row.id)) return arr;
        return [...arr, row];
      });
    }
  };

  // Optimistic unread bump for parent scope so the bottom-bar badge and
  // per-conversation bubble appear within ~1s instead of waiting on the
  // refetch that follows realtime invalidation.
  const maybeBumpUnread = (row: any) => {
    if (!row || !userId) return;
    if (scope !== "parent") return;
    if (row.sender_id === userId) return;
    if (row.conversation_id === selectedConversationId) return;
    bumpParentChatUnread(queryClient, userId, row.conversation_id);
  };

  useEffect(() => {
    if (!userId) return;
    const tick = reconnectKey.current;
    const channelName = `${scope}-chat-${userId}-${selectedConversationId ?? "list"}-${tick}-${Date.now()}`;

    // Active-conversation channel: filtered for low-latency INSERT delivery.
    const convoChannel = selectedConversationId
      ? supabase
          .channel(`${channelName}-convo`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `conversation_id=eq.${selectedConversationId}`,
            } as any,
            (payload: any) => {
              pushInsert(payload?.new);
              for (const k of keysRef.current.messageQueryKeys) {
                queryClient.invalidateQueries({ queryKey: k });
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "chat_messages",
              filter: `conversation_id=eq.${selectedConversationId}`,
            } as any,
            () => {
              for (const k of keysRef.current.messageQueryKeys) {
                queryClient.invalidateQueries({ queryKey: k });
              }
            },
          )
          .subscribe((status) => {
            statusRef.current = status;
          })
      : null;

    // List channel: catches new conversations + any chat_messages activity so
    // unread badges + conversation order update even when not viewing a thread.
    const listChannel = supabase
      .channel(`${channelName}-list`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" } as any,
        (payload: any) => {
          const row = payload?.new;
          // If it belongs to the open conversation, also push it (covers the
          // unlikely case the filtered channel is still subscribing).
          if (row?.conversation_id === selectedConversationId) pushInsert(row);
          maybeBumpUnread(row);
          for (const k of keysRef.current.messageQueryKeys) {
            queryClient.invalidateQueries({ queryKey: k });
          }
          if (scope === "parent" && userId) {
            queryClient.invalidateQueries({ queryKey: PARENT_CHAT_UNREAD_KEY(userId) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" } as any,
        () => {
          for (const k of keysRef.current.conversationQueryKeys) {
            queryClient.invalidateQueries({ queryKey: k });
          }
        },
      )
      .subscribe();

    // Fallback poll only if the active-convo channel never subscribes (network
    // failure, websocket blocked, etc.).
    const poll = setInterval(() => {
      if (statusRef.current !== "SUBSCRIBED") invalidateAll();
    }, 15000);

    // Reconnect: invalidate and force a new channel on next render.
    const reconnect = () => {
      invalidateAll();
      if (statusRef.current !== "SUBSCRIBED" && selectedConversationId) {
        reconnectKey.current += 1;
        // Trigger effect re-run by remounting through ref bump; cleanest is to
        // simply remove + recreate in place.
        try { if (convoChannel) supabase.removeChannel(convoChannel); } catch {}
        const retry = supabase
          .channel(`${scope}-chat-${userId}-${selectedConversationId}-r${reconnectKey.current}-${Date.now()}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `conversation_id=eq.${selectedConversationId}`,
            } as any,
            (payload: any) => {
              pushInsert(payload?.new);
              for (const k of keysRef.current.messageQueryKeys) {
                queryClient.invalidateQueries({ queryKey: k });
              }
            },
          )
          .subscribe((s) => { statusRef.current = s; });
        (listChannel as any)._retry = retry;
      }
    };

    const onVisibility = () => { if (document.visibilityState === "visible") reconnect(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      try { if (convoChannel) supabase.removeChannel(convoChannel); } catch {}
      try { supabase.removeChannel(listChannel); } catch {}
      const retry = (listChannel as any)._retry;
      if (retry) { try { supabase.removeChannel(retry); } catch {} }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedConversationId, scope]);
}