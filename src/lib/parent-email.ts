import { supabase } from "@/integrations/supabase/client";
import { sendTemplateEmail } from "./notify";

type Recipient = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * Fan out a transactional email to every approved parent of `studentId`.
 *
 * - Resolves approved linked parents from `parent_students`.
 * - Skips parents without a profile email.
 * - Routes through the existing `sendTemplateEmail` -> `send-transactional-email`
 *   pipeline, which already handles suppression/unsubscribe + idempotency.
 * - Idempotency: caller provides a stable `idempotencyKeyPrefix`; the existing
 *   helper appends `-{parentId}` so retries / duplicate triggers are blocked
 *   per recipient.
 * - Best-effort: never throws into UI flows.
 */
export async function sendParentEmailForStudent(
  studentId: string,
  templateName: string,
  buildTemplateData: (recipient: Recipient) => Record<string, any>,
  idempotencyKeyPrefix: string
): Promise<void> {
  if (!studentId || !templateName || !idempotencyKeyPrefix) return;
  try {
    const { data: links, error } = await supabase
      .from("parent_students")
      .select("parent_id")
      .eq("student_id", studentId)
      .eq("status", "approved");
    if (error) {
      console.warn("[parent-email] parent_students lookup failed", error.message);
      return;
    }
    const parentIds = Array.from(
      new Set((links ?? []).map((r: any) => r.parent_id).filter(Boolean))
    );
    if (!parentIds.length) return;

    // Filter to parents that actually have an email.
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", parentIds);
    const withEmail = (profs ?? []).filter((p: any) => !!p.email);
    const skipped = parentIds.length - withEmail.length;
    if (skipped > 0) {
      console.info(
        `[parent-email] ${skipped} parent(s) skipped: no email on profile (student=${studentId}, template=${templateName})`
      );
    }
    if (!withEmail.length) return;

    await sendTemplateEmail(
      withEmail.map((p: any) => p.id),
      templateName,
      buildTemplateData,
      idempotencyKeyPrefix
    );
  } catch (e: any) {
    // best-effort — never break the caller
    console.warn("[parent-email] send failed", e?.message ?? e);
  }
}