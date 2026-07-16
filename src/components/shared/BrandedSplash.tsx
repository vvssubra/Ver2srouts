import { useEffect, useState } from "react";

interface BrandedSplashProps {
  label?: string;
  /** Render full-screen (default true). Set false to embed inside a page. */
  fullScreen?: boolean;
  /** Show a "Go to sign in" recovery button after `recoveryAfterMs` (default 8000). */
  showRecovery?: boolean;
  recoveryAfterMs?: number;
}

/**
 * Branded parent-friendly loading screen. Replaces the raw spinner on
 * app/route boot and protected-route gating so the installed PWA never
 * shows a black/blank screen.
 */
export function BrandedSplash({
  label = "Preparing your child's day…",
  fullScreen = true,
  showRecovery = true,
  recoveryAfterMs = 8000,
}: BrandedSplashProps) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!showRecovery) return;
    const t = window.setTimeout(() => setShowFallback(true), recoveryAfterMs);
    return () => window.clearTimeout(t);
  }, [showRecovery, recoveryAfterMs]);

  // Decide which sign-in flow to send the user to. Parent PWA routes go to
  // the parent-only login; everything else falls back to staff login.
  const parentPaths = ["/child", "/journey", "/progress", "/parent-chat", "/parent-fees", "/parent-messages", "/parent-ptm", "/school-documents", "/parent-onboarding"];
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const isParent = parentPaths.some((p) => path.startsWith(p));
  const signInHref = isParent ? "/auth?app=parents" : "/auth?app=staff";

  // Variant-aware splash icon. Parents see the Sprouts Parents icon,
  // staff/teacher routes see the staff icon. Falls back to the generic
  // parent icon when ambiguous (matches the existing parent-first PWA).
  const isStaffPath =
    typeof window !== "undefined" &&
    /^\/(dashboard|staff-inbox|staff|admin|hr|finance|classroom|curriculum|timetable|ptm|attendance|payroll|claims|leave|qa|accounting|branches|organizations|reports|analytics|settings|all-lesson-plans|lesson-plan|monthly-curriculum|weekly-curriculum|yearly|theme-bank|observations|learning-media|worksheet|readiness|class-readiness|teacher|leader|root-)/.test(
      window.location.pathname,
    );
  const splashIcon = isStaffPath
    ? "/icon-teachers-192.png"
    : "/icon-parents-192.png";

  return (
    <div
      className={
        fullScreen
          ? "fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background text-primary-deep"
          : "flex flex-col items-center justify-center gap-4 py-16 text-primary-deep"
      }
    >
      <img
        src={splashIcon}
        alt=""
        width={84}
        height={84}
        className="h-20 w-20 rounded-2xl object-contain shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.35)] animate-pulse"
      />
      <p className="text-sm font-semibold tracking-wide opacity-85">{label}</p>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-primary-wash">
        <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-primary-soft to-primary animate-[appBootSlide_1.4s_ease-in-out_infinite]" />
      </div>
      {showFallback && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">Still loading?</p>
          <a
            href={signInHref}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition"
          >
            Go to sign in
          </a>
        </div>
      )}
      <style>{`@keyframes appBootSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  );
}

export default BrandedSplash;