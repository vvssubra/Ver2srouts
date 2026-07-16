/**
 * Resolve the production app base URL used in client-built email CTA links
 * and other shared links. Reads Vite env first so we never ship the wrong
 * domain after rebranding; falls back to the current production domain.
 *
 * Never returns the lovable preview/published domain, localhost, or an empty
 * string — those would break parent emails.
 */
export function getClientAppBaseUrl(): string {
  const env = (import.meta as any)?.env ?? {};
  const candidate =
    env.VITE_APP_PUBLIC_URL ||
    env.VITE_PUBLIC_APP_URL ||
    env.PUBLIC_APP_URL ||
    "";
  const url =
    (typeof candidate === "string" && candidate.trim()) ||
    "https://sprouts.littlegreenhearts.com";
  return url.replace(/\/+$/, "");
}

/** Build an absolute parent-app URL from a path like "/parent-fees". */
export function buildAppUrl(path: string): string {
  const base = getClientAppBaseUrl();
  if (!path) return base;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}