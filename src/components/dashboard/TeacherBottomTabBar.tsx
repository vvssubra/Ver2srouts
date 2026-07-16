import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, School, BookOpen, Inbox, MoreHorizontal, Wallet, Megaphone, Settings as SettingsIcon, ChevronRight, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

/**
 * Calm classroom-first bottom navigation for teachers.
 * Visible only on mobile; active state uses teacher green via --primary token.
 * The 5th slot is a "More" trigger that slides up a sheet with payslip,
 * announcements, and account shortcuts.
 */
const TABS = [
  { to: "/dashboard", match: ["/dashboard"], label: "Today", icon: Home },
  { to: "/classrooms", match: ["/classrooms", "/attendance", "/daily-updates"], label: "Classroom", icon: School },
  { to: "/planning-hub", match: ["/planning-hub", "/lesson-planner", "/curriculum"], label: "Planning", icon: BookOpen },
  { to: "/staff-inbox", match: ["/staff-inbox", "/messages"], label: "Inbox", icon: Inbox },
];

export function TeacherBottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = ["/settings", "/my-payslips", "/staff-announcements"].some(
    (m) => location.pathname === m || location.pathname.startsWith(m + "/")
  );

  return (
    <>
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_16px_-6px_hsl(var(--primary-deep)/0.12)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Teacher navigation"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.match.some((m) =>
            location.pathname === m || location.pathname.startsWith(m + "/")
          );
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors min-h-[56px]",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-7 w-10 rounded-full transition-colors",
                    active && "bg-primary/15"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="leading-none truncate max-w-full">{t.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "w-full flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors min-h-[56px]",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="More"
          >
            <span className={cn("flex items-center justify-center h-7 w-10 rounded-full transition-colors", moreActive && "bg-primary/15")}>
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </span>
            <span className="leading-none truncate max-w-full">More</span>
          </button>
        </li>
      </ul>
    </nav>

    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle className="text-left">More</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-2">
          <MoreRow
            icon={Wallet}
            iconClass="bg-amber-100 text-amber-700"
            title="My Payslips"
            subtitle="View and download payslips"
            onClick={() => { setMoreOpen(false); navigate("/my-payslips"); }}
          />
          <MoreRow
            icon={Megaphone}
            iconClass="bg-primary/10 text-primary"
            title="Staff Announcements"
            subtitle="Updates from HR & admin"
            onClick={() => { setMoreOpen(false); navigate("/staff-announcements"); }}
          />
          <MoreRow
            icon={SettingsIcon}
            iconClass="bg-muted text-foreground"
            title="Account"
            subtitle="Profile, notifications, security"
            onClick={() => { setMoreOpen(false); navigate("/settings"); }}
          />
        </div>
        {user?.email && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1">
            <UserIcon className="h-3 w-3" /> {user.email}
          </p>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}

function MoreRow({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Wallet;
  iconClass: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconClass)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{title}</span>
        <span className="block text-xs text-muted-foreground truncate">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export default TeacherBottomTabBar;