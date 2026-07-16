import { ReactNode, useEffect, useState } from "react";
import { useBranding } from "@/hooks/use-branding";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lean iOS-style top header for the parent shell.
 * - 44px tall, no border by default, hairline only on scroll
 * - Left: small school mark + personal greeting ("Hi, {FirstName}")
 * - Right: ghost notification bell (passed in)
 */
export function ParentTopBar({ bell }: { bell: ReactNode }) {
  const { user } = useAuth();
  const branding = useBranding();
  const icon = branding.parentIcon || branding.generalIcon || "/logo.png";
  const [scrolled, setScrolled] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["parent-topbar-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const firstName = (profile as any)?.first_name?.trim();
  const greeting = firstName ? `Hi, ${firstName}` : "Welcome back";

  return (
    <header
      className={
        "sticky top-0 z-30 bg-background/75 backdrop-blur-md transition-shadow overflow-visible " +
        (scrolled ? "shadow-[0_1px_0_0_hsl(var(--border)/0.6)]" : "")
      }
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      <div className="flex items-center justify-between gap-3 h-11 px-4 overflow-visible">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={icon}
            alt=""
            className="h-7 w-7 rounded-lg object-cover shrink-0 ring-1 ring-border/40"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
          <span className="text-[15px] font-semibold tracking-tight text-foreground truncate leading-none">
            {greeting}
          </span>
        </div>
        <div className="shrink-0 -mr-2">{bell}</div>
      </div>
    </header>
  );
}

export default ParentTopBar;