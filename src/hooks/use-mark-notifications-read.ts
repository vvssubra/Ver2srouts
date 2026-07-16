import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Mark all unread notifications of the given types as read for the current
 * user when this page mounts. Used to auto-clear notifications when the
 * parent lands on the destination page (school documents, fees, messages),
 * regardless of whether they arrived from the bell, an OS push tap, or
 * direct navigation.
 *
 * Best-effort: failures are swallowed; query caches are invalidated on
 * success so the bell badge updates immediately.
 */
export function useMarkNotificationsRead(types: string[]) {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user?.id || !types.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("is_read", false)
          .in("type", types);
        if (error || cancelled) return;
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        qc.invalidateQueries({ queryKey: ["notification-feed"] });
        qc.invalidateQueries({ queryKey: ["parent-home-school-updates", user.id] });
        try {
          // @ts-ignore – setAppBadge not in TS lib yet
          if (typeof navigator !== "undefined" && (navigator as any).clearAppBadge) {
            (navigator as any).clearAppBadge?.();
          }
        } catch {}
      } catch {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, types.join("|")]);
}