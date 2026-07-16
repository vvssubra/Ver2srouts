import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { notifyUsers } from "@/lib/notify";

interface Props {
  updateId: string;
}

export function MomentEngagement({ updateId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const { data: reactions = [] } = useQuery({
    queryKey: ["moment-reactions", updateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("moment_reactions")
        .select("id, user_id, kind")
        .eq("update_id", updateId);
      return data ?? [];
    },
    enabled: !!updateId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["moment-comments", updateId],
    queryFn: async () => {
      // Fetch comments first (no embedded join — the FK was missing in the past
      // and would silently swallow the whole result set, hiding fresh comments).
      const { data: rows, error } = await supabase
        .from("moment_comments")
        .select("id, author_id, body, created_at")
        .eq("update_id", updateId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return list;
      const authorIds = Array.from(new Set(list.map((c: any) => c.author_id).filter(Boolean)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url")
        .in("id", authorIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return list.map((c: any) => ({ ...c, profile: map.get(c.author_id) ?? null }));
    },
    enabled: !!updateId,
  });

  // Realtime subscription for fresh engagement
  useEffect(() => {
    if (!updateId) return;
    const channel = supabase
      .channel(`moment-${updateId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "moment_reactions", filter: `update_id=eq.${updateId}` },
        () => qc.invalidateQueries({ queryKey: ["moment-reactions", updateId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "moment_comments", filter: `update_id=eq.${updateId}` },
        () => qc.invalidateQueries({ queryKey: ["moment-comments", updateId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [updateId, qc]);

  const myReaction = useMemo(
    () => reactions.find((r: any) => r.user_id === user?.id) as any,
    [reactions, user?.id],
  );

  const toggleHeart = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to react");
      if (myReaction) {
        const { error } = await supabase.from("moment_reactions").delete().eq("id", myReaction.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("moment_reactions")
          .insert({ update_id: updateId, user_id: user.id, kind: "heart" });
        if (error) throw error;
        // Notify the teacher who authored the story (skip self-likes).
        try {
          const { data: upd } = await supabase
            .from("child_updates")
            .select("created_by, caption")
            .eq("id", updateId)
            .maybeSingle();
          if (upd?.created_by && upd.created_by !== user.id) {
            const { data: me } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", user.id)
              .maybeSingle();
            const who = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "A parent";
            await notifyUsers(
              [upd.created_by],
              "New like on your story",
              `${who} liked your story${upd.caption ? `: "${upd.caption.slice(0, 60)}"` : ""}.`,
              "story_engagement",
              updateId,
              "/daily-updates",
              `story-like-${updateId}`,
              "normal",
            );
          }
        } catch { /* best-effort */ }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["moment-reactions", updateId] }),
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!user || !body.trim()) return;
      const { error } = await supabase
        .from("moment_comments")
        .insert({ update_id: updateId, author_id: user.id, body: body.trim() });
      if (error) throw error;
      // Notify the teacher who authored the story (skip self-comments).
      try {
        const { data: upd } = await supabase
          .from("child_updates")
          .select("created_by, caption")
          .eq("id", updateId)
          .maybeSingle();
        if (upd?.created_by && upd.created_by !== user.id) {
          const { data: me } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", user.id)
            .maybeSingle();
          const who = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "A parent";
          await notifyUsers(
            [upd.created_by],
            "New comment on your story",
            `${who}: ${body.trim().slice(0, 120)}`,
            "story_engagement",
            updateId,
              "/daily-updates",
            `story-comment-${updateId}`,
            "normal",
          );
        }
      } catch { /* best-effort */ }
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["moment-comments", updateId] });
    },
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={myReaction ? "default" : "outline"}
          className="h-8"
          onClick={() => toggleHeart.mutate()}
          disabled={toggleHeart.isPending}
        >
          <Heart className={`h-4 w-4 mr-1 ${myReaction ? "fill-current" : ""}`} />
          {reactions.length}
        </Button>
        <span className="text-xs text-muted-foreground">{comments.length} comment{comments.length === 1 ? "" : "s"}</span>
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Be the first to comment.</p>
        ) : (
          comments.map((c: any) => (
            <div key={c.id} className="rounded-md bg-muted/40 p-2">
              <p className="text-xs font-medium">
                {c.profile?.first_name ?? "Someone"} {c.profile?.last_name ?? ""}
                <span className="ml-2 text-muted-foreground font-normal">{format(new Date(c.created_at), "d MMM HH:mm")}</span>
              </p>
              <p className="text-sm whitespace-pre-wrap mt-0.5">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={1}
          className="min-h-[40px]"
        />
        <Button size="sm" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}