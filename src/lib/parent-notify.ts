import { supabase } from "@/integrations/supabase/client";
import { notifyUsers } from "./notify";

/**
 * Unified parent notification helper. Always inserts into `public.notifications`;
 * the `notify_push_on_insert` DB trigger forwards the payload (title, message,
 * action_url, group_key, type, notification_id) to `send-push-notification`,
 * which encrypts and delivers Web Push to every subscription for the user.
 *
 * NEVER call the push edge function directly from the client. Always go through
 * the notifications table so push delivery is logged and consistent.
 */
export async function notifyParents(args: {
  userIds: string[];
  title: string;
  message: string;
  /** chat | billing | announcement | newsletter | learning_journey | timeline_update | progress | ... */
  type: string;
  /** Deep-link target opened when the parent taps the push (e.g. "/parent-fees"). */
  actionUrl: string;
  /** Domain object id (invoice id, conversation id, observation id, ...). */
  referenceId?: string;
  /** Grouping key — duplicate pushes for the same group_key replace each other. */
  groupKey?: string;
  priority?: "low" | "normal" | "high";
}) {
  const recipients = Array.from(new Set((args.userIds ?? []).filter(Boolean)));
  if (!recipients.length) return;
  await notifyUsers(
    recipients,
    args.title,
    args.message,
    args.type,
    args.referenceId,
    args.actionUrl,
    args.groupKey,
    args.priority ?? "normal"
  );
}

/**
 * Notify all approved parents of a given student. Fan-out is best-effort:
 * inserts go to the `notifications` table and the
 * `notify_push_on_insert` DB trigger forwards each row to the
 * `send-push-notification` edge function automatically.
 */
export async function notifyStudentParents(
  studentId: string,
  title: string,
  message: string,
  type: string,
  options?: {
    actionUrl?: string;
    referenceId?: string;
    groupKey?: string;
    priority?: "low" | "normal" | "high";
    excludeUserId?: string | null;
  }
) {
  if (!studentId) return;
  try {
    const { data, error } = await supabase
      .from("parent_students")
      .select("parent_id")
      .eq("student_id", studentId)
      .eq("status", "approved");
    if (error) return;
    const parentIds = (data ?? [])
      .map((r: any) => r.parent_id)
      .filter((id: string) => id && id !== options?.excludeUserId);
    if (!parentIds.length) return;
    await notifyUsers(
      parentIds,
      title,
      message,
      type,
      options?.referenceId,
      options?.actionUrl,
      options?.groupKey,
      options?.priority ?? "normal"
    );
  } catch {
    // best-effort
  }
}

/**
 * Fan out to parents of multiple students at once (deduplicated).
 */
export async function notifyManyStudentParents(
  studentIds: string[],
  title: string,
  message: string,
  type: string,
  options?: Parameters<typeof notifyStudentParents>[4]
) {
  const unique = Array.from(new Set(studentIds.filter(Boolean)));
  if (!unique.length) return;
  try {
    const { data, error } = await supabase
      .from("parent_students")
      .select("parent_id, student_id")
      .in("student_id", unique)
      .eq("status", "approved");
    if (error) return;
    const parentIds = Array.from(
      new Set(
        (data ?? [])
          .map((r: any) => r.parent_id)
          .filter((id: string) => id && id !== options?.excludeUserId)
      )
    );
    if (!parentIds.length) return;
    await notifyUsers(
      parentIds,
      title,
      message,
      type,
      options?.referenceId,
      options?.actionUrl,
      options?.groupKey,
      options?.priority ?? "normal"
    );
  } catch {
    // best-effort
  }
}