import { NavLink, useLocation } from "react-router-dom";
import { Home, Calendar, MessageSquare, Clock, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation for staff-facing app.
 * Hidden on desktop (>= md). Hidden for parents and super admins.
 * Tabs are filtered by allowedRoutes (admin/teacher/staff).
 */
export function BottomTabBar() {
  const { role, allowedRoutes } = useAuth();
  const location = useLocation();

  if (!role || role === "parent") return null;

  const isAllowed = (path: string) => {
    if (role === "super_admin" || role === "franchisee") return true;
    if (allowedRoutes.length === 0) return true; // no group → all
    return allowedRoutes.some((r) =>
      r.includes("?") || path.includes("?") ? r === path : path.startsWith(r)
    );
  };

  const tabs = [
    { to: "/dashboard", label: "Home", icon: Home, show: true },
    { to: "/staff-attendance", label: "Attendance", icon: Clock, show: isAllowed("/staff-attendance") },
    { to: "/leave-management", label: "Leave", icon: Calendar, show: isAllowed("/leave-management") },
    { to: "/messages", label: "Inbox", icon: MessageSquare, show: isAllowed("/messages") },
    { to: "/settings", label: "More", icon: MoreHorizontal, show: true },
  ].filter((t) => t.show);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
        {tabs.map((t) => {
          const active =
            location.pathname === t.to ||
            (t.to !== "/dashboard" && location.pathname.startsWith(t.to));
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default BottomTabBar;