import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detect when the installed PWA's icon/name no longer matches the latest
 * branding in the database. iOS and Android cache the home-screen icon
 * at install time and never refresh it — so when admins change the icon
 * we surface a reinstall guide modal to users running the installed app.
 *
 * Returns the live branding version, the version this install was last
 * "acknowledged" against, and whether a mismatch exists.
 *
 * Variant is auto-detected from the start_url that iOS/Android passed in
 * (we stamp `?source=pwa` on PWA start URLs).
 */

function detectVariant(): "parents" | "teachers" {
  if (typeof window === "undefined") return "parents";
  const path = window.location.pathname;
  let sp: URLSearchParams | null = null;
  try {
    sp = new URL(window.location.href).searchParams;
  } catch {}
  const app = sp?.get("app");
  const source = sp?.get("source");

  if (app === "parents" || source === "pwa-parent") return "parents";
  if (app === "staff" || source === "pwa-teacher") return "teachers";

  const PARENT_PREFIXES = [
    "/child",
    "/journey",
    "/progress",
    "/check-in",
    "/account",
    "/parent-fees",
    "/parent-messages",
    "/parent-chat",
    "/parent-ptm",
    "/school-documents",
    "/parent-onboarding",
    "/learning-stories",
    "/install/parents",
  ];
  const STAFF_PREFIXES = [
    "/dashboard",
    "/daily-updates",
    "/students",
    "/classrooms",
    "/staff",
    "/finance",
    "/settings",
    "/install/teachers",
  ];
  if (PARENT_PREFIXES.some((p) => path.startsWith(p))) return "parents";
  if (STAFF_PREFIXES.some((p) => path.startsWith(p))) return "teachers";

  try {
    if (localStorage.getItem("sprouts:parent_pwa") === "1") return "parents";
  } catch {}
  return "teachers";
}

function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  // iOS standalone
  // @ts-ignore non-standard
  if (window.navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

const STORAGE_KEY = "sprouts.branding.ack_version";

export function useBrandingVersion() {
  const location = useLocation();
  const [variant, setVariant] = useState<"parents" | "teachers">(() => detectVariant());
  const installed = isInstalledPwa();
  const [liveVersion, setLiveVersion] = useState<string | null>(null);
  const readAck = (v: "parents" | "teachers"): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed?.[v] ?? null;
    } catch {
      return null;
    }
  };
  const [ackVersion, setAckVersion] = useState<string | null>(() => readAck(detectVariant()));

  // Recompute variant on route change. Once a parent PWA is launched, the
  // sprouts:parent_pwa flag in main.tsx keeps the fallback locked to
  // "parents" even on routes shared with staff.
  useEffect(() => {
    const next = detectVariant();
    setVariant((prev) => (prev === next ? prev : next));
  }, [location.pathname, location.search]);

  // When variant flips, re-read the ack version for that variant so we
  // don't compare against the wrong audience's acknowledgement.
  useEffect(() => {
    setAckVersion(readAck(variant));
  }, [variant]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organization_branding")
        .select(
          "parent_branding_version, teacher_branding_version" as any
        )
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const raw =
        variant === "parents"
          ? (data as any).parent_branding_version
          : (data as any).teacher_branding_version;
      if (!raw) return;
      const v = new Date(raw).getTime().toString();
      setLiveVersion(v);
      // First-time visitor: acknowledge silently so we don't nag fresh installs.
      if (!ackVersion) {
        acknowledge(variant, v);
        setAckVersion(v);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-check on route change is unnecessary; mount once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const acknowledge = (v: "parents" | "teachers", value: string) => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      parsed[v] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // best-effort
    }
  };

  const acknowledgeCurrent = () => {
    if (!liveVersion) return;
    let target = variant;
    try {
      if (localStorage.getItem("sprouts:parent_pwa") === "1") target = "parents";
    } catch {}
    acknowledge(target, liveVersion);
    setAckVersion(liveVersion);
  };

  // Only nag when (a) running as installed PWA AND (b) we have both versions
  // AND (c) they differ. Browser tab visitors are unaffected — they see the
  // new icon naturally on the install page anyway.
  const mismatch =
    installed &&
    !!liveVersion &&
    !!ackVersion &&
    liveVersion !== ackVersion;

  return {
    variant,
    installed,
    liveVersion,
    ackVersion,
    mismatch,
    acknowledge: acknowledgeCurrent,
  };
}