import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Brand card                                                                  */
/* -------------------------------------------------------------------------- */

export function SidebarBrandCard({
  icon,
  name,
  roleLabel,
  roleBadgeClass,
}: {
  icon: string;
  name: string;
  roleLabel: string;
  roleBadgeClass?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 min-w-0 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/40 p-2.5 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
      style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top))" }}
    >
      <img
        src={icon}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-sidebar-border shadow-sm group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
      />
      <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">
          {name}
        </span>
        <span className="truncate text-[10px] text-sidebar-foreground/55">
          by Little Green Hearts
        </span>
        <Badge
          className={cn(
            "mt-1 h-4 w-fit px-1.5 py-0 text-[9px] font-medium",
            roleBadgeClass,
          )}
        >
          {roleLabel}
        </Badge>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Single nav item (top level)                                                 */
/* -------------------------------------------------------------------------- */

export function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  unread = 0,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  unread?: number;
  tooltip?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={tooltip ?? label}
      className={cn(
        "group/item relative flex w-full min-h-11 items-center gap-3 rounded-lg pl-3 pr-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-primary" : "text-sidebar-foreground/60",
        )}
      />
      <span className="flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
        {label}
      </span>
      {unread > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground group-data-[collapsible=icon]:hidden">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Nested item (inside expanded group)                                         */
/* -------------------------------------------------------------------------- */

export function SidebarNestedItem({
  icon: Icon,
  label,
  subLabel,
  active,
  onClick,
  unread = 0,
}: {
  icon: React.ElementType;
  label: string;
  subLabel?: string;
  active: boolean;
  onClick: () => void;
  unread?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "group/sub relative flex w-full min-h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-sidebar-foreground/55",
        )}
      />
      <span className="flex-1 truncate text-left">
        {label}
        {subLabel && (
          <span className="ml-1.5 text-[10px] text-sidebar-foreground/45">
            {subLabel}
          </span>
        )}
      </span>
      {unread > 0 && (
        <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Collapsible group (parent with children)                                    */
/* -------------------------------------------------------------------------- */

export function SidebarNestedGroup({
  icon: Icon,
  label,
  unread = 0,
  defaultOpen = false,
  hasActive = false,
  children,
}: {
  icon: React.ElementType;
  label: string;
  unread?: number;
  defaultOpen?: boolean;
  hasActive?: boolean;
  children: ReactNode;
}) {
  const { state, isMobile, setOpen } = useSidebar();
  const [open, setOpenState] = useState<boolean>(defaultOpen || hasActive);
  useEffect(() => {
    if (hasActive) setOpenState(true);
  }, [hasActive]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    // When sidebar is icon-collapsed on desktop, clicking a group icon should
    // expand the sidebar and open this group's submenu rather than toggle
    // the (invisible) collapsible closed.
    if (!isMobile && state === "collapsed") {
      e.preventDefault();
      setOpen(true);
      setOpenState(true);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpenState} className="group/coll">
      <CollapsibleTrigger
        onClick={handleTriggerClick}
        className={cn(
          "flex w-full min-h-11 items-center gap-3 rounded-lg pl-3 pr-2 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
          hasActive
            ? "text-sidebar-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/55" />
        <span className="flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          {label}
        </span>
        <span className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
          {unread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform duration-200 group-data-[state=open]/coll:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden group-data-[collapsible=icon]:hidden">
        <div className="relative mt-0.5 ml-[1.125rem] pl-3 space-y-0.5 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-sidebar-border/70">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline sub-group label inside a group                                       */
/* -------------------------------------------------------------------------- */

export function SidebarSubGroup({
  icon: Icon,
  label,
  defaultOpen = false,
  hasActive = false,
  children,
}: {
  icon: React.ElementType;
  label: string;
  defaultOpen?: boolean;
  hasActive?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen || hasActive} className="group/sg">
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground">
        <span className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <ChevronDown className="h-2.5 w-2.5 transition-transform duration-200 group-data-[state=open]/sg:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pt-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer card                                                                 */
/* -------------------------------------------------------------------------- */

export function SidebarFooterCard({
  initials,
  displayName,
  email,
  version,
  onSignOut,
  topSlot,
  middleSlot,
}: {
  initials: string;
  displayName: string;
  email?: string | null;
  version?: string;
  onSignOut: () => void;
  topSlot?: ReactNode;
  middleSlot?: ReactNode;
}) {
  return (
    <>
      {topSlot && (
        <div className="w-full min-w-0 max-w-full group-data-[collapsible=icon]:hidden">
          {topSlot}
        </div>
      )}
      {middleSlot && (
        <div className="mt-2 group-data-[collapsible=icon]:hidden">
          {middleSlot}
        </div>
      )}
      <div className="mt-2 flex w-full min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/50 px-2.5 py-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mt-0">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-xs font-medium text-sidebar-foreground">
              {displayName}
            </span>
            {version && (
              <span className="shrink-0 text-[9px] text-sidebar-foreground/40">
                {version}
              </span>
            )}
          </div>
          {email && (
            <span className="truncate text-[10px] text-sidebar-foreground/55">
              {email}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="shrink-0 rounded-md p-1 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:hidden"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}