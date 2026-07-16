import { supabase } from "@/integrations/supabase/client";

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh/.test(ua)) return "macos";
  if (/windows/.test(ua)) return "windows";
  if (/linux/.test(ua)) return "linux";
  return "other";
}

function detectDisplayMode(): string {
  if (typeof window === "undefined") return "unknown";
  // @ts-ignore - iOS non-standard
  if (window.navigator.standalone) return "standalone";
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "standalone";
  if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return "minimal-ui";
  return "browser";
}

/**
 * Fire-and-forget product analytics.
 * Never blocks UI, never throws. Failures are logged to console only.
 */
export async function track(
  eventName: string,
  properties: Record<string, unknown> = {},
  context: { role?: string | null; branchId?: string | null } = {},
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    await supabase.from("analytics_events").insert([
      {
        event_name: eventName,
        user_id: userId ?? undefined,
        role: context.role ?? undefined,
        branch_id: context.branchId ?? undefined,
        path: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        platform: detectPlatform(),
        display_mode: detectDisplayMode(),
        properties: properties as never,
      },
    ]);
  } catch (err) {
    // Analytics must never break the app
    console.warn("[analytics] track failed:", eventName, err);
  }
}