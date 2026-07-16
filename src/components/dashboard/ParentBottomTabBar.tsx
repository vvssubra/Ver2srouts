import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Sparkles, TrendingUp, Receipt, MessageSquare, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParentMoreSheet } from "@/components/parent/ParentMoreSheet";
import { useParentChatUnread } from "@/hooks/use-parent-chat-unread";

/**
 * Warm parent-facing bottom navigation. Six tabs map to the core parent
 * surfaces (Home / Journey / Progress / Chat / Fees / More). "More" opens
 * a slide-up sheet for secondary destinations (account, documents, etc.)
 * so the bar can stay focused on day-to-day actions.
 */
const TABS = [
  { to: "/child", match: ["/child", "/check-in"], label: "Today", icon: Home },
  { to: "/journey", match: ["/journey"], label: "Journey", icon: Sparkles },
  { to: "/progress", match: ["/progress"], label: "Progress", icon: TrendingUp },
  { to: "/parent-chat", match: ["/parent-chat"], label: "Chat", icon: MessageSquare },
  { to: "/parent-fees", match: ["/parent-fees"], label: "Fees", icon: Receipt },
];

export function ParentBottomTabBar() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { totalUnread: chatUnread } = useParentChatUnread();

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_16px_-6px_hsl(var(--primary-deep)/0.12)] pb-safe"
        aria-label="Parent navigation"
      >
        <ul className="grid grid-cols-6">
          {TABS.map((t) => {
            const active = t.match.some((m) =>
              m === "/check-in"
                ? location.pathname === "/check-in" || location.pathname === "/child"
                : location.pathname === m || location.pathname.startsWith(m + "/")
            );
            const Icon = t.icon;
            const showChatBadge = t.to === "/parent-chat" && chatUnread > 0;
            return (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-colors min-h-[56px]",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "relative flex items-center justify-center h-7 w-10 rounded-full transition-colors",
                      active && "bg-primary/15"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {showChatBadge && (
                      <span
                        className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground"
                        aria-label={`${chatUnread} unread chat messages`}
                      >
                        {chatUnread > 9 ? "9+" : chatUnread}
                      </span>
                    )}
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
                moreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="More"
            >
              <span
                className={cn(
                  "flex items-center justify-center h-7 w-10 rounded-full transition-colors",
                  moreOpen && "bg-primary/15"
                )}
              >
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </span>
              <span className="leading-none">More</span>
            </button>
          </li>
        </ul>
      </nav>
      <ParentMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

export default ParentBottomTabBar;