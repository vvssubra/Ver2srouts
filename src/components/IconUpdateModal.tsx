import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Share, Trash2, Plus, ExternalLink } from "lucide-react";
import { useBrandingVersion } from "@/hooks/use-branding-version";

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Shown only inside the installed PWA when the org's branding version has
 * advanced past the version we acknowledged on this device. iOS and Android
 * both cache the home-screen icon at install time, so a true silent update
 * is impossible — we walk the user through a 30-second reinstall instead.
 */
export default function IconUpdateModal() {
  const { mismatch, acknowledge, variant } = useBrandingVersion();
  const [open, setOpen] = useState(false);
  const platform = detectPlatform();
  const location = useLocation();
  const { user } = (useAuth() as any) ?? { user: null };

  // Routes where the reinstall modal must never appear (pre-auth / install /
  // password / onboarding flows). The popup is meaningless here and feels
  // like nagging — users are not yet inside the app.
  const BLOCKED_PREFIXES = [
    "/auth",
    "/reset-password",
    "/change-password",
    "/install",
    "/parent-onboarding",
    "/pending",
    "/select-role",
    "/unsubscribe",
  ];
  const onBlockedRoute = BLOCKED_PREFIXES.some((p) =>
    location.pathname.startsWith(p)
  );

  // Snooze: "Not now" hides the modal for 7 days without acknowledging the
  // branding version permanently. Keyed per variant.
  const snoozeKey = `sprouts.branding.snooze_until.${variant}`;
  const isSnoozed = () => {
    try {
      const raw = localStorage.getItem(snoozeKey);
      if (!raw) return false;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return false;
      return Date.now() < ts;
    } catch {
      return false;
    }
  };
  const snoozeFor7Days = () => {
    try {
      localStorage.setItem(
        snoozeKey,
        String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
    } catch {}
  };

  useEffect(() => {
    if (!mismatch) return;
    if (onBlockedRoute) return;
    if (!user) return; // only nag authenticated users inside the app
    if (isSnoozed()) return;
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mismatch, onBlockedRoute, user]);

  if (!mismatch || onBlockedRoute || !user) return null;

  const reinstallUrl = variant === "parents" ? "/install/parents" : "/install/teachers";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing via X or outside click: snooze for 7 days so we don't
        // immediately re-open on the next route change.
        if (!next) snoozeFor7Days();
        setOpen(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="rounded-full" variant="secondary">
              <Sparkles className="h-3 w-3 mr-1" /> New look
            </Badge>
          </div>
          <DialogTitle>Refresh your app icon</DialogTitle>
          <DialogDescription>
            We've updated our app icon. Because of how iOS and Android work,
            home-screen icons can't refresh automatically — it takes about 30
            seconds to install the new one.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm pt-1">
          {platform === "ios" ? (
            <>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  1
                </span>
                <span className="flex-1 flex items-center flex-wrap gap-1">
                  Long-press the current icon on your home screen, then tap{" "}
                  <Trash2 className="inline h-4 w-4 mx-1" />{" "}
                  <strong>Remove app</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  2
                </span>
                <span className="flex-1">
                  Open this page in <strong>Safari</strong> (not the installed app).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  3
                </span>
                <span className="flex-1 flex items-center flex-wrap gap-1">
                  Tap <Share className="inline h-4 w-4 mx-1" />{" "}
                  <strong>Share</strong> →{" "}
                  <Plus className="inline h-4 w-4 mx-1" />{" "}
                  <strong>Add to Home Screen</strong>.
                </span>
              </li>
            </>
          ) : platform === "android" ? (
            <>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  1
                </span>
                <span className="flex-1">
                  Long-press the icon → <strong>Uninstall</strong> (or App info → Uninstall).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  2
                </span>
                <span className="flex-1">
                  Tap <strong>Reinstall</strong> below to open the install page in Chrome.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  3
                </span>
                <span className="flex-1">
                  Tap <strong>Install app</strong> when Chrome prompts you.
                </span>
              </li>
            </>
          ) : (
            <li className="text-sm text-muted-foreground">
              Open this app on your phone to refresh its icon. Desktop installs
              update on next launch.
            </li>
          )}
        </ol>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              snoozeFor7Days();
              setOpen(false);
            }}
          >
            Not now
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              acknowledge();
              setOpen(false);
            }}
          >
            I've reinstalled
          </Button>
          <Button
            onClick={() => {
              window.open(reinstallUrl, "_blank", "noopener,noreferrer");
            }}
          >
            Open install page <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}