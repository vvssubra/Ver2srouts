import { useNavigate } from "react-router-dom";
import { useAuth, getRoleDashboardPath, getRoleLabel } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Repeat, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Tailwind classes for the trigger button */
  className?: string;
  /** When true, render only the icon (collapsed sidebar) */
  iconOnly?: boolean;
}

/**
 * Mode switcher for accounts that hold multiple roles (e.g. parent + teacher).
 * Renders nothing when the user has 0 or 1 role.
 */
export function RoleSwitcher({ className, iconOnly = false }: Props) {
  const { roles, role, setActiveRole } = useAuth();
  const navigate = useNavigate();

  if (!roles || roles.length < 2) return null;

  const handlePick = (r: typeof roles[number]) => {
    if (r === role) return;
    setActiveRole(r);
    setTimeout(() => navigate(getRoleDashboardPath(r), { replace: true }), 0);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Switch mode"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
            className,
          )}
        >
          <Repeat className="h-3.5 w-3.5" />
          {!iconOnly && <span>Switch mode</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Continue as…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((r) => (
          <DropdownMenuItem
            key={r}
            onClick={() => handlePick(r)}
            className="flex items-center justify-between"
          >
            <span>{getRoleLabel(r)}</span>
            {r === role && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RoleSwitcher;