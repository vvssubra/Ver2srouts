import { Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

interface Props {
  variant: "parents" | "teachers";
  className?: string;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore - iOS non-standard
  if (window.navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

export function GetMobileAppButton({ variant, className }: Props) {
  if (isStandalone()) return null;
  return (
    <Button
      asChild
      size="sm"
      className={`gap-1.5 text-xs sm:text-sm bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 border-0 shadow-sm ${className ?? ""}`}
    >
      <Link
        to={`/install/${variant}`}
        onClick={() =>
          track("get_mobile_app_clicked", {
            variant,
            source: typeof window !== "undefined" ? window.location.pathname : null,
          })
        }
      >
        <Smartphone className="h-4 w-4" />
        <span>Get the mobile app</span>
      </Link>
    </Button>
  );
}

export default GetMobileAppButton;