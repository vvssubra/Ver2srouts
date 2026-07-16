import { useSwUpdate } from "@/hooks/use-sw-update";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Loader2 } from "lucide-react";

/**
 * Tiny non-blocking banner shown when a new SW is waiting. We never
 * auto-reload — the parent must tap "Reload" so we don't interrupt them
 * mid-chat or mid-form.
 */
export default function PwaUpdateToast() {
  const { updateAvailable, applyUpdate, dismiss, isApplying, slowUpdate } =
    useSwUpdate();
  if (!updateAvailable) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[100] bottom-[calc(env(safe-area-inset-bottom)+1rem)] w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="flex items-center gap-3 rounded-xl border bg-card text-card-foreground shadow-lg px-3 py-2">
        {isApplying ? (
          <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 text-primary shrink-0" />
        )}
        <div className="flex-1 text-sm">
          <p className="font-medium leading-tight">
            {isApplying ? "Updating Sprouts" : "Update available"}
          </p>
          <p className="text-xs text-muted-foreground leading-tight">
            {isApplying
              ? slowUpdate
                ? "Applying update… this may take a few seconds."
                : "Applying the latest version…"
              : "A new version of Sprouts is ready."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={applyUpdate}
          className="h-8"
          disabled={isApplying}
        >
          {isApplying ? "Updating..." : "Reload"}
        </Button>
        {!isApplying && (
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}