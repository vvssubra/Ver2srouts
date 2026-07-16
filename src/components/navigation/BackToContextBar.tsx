import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useBackToStudent } from "@/hooks/use-back-to-student";

/**
 * World-class deep-link return bar.
 *
 * Renders when the current page was reached from another entity
 * (currently: a student profile via `?from=student:<id>:<tab>`).
 *
 * - Muted surface, never a coloured pill.
 * - Avatar / initials chip for the context entity.
 * - Bold name + soft subtitle ("Family tab", "Billing", etc).
 * - `Esc` triggers the back action while mounted.
 *
 * Designed to be reused across InvoiceDetail, PaymentDetail,
 * PtmMeetingDetail, LessonPlanDetail, StaffDetail, etc.
 */
export default function BackToContextBar({
  fallbackLabel = "Back",
  onFallback,
  className = "",
}: {
  fallbackLabel?: string;
  onFallback?: () => void;
  className?: string;
}) {
  const back = useBackToStudent();

  useEffect(() => {
    if (!back.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") back.goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  if (!back.active) {
    if (!onFallback) return null;
    return (
      <button
        type="button"
        onClick={onFallback}
        className={`group inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm font-medium hover:bg-muted/70 transition ${className}`}
      >
        <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:-translate-x-0.5 transition" />
        <span>{fallbackLabel}</span>
      </button>
    );
  }

  const name = back.studentName ?? "profile";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "•";

  return (
    <button
      type="button"
      onClick={back.goBack}
      title="Back (Esc)"
      className={`group inline-flex items-center gap-2.5 rounded-lg border bg-muted/40 pl-1.5 pr-3 py-1 text-left hover:bg-muted/70 hover:border-primary/30 transition ${className}`}
    >
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-background border text-muted-foreground group-hover:text-foreground transition shrink-0">
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition" />
      </span>
      {back.avatarUrl ? (
        <img
          src={back.avatarUrl}
          alt=""
          className="h-7 w-7 rounded-full object-cover border shrink-0"
        />
      ) : (
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-[10px] font-bold border shrink-0">
          {initials}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
          Back to
        </span>
        <span className="block text-sm font-semibold leading-tight truncate max-w-[200px]">
          {name}
        </span>
        {back.subtitle && (
          <span className="block text-[10px] text-muted-foreground truncate max-w-[200px]">
            {back.subtitle}
          </span>
        )}
      </span>
      <kbd className="hidden md:inline-flex ml-1 items-center rounded border bg-background px-1.5 text-[10px] text-muted-foreground">
        Esc
      </kbd>
    </button>
  );
}