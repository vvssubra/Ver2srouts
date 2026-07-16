import type { NotificationRow } from "./hr-types";

/**
 * Pure business logic for the Notifications inbox screen. Kept free of
 * any Supabase/React Native imports so it can be unit tested without
 * rendering anything or touching the network.
 */

/**
 * Sorts notifications newest-first by `created_at`. Stable for equal
 * timestamps (preserves the original relative order of ties) and never
 * mutates the input array.
 */
export function sortNotificationsByRecency(rows: NotificationRow[]): NotificationRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime();
      if (diff !== 0) return diff;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/**
 * Counts unread notifications. `is_read` is treated as unread whenever
 * it is false or nullish (a row missing the flag shouldn't silently
 * disappear from the unread count).
 */
export function unreadCount(rows: NotificationRow[]): number {
  return rows.reduce((count, row) => (row.is_read ? count : count + 1), 0);
}

/**
 * Best-effort mapping from a notification's action_url to a known
 * in-app route, matching the shape HomeScreen's quick actions already
 * pass to `navigation.getParent()?.navigate(tab, params)`. Returns null
 * when the URL doesn't confidently match a recognized module, so the
 * caller can simply not navigate rather than guess.
 */
export type RecognizedRoute =
  | { tab: "AttendanceTab" }
  | { tab: "LeaveTab" }
  | { tab: "MoreTab"; screen: "Claims" }
  | { tab: "MoreTab"; screen: "Overtime" };

export function recognizeActionRoute(actionUrl: string | null): RecognizedRoute | null {
  if (!actionUrl) return null;
  const lower = actionUrl.toLowerCase();
  if (lower.includes("leave")) return { tab: "LeaveTab" };
  if (lower.includes("claim")) return { tab: "MoreTab", screen: "Claims" };
  if (lower.includes("overtime")) return { tab: "MoreTab", screen: "Overtime" };
  if (lower.includes("attendance")) return { tab: "AttendanceTab" };
  return null;
}
