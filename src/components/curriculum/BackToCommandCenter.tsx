import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface Props {
  /** Tab to return to inside Command Center, e.g. "foundation", "planning", "calendar", "lessons", "quality". */
  tab?: string;
  className?: string;
}

/**
 * Sub-batch 6B-0A.4 — shared back-link for old curriculum pages opened
 * from the Curriculum Command Center. Hidden for teachers and unrelated
 * roles so it never appears as noise inside the simpler teacher flows.
 */
export function BackToCommandCenter({ tab, className }: Props) {
  const { role } = useAuth();
  const allowed = ["super_admin", "franchisee", "admin", "principal", "curriculum_admin"];
  if (!role || !allowed.includes(role)) return null;
  const href = tab ? `/curriculum/command-center?tab=${tab}` : "/curriculum/command-center";
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={`gap-1 -ml-2 h-7 text-muted-foreground hover:text-foreground ${className ?? ""}`}
    >
      <Link to={href}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Curriculum Command Center
      </Link>
    </Button>
  );
}

export default BackToCommandCenter;