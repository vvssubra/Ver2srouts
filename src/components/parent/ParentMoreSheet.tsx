import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParentChildren } from "@/hooks/use-parent-children";
import {
  User, Megaphone, FileText, Users, HelpCircle, LogOut, ChevronRight, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  destructive?: boolean;
};

/**
 * Parent "More" bottom sheet. Holds secondary destinations + logout so
 * the bottom tab bar can stay focused on the 5 daily-use surfaces.
 */
export function ParentMoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user && open,
    staleTime: 5 * 60 * 1000,
  });

  const { children } = useParentChildren();

  const parentName =
    [(profile as any)?.first_name, (profile as any)?.last_name].filter(Boolean).join(" ").trim() ||
    "Parent";
  const parentInitial = (parentName[0] ?? "P").toUpperCase();
  const portalLabel = "Sprouts Parent Portal";
  const childCountLine =
    children.length === 0
      ? portalLabel
      : `${portalLabel} · ${children.length} child${children.length === 1 ? "" : "ren"} linked`;
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as any)?.standalone === true);

  const go = (to: string) => {
    onOpenChange(false);
    setTimeout(() => navigate(to), 0);
  };

  const items: Item[] = [
    { label: "My Account", description: "Your profile, child & family details", icon: User, to: "/account" },
    { label: "School Updates", description: "Announcements & newsletters", icon: Megaphone, to: "/parent-messages" },
    { label: "Documents", description: "Read & sign school documents", icon: FileText, to: "/school-documents" },
    { label: "Parent–Teacher Meetings", description: "Upcoming and past meetings", icon: Users, to: "/parent-ptm" },
    {
      label: isStandalone ? "App Installed" : "Install Sprouts App",
      description: isStandalone
        ? "Sprouts is added to your home screen"
        : "Add Sprouts to your phone home screen",
      icon: Smartphone,
      to: "/install/parents",
    },
    { label: "Help & Support", description: "Get help using the app", icon: HelpCircle, to: "/help" },
    {
      label: "Log out",
      icon: LogOut,
      destructive: true,
      onClick: () => {
        onOpenChange(false);
        signOut();
        navigate("/auth");
      },
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl border-t p-0 max-h-[85vh] flex flex-col overflow-hidden [&>button]:top-3 [&>button]:right-3 [&>button]:z-10 pb-safe"
      >
        <SheetHeader className="p-0 text-left space-y-0">
          <SheetTitle className="sr-only">More</SheetTitle>
          {/* Identity banner — gradient fills to the very top, drag handle sits inside it */}
          <div className="relative px-5 pt-3 pb-5 bg-gradient-to-b from-primary/15 via-primary/[0.06] to-transparent">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/15" aria-hidden />
            <div className="flex flex-col items-center text-center gap-2 mt-1">
              <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-xl font-bold ring-2 ring-background shadow-md overflow-hidden">
                {(profile as any)?.avatar_url ? (
                  <img
                    src={(profile as any).avatar_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  parentInitial
                )}
              </div>
              <p className="text-[17px] font-bold leading-tight text-foreground truncate max-w-full">
                {parentName}
              </p>
              <p className="text-[12px] text-muted-foreground truncate max-w-full">
                {childCountLine}
              </p>
            </div>
          </div>
        </SheetHeader>
        <ul className="overflow-y-auto px-2 pb-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => (item.onClick ? item.onClick() : item.to && go(item.to))}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors hover:bg-muted/60 active:bg-muted",
                    item.destructive && "text-destructive hover:bg-destructive/10",
                  )}
                >
                  <span
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                      item.destructive
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold leading-tight">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {!item.destructive && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export default ParentMoreSheet;