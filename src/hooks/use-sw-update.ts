import { useEffect, useState, useCallback } from "react";

/**
 * Detects when a new service worker has installed and is waiting to take
 * control. Exposes an `applyUpdate()` that messages the SW to skipWaiting
 * and reloads once the new SW takes over.
 *
 * Auto-apply policy (option 2 — "safe auto-update"):
 *   The hook tries to apply updates silently when it is safe to do so:
 *     - the tab is hidden, OR
 *     - the user has been idle for >= IDLE_MS AND no form input is dirty.
 *   Otherwise it surfaces `updateAvailable` so the toast can ask the user.
 *   The toast remains the fallback for users actively working.
 */
const IDLE_MS = 60_000;

function hasDirtyInputs(): boolean {
  if (typeof document === "undefined") return false;
  // Any text input / textarea the user has typed into.
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea",
  );
  for (const el of Array.from(fields)) {
    const type = (el as HTMLInputElement).type;
    if (type === "hidden" || type === "submit" || type === "button") continue;
    if (type === "checkbox" || type === "radio") {
      const input = el as HTMLInputElement;
      if (input.checked !== input.defaultChecked) return true;
      continue;
    }
    if ((el.value ?? "") !== (el.defaultValue ?? "")) return true;
  }
  // contenteditable surfaces (rich-text editors).
  const editables = document.querySelectorAll<HTMLElement>('[contenteditable="true"]');
  for (const el of Array.from(editables)) {
    if ((el.textContent ?? "").trim().length > 0) return true;
  }
  // Explicit opt-in flag any component can set.
  if (document.querySelector('[data-dirty="true"]')) return true;
  return false;
}

export function useSwUpdate() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [slowUpdate, setSlowUpdate] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let pollId: number | undefined;

    const promote = (worker: ServiceWorker | null) => {
      if (!worker) return;
      setWaitingWorker(worker);
      setUpdateAvailable(true);
    };

    const track = (reg: ServiceWorkerRegistration) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        promote(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            promote(installing);
          }
        });
      });
    };

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (cancelled || !reg) return;
        track(reg);
        // Check for a new SW byte-diff every 60s while the tab is open.
        pollId = window.setInterval(() => {
          reg.update().catch(() => {});
        }, 60_000);
      })
      .catch(() => {});

    // If a new SW takes control (after SKIP_WAITING), reload once.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (isApplying) return; // idempotent: ignore repeated taps
    setIsApplying(true);

    // Show "this may take a few seconds" if controllerchange is slow.
    const slowTimer = window.setTimeout(() => setSlowUpdate(true), 4000);
    // Hard fallback — if the new SW never takes control, force a reload.
    const fallbackTimer = window.setTimeout(() => {
      window.location.reload();
    }, 9000);

    const cleanup = () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(fallbackTimer);
    };

    if (!waitingWorker) {
      cleanup();
      window.location.reload();
      return;
    }
    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      cleanup();
      window.location.reload();
    }
    // controllerchange listener in the effect above will reload; timers
    // above are the safety net.
  }, [waitingWorker, isApplying]);

  const dismiss = useCallback(() => setUpdateAvailable(false), []);

  // Safe auto-apply: when an update is ready, try to apply it without
  // bothering the user if the tab is hidden or they are idle with no
  // dirty inputs. Otherwise the toast handles it.
  useEffect(() => {
    if (!updateAvailable || isApplying || !waitingWorker) return;

    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    const activityEvents = ["keydown", "input", "pointerdown", "wheel", "touchstart"] as const;
    activityEvents.forEach((e) =>
      window.addEventListener(e, bump, { passive: true } as AddEventListenerOptions),
    );

    const trySafeApply = () => {
      if (isApplying) return;
      const hidden = document.visibilityState === "hidden";
      const idle = Date.now() - lastActivity >= IDLE_MS;
      if (hidden || (idle && !hasDirtyInputs())) {
        applyUpdate();
      }
    };

    // Try immediately, on visibility change, and every 15s while waiting.
    trySafeApply();
    const onVisibility = () => trySafeApply();
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(trySafeApply, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
      activityEvents.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [updateAvailable, isApplying, waitingWorker, applyUpdate]);

  return { updateAvailable, applyUpdate, dismiss, isApplying, slowUpdate };
}