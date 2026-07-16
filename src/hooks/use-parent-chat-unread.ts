import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface ParentChatUnread {
  totalUnread: number;
  unreadByConversation: Record<string, number>;
}

export const PARENT_CHAT_UNREAD_KEY = (uid: string | undefined) =>
  ["parent-chat-unread", uid] as const;

/**
 * Single source of truth for parent chat unread counts.
 *
 * - Aggressive freshness: stale-on-mount, refetch on focus / online / mount.
 * - 5s poll only while the document is visible (so backgrounded PWAs don't
 *   drain battery/credits).
 * - Re-syncs on visibilitychange / focus / online / pageshow so reopening
 *   the PWA from background refreshes the badge inside ~100ms instead of
 *   waiting on the next interval.
 * - Exposes `bumpUnread(conversationId)` for optimistic realtime increments
 *   from useChatRealtime.
 */
export function useParentChatUnread() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<ParentChatUnread>({
    queryKey: PARENT_CHAT_UNREAD_KEY(user?.id),
    queryFn: async (): Promise<ParentChatUnread> => {
      if (!user) return { totalUnread: 0, unreadByConversation: {} };
      const { data: convos } = await supabase
        .from("conversations")
        .select("id")
        .eq("parent_id", user.id);
      const ids = (convos ?? []).map((c: any) => c.id);
      if (!ids.length) return { totalUnread: 0, unreadByConversation: {} };
      const { data } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .eq("is_read", false)
        .is("read_at", null)
        .neq("sender_id", user.id)
        .in("conversation_id", ids);
      const byConvo: Record<string, number> = {};
      let total = 0;
      for (const m of data ?? []) {
        const cid = (m as any).conversation_id;
        byConvo[cid] = (byConvo[cid] ?? 0) + 1;
        total += 1;
      }
      return { totalUnread: total, unreadByConversation: byConvo };
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 5000
        : false,
  });

  // Force-refresh on resume signals — covers iOS PWA wake-from-background
  // where realtime sockets may take a few seconds to reconnect.
  useEffect(() => {
    if (!user) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: PARENT_CHAT_UNREAD_KEY(user.id) });
      queryClient.invalidateQueries({ queryKey: ["parent-bottom-chat-unread", user.id] });
      queryClient.invalidateQueries({ queryKey: ["parent-convo-unread"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", invalidate);
    window.addEventListener("online", invalidate);
    window.addEventListener("pageshow", invalidate);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", invalidate);
      window.removeEventListener("online", invalidate);
      window.removeEventListener("pageshow", invalidate);
    };
  }, [user, queryClient]);

  // Global realtime subscription for parent chat unread — runs on EVERY
  // parent page (Today / Journey / Progress / Fees / etc.) so the bottom
  // tab badge updates within ~1s instead of waiting on the 5s poll.
  const convoIdsRef = useRef<string[]>([]);
  convoIdsRef.current = Object.keys(query.data?.unreadByConversation ?? {});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let knownIds: Set<string> = new Set();

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: PARENT_CHAT_UNREAD_KEY(user.id) });
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      queryClient.invalidateQueries({ queryKey: ["parent-conversations", user.id] });
    };

    const setup = async () => {
      const { data: convos } = await supabase
        .from("conversations")
        .select("id")
        .eq("parent_id", user.id);
      if (cancelled) return;
      knownIds = new Set((convos ?? []).map((c: any) => c.id));

      channel = supabase
        .channel(`parent-chat-unread-global-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" } as any,
          (payload: any) => {
            const row = payload?.new;
            if (!row || row.sender_id === user.id) return;
            if (!knownIds.has(row.conversation_id)) {
              // New conversation — refetch to pick it up.
              invalidateAll();
              return;
            }
            bumpParentChatUnread(queryClient, user.id, row.conversation_id);
            invalidateAll();
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chat_messages" } as any,
          () => {
            invalidateAll();
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "conversations", filter: `parent_id=eq.${user.id}` } as any,
          (payload: any) => {
            const id = payload?.new?.id;
            if (id) knownIds.add(id);
            invalidateAll();
          },
        )
        .subscribe();
    };

    setup();

    return () => {
      cancelled = true;
      if (channel) { try { supabase.removeChannel(channel); } catch {} }
    };
  }, [user, queryClient]);

  return {
    totalUnread: query.data?.totalUnread ?? 0,
    unreadByConversation: query.data?.unreadByConversation ?? {},
    refetchUnread: query.refetch,
  };
}

/**
 * Optimistically increment the unread counter for a conversation (called
 * by realtime on incoming chat_messages INSERT). Safe even if the query
 * hasn't fetched yet — server refetch will reconcile.
 */
export function bumpParentChatUnread(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  conversationId: string,
) {
  queryClient.setQueryData<ParentChatUnread>(
    PARENT_CHAT_UNREAD_KEY(userId),
    (old) => {
      const prev = old ?? { totalUnread: 0, unreadByConversation: {} };
      return {
        totalUnread: prev.totalUnread + 1,
        unreadByConversation: {
          ...prev.unreadByConversation,
          [conversationId]: (prev.unreadByConversation[conversationId] ?? 0) + 1,
        },
      };
    },
  );
}