/**
 * Resolve the production app base URL used in transactional email CTAs and
 * other server-side links. Prefers env vars so we never ship the wrong domain
 * after rebranding; falls back to the current production domain.
 */
export function getAppBaseUrl(): string {
  const fromEnv =
    Deno.env.get("APP_PUBLIC_URL") ||
    Deno.env.get("APP_BASE_URL") ||
    Deno.env.get("PUBLIC_APP_URL");
  const url = (fromEnv || "https://sprouts.littlegreenhearts.com").trim();
  return url.replace(/\/+$/, "");
}