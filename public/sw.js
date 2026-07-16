// Sprouts Service Worker
// Responsibilities:
//   1. Web Push notifications + OS app-badge sync (unchanged from v1)
//   2. Minimal, privacy-safe offline fallback for parent PWA
//
// Strict caching rules:
//   - Never cache HTML navigations (always network-first → /offline.html)
//   - Never cache Supabase, /functions/, /rest/, /auth/, /storage/, /realtime/
//   - Cache only same-origin Vite hashed build assets under /assets/
//   - Cache /offline.html and the parent app icon for the offline screen
//
// Update flow:
//   - This SW does NOT call skipWaiting() on its own. The app sends
//     { type: "SKIP_WAITING" } via postMessage when the user accepts the
//     "New version available" toast. This prevents reloading parents in
//     the middle of typing a chat message or filling a form.
//
// SW_VERSION is automatically stamped at build time by the
// `sprouts-sw-version-stamp` Vite plugin in vite.config.ts. Every
// production build rewrites `__SW_VERSION__` below with a unique
// `build-YYYYMMDDHHMMSS-xxxxxx` string so browsers reliably see a
// byte-diff and fire the update flow.
//
// In dev / Lovable preview the literal `__SW_VERSION__` is fine — the
// service worker is never registered there (see src/main.tsx guards).
//
// RELEASE CHECKLIST: nothing manual required. If you ever need to force
// every client onto a clean slate (e.g. after a corrupted release), bump
// the fallback prefix below from `v1` to `v2`, etc.
const SW_VERSION = "__SW_VERSION__" === "__" + "SW_VERSION__"
  ? "v1-dev"
  : "__SW_VERSION__";
const SHELL_CACHE = `sprouts-shell-${SW_VERSION}`;
const ASSET_CACHE = `sprouts-assets-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-parents-512.png", "/icon-parents-192.png"];

self.addEventListener("install", (event) => {
  // Do NOT skipWaiting here — wait for explicit SKIP_WAITING message.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete any old Sprouts caches from previous SW versions, but leave
      // unrelated caches (e.g. FCM messaging) untouched.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (n) =>
              (n.startsWith("sprouts-shell-") && n !== SHELL_CACHE) ||
              (n.startsWith("sprouts-assets-") && n !== ASSET_CACHE)
          )
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch strategy ────────────────────────────────────────────────────
function isHashedAsset(url) {
  // Vite emits hashed files like /assets/index-AbC123.js
  return (
    url.origin === self.location.origin &&
    /\/assets\/.+\.[a-f0-9]{6,}\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|avif)$/i.test(
      url.pathname
    )
  );
}

function isPrivateBackend(url) {
  // Anything that talks to Supabase or our edge functions must never be
  // cached — RLS + auth tokens + per-user data.
  if (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in")) {
    return true;
  }
  return (
    /\/(rest|auth|storage|realtime|functions)\//.test(url.pathname) ||
    url.pathname.startsWith("/functions/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never touch private backend traffic.
  if (isPrivateBackend(url)) return;

  // HTML navigations → network-first, never cache the response, fall back
  // to offline page if the network is unreachable.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  // Same-origin hashed build assets → cache-first.
  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return hit || Response.error();
        }
      })()
    );
    return;
  }

  // Everything else → pass through to the network (no cache).
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Sprouts",
    body: "You have a new notification",
    type: "general",
    url: "/",
    badge: 0,
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const isChat =
    data.type === "chat" ||
    String(data.group_key || "").startsWith("chat:");
  const options = {
    body: data.body,
    icon: data.icon || "/icon-parents-512.png",
    // Android masks the badge to a white silhouette. Use a transparent
    // monochrome sprout so it never renders as a blank/white square.
    badge: "/notification-badge-96.png",
    tag: data.group_key || data.type || "general",
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    // Chat pushes are conversational — keep them visible until tapped and
    // give a short vibration where the OS allows it.
    requireInteraction: isChat,
    vibrate: isChat ? [120, 60, 120] : [80],
    data: {
      url: data.url || "/",
      group_key: data.group_key || null,
      notification_id: data.notification_id || null,
      type: data.type || "general",
    },
  };

  const showPromise = self.registration.showNotification(data.title, options);

  // Update OS app icon badge (iOS 16.4+, Android, desktop PWA)
  const badgePromise = (async () => {
    try {
      if (typeof self.navigator !== "undefined" && self.navigator.setAppBadge) {
        const count = typeof data.badge === "number" && data.badge > 0 ? data.badge : 1;
        await self.navigator.setAppBadge(count);
      }
    } catch {
      // best-effort
    }
  })();

  event.waitUntil(Promise.all([showPromise, badgePromise]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      // Clear app badge — user has acknowledged the alert
      try {
        if (self.navigator?.clearAppBadge) {
          await self.navigator.clearAppBadge();
        }
      } catch {
        // best-effort
      }

      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer focusing an existing tab and navigating it to the exact
      // action URL (e.g. /parent-chat?convo=<id>). Fall back to opening
      // a new window if none of the existing clients can be focused.
      for (const client of allClients) {
        try {
          if (!client.url.includes(self.location.origin)) continue;
          if ("focus" in client) await client.focus();
          if ("navigate" in client) {
            try {
              return await client.navigate(url);
            } catch {
              // Some browsers throw if the URL is cross-origin; ignore
              // and try the next client.
            }
          }
          return;
        } catch {
          // fall through
        }
      }
      return clients.openWindow(url);
    })()
  );
});
