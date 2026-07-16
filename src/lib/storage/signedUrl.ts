import { supabase } from "@/integrations/supabase/client";

/**
 * Buckets that have been made private. Stored URLs for these buckets
 * must be signed URLs (the legacy /object/public/... URLs will 404).
 */
export const PRIVATE_BUCKETS = new Set([
  "staff-documents",
  "staff-claims",
  "leave-attachments",
  "audit-evidence",
  "observation-evidence",
]);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Upload a file to a private bucket and return a long-lived signed URL
 * suitable for storing in a DB column. Falls back to public URL for
 * non-private buckets.
 */
export async function uploadAndSign(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; ttlSeconds?: number }
): Promise<string> {
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: options?.upsert ?? false });
  if (uploadErr) throw uploadErr;

  if (PRIVATE_BUCKETS.has(bucket)) {
    const ttl = options?.ttlSeconds ?? ONE_YEAR_SECONDS;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) throw error ?? new Error("Failed to sign URL");
    return data.signedUrl;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Extract the storage path from any Supabase storage URL (public or signed).
 * Returns null if the URL does not match the expected format.
 */
export function extractStoragePath(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // public:  /storage/v1/object/public/<bucket>/<path>
    // signed:  /storage/v1/object/sign/<bucket>/<path>?token=...
    // authd:   /storage/v1/object/authenticated/<bucket>/<path>
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/**
 * Resolve a stored URL (possibly a legacy public URL) into a viewable signed
 * URL if it points to a private bucket. Otherwise returns the URL unchanged.
 */
export async function resolveViewableUrl(url: string, ttlSeconds = 3600): Promise<string> {
  const parsed = extractStoragePath(url);
  if (!parsed) return url;
  if (!PRIVATE_BUCKETS.has(parsed.bucket)) return url;
  const { data } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, ttlSeconds);
  return data?.signedUrl ?? url;
}