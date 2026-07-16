import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const VAPID_PUBLIC_KEY = "BImKHxMwcXEhjHRzLQu03K0ULyL-3jTC1ipWKEDS1dNeorxdKOiFg-PSWzjnaTkZ2qljsYNEfEjC5f1c8b8nEJI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as any).standalone === true;
}

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/mac/i.test(ua)) return "macos";
  if (/win/i.test(ua)) return "windows";
  return "web";
}

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported" | "install_required";

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const syncingRef = useRef(false);

  const installRequired = permission === "install_required";
  const message: string | undefined = installRequired
    ? "Install Sprouts to Home Screen first, then open it from the app icon to enable notifications."
    : undefined;

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    if (isIOS() && !isStandalonePwa()) {
      setPermission("install_required");
      return;
    }

    setPermission(Notification.permission as PushPermissionState);

    // Check existing subscription
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  /**
   * Silently make sure the device's existing push subscription is mirrored
   * to the database. Safe to call on every mount, login, visibility change
   * and SW controllerchange — never prompts for permission.
   */
  const ensureSubscriptionSynced = useCallback(async () => {
    if (!user) return false;
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;
    if (isIOS() && !isStandalonePwa()) return false;
    if (syncingRef.current) return false;
    syncingRef.current = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        } catch (err) {
          console.warn("ensureSubscriptionSynced: subscribe failed", err);
          return false;
        }
      }
      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint!;
      const p256dh = subJson.keys!.p256dh!;
      const authKey = subJson.keys!.auth!;
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth_key: authKey,
          last_seen_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
          platform: detectPlatform(),
        } as any,
        { onConflict: "endpoint" },
      );
      if (error) {
        console.warn("ensureSubscriptionSynced: upsert failed", error);
        return false;
      }
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.warn("ensureSubscriptionSynced error:", err);
      return false;
    } finally {
      syncingRef.current = false;
    }
  }, [user]);

  // Auto-sync: on login/mount, on app resume, and when the SW controller
  // changes (after an update). Never prompts.
  useEffect(() => {
    if (!user) return;
    ensureSubscriptionSynced();
    const onVis = () => {
      if (document.visibilityState === "visible") ensureSubscriptionSynced();
    };
    const onControllerChange = () => { ensureSubscriptionSynced(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, [user, ensureSubscriptionSynced]);

  const subscribe = useCallback(async () => {
    if (!user || permission === "unsupported" || permission === "denied" || permission === "install_required") return false;

    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== "granted") {
        setLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint!;
      const p256dh = subJson.keys!.p256dh!;
      const authKey = subJson.keys!.auth!;

      // Upsert to database
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth_key: authKey,
          last_seen_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
          platform: detectPlatform(),
        } as any,
        { onConflict: "endpoint" },
      );

      if (error) {
        console.error("Failed to save push subscription:", error);
        setLoading(false);
        return false;
      }

      setIsSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscription error:", err);
      setLoading(false);
      return false;
    }
  }, [user, permission]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    }
  }, []);

  return { permission, isSubscribed, loading, subscribe, unsubscribe, message, ensureSubscriptionSynced };
}
