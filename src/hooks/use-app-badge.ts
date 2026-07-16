import { useEffect } from "react";

/**
 * Mirror the in-app unread notification count to the OS app icon badge
 * (iOS 16.4+, Android, desktop PWA). Best-effort — silently no-ops when
 * the API isn't available.
 */
export function useAppBadge(unreadCount: number) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as any;
    try {
      if (unreadCount > 0 && typeof nav.setAppBadge === "function") {
        nav.setAppBadge(unreadCount).catch(() => {});
      } else if (typeof nav.clearAppBadge === "function") {
        nav.clearAppBadge().catch(() => {});
      }
    } catch {
      // best-effort
    }
  }, [unreadCount]);
}