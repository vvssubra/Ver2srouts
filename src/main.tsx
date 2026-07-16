import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Parent PWA detection ──────────────────────────────────────────────
// When the app is launched from a parent-specific URL (manifest start_url,
// invite link, access code link, etc.), persist a flag so that any later
// redirect to /auth (which strips the query string) still knows this is the
// Parent PWA. Equally, a staff launch clears that flag so the same browser
// can correctly switch back to staff login.
try {
  if (typeof window !== "undefined") {
    const sp = new URL(window.location.href).searchParams;
    const app = sp.get("app");
    const role = sp.get("role");
    const source = sp.get("source");
    const hasAccessCode = !!sp.get("accessCode");
    const isParentLaunch =
      app === "parents" ||
      role === "parent" ||
      source === "pwa-parent" ||
      hasAccessCode;
    const isStaffLaunch = app === "staff" || source === "pwa-teacher";
    const isStandalonePwa =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as any).standalone === true;
    if (isParentLaunch && isStandalonePwa) {
      // Only persist the parent-PWA flag for true installed-PWA launches.
      // Plain browser tabs (Chrome on Android etc.) must never poison
      // future visits with a sticky parent-only login.
      localStorage.setItem("sprouts:parent_pwa", "1");
    } else if (isStaffLaunch) {
      localStorage.removeItem("sprouts:parent_pwa");
    } else if (!isParentLaunch && !isStandalonePwa) {
      // Self-heal: any user whose flag is stuck from a previous visit
      // gets it cleared the next time they open the bare URL in a
      // normal browser tab.
      localStorage.removeItem("sprouts:parent_pwa");
    }
  }
} catch {}

// ── Service worker registration (production-safe) ──────────────────────
// Registers /sw.js only when it is safe to do so:
//   - real browser with SW support
//   - production build
//   - not inside an iframe (Lovable preview is iframed)
//   - not on Lovable preview / dev hostnames
//   - not when `?sw=off` kill switch is set (also unregisters)
function shouldRegisterSW(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return false;
  }
  if (new URL(window.location.href).searchParams.get("sw") === "off") return false;
  return true;
}

if ("serviceWorker" in navigator) {
  // ?sw=off → tear down any existing registration regardless of env so
  // users with stuck workers can recover via a single URL.
  if (
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("sw") === "off"
  ) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  } else if (shouldRegisterSW()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("SW registration failed:", err);
      });
    });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────
// If the Supabase env vars are missing (e.g. a publish built before the
// secrets were attached), `createClient` throws at module load and React
// never mounts — leaving the user on the static index.html splash forever.
// Catch that case and render a recovery screen so the user can refresh or
// reach support instead of staring at "Preparing your child's day…".
const rootEl = document.getElementById("root")!;
try {
  const root = createRoot(rootEl);
  root.render(<App />);
} catch (err) {
  console.error("[boot] fatal:", err);
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:system-ui,sans-serif;color:#1B5E20;background:#F1F8E9;padding:24px;text-align:center">
      <div style="font-size:18px;font-weight:600">We hit a snag starting the app</div>
      <div style="font-size:13px;opacity:0.75;max-width:320px">Please pull down to refresh, or close and reopen the app. If this keeps happening, contact your school.</div>
      <button onclick="location.reload()" style="margin-top:8px;background:#43A047;color:white;border:0;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600">Reload</button>
    </div>`;
}
