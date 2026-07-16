import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/auth";

const ROLE_STYLES: Record<string, string> = {
  super_admin: "bg-primary-deep/10 text-primary-deep border-primary-deep/20",
  franchisee:  "bg-primary-deep/10 text-primary-deep border-primary-deep/20",
  admin:       "bg-primary-deep/10 text-primary-deep border-primary-deep/20",
  teacher:     "bg-primary/10 text-primary border-primary/20",
  staff:       "bg-primary/10 text-primary border-primary/20",
  parent:      "bg-warning/15 text-warning border-warning/20",
};

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium border", ROLE_STYLES[role] ?? "bg-muted text-muted-foreground", className)}
    >
      {getRoleLabel(role as any)}
    </Badge>
  );
}

export default RoleBadge;