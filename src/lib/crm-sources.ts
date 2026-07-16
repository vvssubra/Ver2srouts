// Canonical CRM lead/marketing source taxonomy.
// Used by lead intake, lead side-panel, Reporting & ROI filters, and Marketing Spend dialog.

export const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google Ads" },
  { value: "tiktok", label: "TikTok" },
  { value: "referral", label: "Referral" },
  { value: "walk_in", label: "Walk-in" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
];

// Channel groupings — mirror how ad platforms report (Meta groups FB+IG, etc.)
// Used by Reporting & ROI to roll up per-network spend/leads/enquiries into one
// row that can be drilled down to the per-channel breakdown.
export const CHANNEL_GROUPS: { value: string; label: string; sources: string[] }[] = [
  { value: "meta_ads", label: "Meta Ads (FB + IG)", sources: ["facebook", "instagram", "meta_ads"] },
  { value: "google_ads", label: "Google Ads", sources: ["google"] },
  { value: "tiktok_ads", label: "TikTok Ads", sources: ["tiktok"] },
  { value: "referral", label: "Referral", sources: ["referral"] },
  { value: "walk_in", label: "Walk-in", sources: ["walk_in"] },
  { value: "website", label: "Website", sources: ["website"] },
  { value: "whatsapp", label: "WhatsApp", sources: ["whatsapp"] },
  { value: "other", label: "Other", sources: ["other"] },
];

export function groupForSource(raw: string | null | undefined): string {
  const v = normalizeSource(raw);
  const hit = CHANNEL_GROUPS.find((g) => g.sources.includes(v));
  return hit ? hit.value : "other";
}

export function sourcesForGroup(group: string): string[] {
  return CHANNEL_GROUPS.find((g) => g.value === group)?.sources ?? [group];
}

export function groupLabel(group: string): string {
  return CHANNEL_GROUPS.find((g) => g.value === group)?.label ?? group;
}

// Normalize legacy/free-form values onto the canonical set without losing them.
// Legacy values like "social_media" or "flyer" are kept as-is so they still display,
// but new writes use canonical values from LEAD_SOURCES above.
export function normalizeSource(raw: string | null | undefined): string {
  if (!raw) return "other";
  const v = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "social_media" || v === "social") return "social_media"; // legacy bucket
  if (v === "flyer" || v === "print" || v === "flyer_print") return "flyer"; // legacy bucket
  if (v === "walkin" || v === "walk-in") return "walk_in";
  if (v === "google_ads" || v === "googleads") return "google";
  if (v === "fb") return "facebook";
  if (v === "ig") return "instagram";
  if (v === "meta" || v === "meta_ads" || v === "metaads") return "meta_ads";
  return v;
}

export function sourceLabel(raw: string | null | undefined): string {
  const v = normalizeSource(raw);
  const hit = LEAD_SOURCES.find((s) => s.value === v);
  if (hit) return hit.label;
  if (v === "meta_ads") return "Meta Ads (combined)";
  if (v === "social_media") return "Social (legacy)";
  if (v === "flyer") return "Flyer / Print (legacy)";
  if (!raw) return "—";
  return raw;
}

export const SPEND_CHANNELS = ["paid", "organic", "referral", "event", "other"];