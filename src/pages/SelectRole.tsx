import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth, getRoleDashboardPath, getRoleLabel } from "@/lib/auth";
import { GraduationCap, Heart, Briefcase, ShieldCheck, Users, Leaf, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_THEME: Record<string, { accent: string; soft: string; tint: string; ink: string }> = {
  parent:      { accent: "hsl(45 97% 58%)",  soft: "hsl(45 97% 58% / 0.14)",  tint: "hsl(50 100% 97%)",  ink: "hsl(217 33% 17%)" },
  teacher:     { accent: "hsl(123 41% 45%)", soft: "hsl(123 41% 45% / 0.12)", tint: "hsl(108 100% 98%)", ink: "#fff" },
  staff:       { accent: "hsl(123 41% 45%)", soft: "hsl(123 41% 45% / 0.12)", tint: "hsl(108 100% 98%)", ink: "#fff" },
  admin:       { accent: "hsl(123 57% 24%)", soft: "hsl(123 57% 24% / 0.12)", tint: "hsl(108 30% 98%)",  ink: "#fff" },
  franchisee:  { accent: "hsl(123 57% 24%)", soft: "hsl(123 57% 24% / 0.12)", tint: "hsl(108 30% 98%)",  ink: "#fff" },
  super_admin: { accent: "hsl(123 57% 24%)", soft: "hsl(123 57% 24% / 0.12)", tint: "hsl(108 30% 98%)",  ink: "#fff" },
};

const ROLE_ICON: Record<string, any> = {
  super_admin: ShieldCheck,
  franchisee: Briefcase,
  admin: Briefcase,
  teacher: GraduationCap,
  staff: Users,
  parent: Heart,
};

const ROLE_BLURB: Record<string, string> = {
  super_admin: "Manage the whole network",
  franchisee: "Run your branch operations",
  admin: "Administer your school",
  teacher: "Plan lessons, track students",
  staff: "Day-to-day school operations",
  parent: "Your child's learning journey",
};

export default function SelectRole() {
  const { roles, role, loading, session, setActiveRole } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("return");

  useEffect(() => {
    if (!loading && !session) navigate("/auth", { replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    // If user only has one role, skip the picker entirely.
    if (!loading && roles.length <= 1) {
      navigate(returnTo || getRoleDashboardPath(role), { replace: true });
    }
  }, [loading, roles, role, returnTo, navigate]);

  const choose = (r: any) => {
    setActiveRole(r);
    // Only honor returnTo if it makes sense for the chosen role —
    // otherwise we bounce back to /select-role because ProtectedRoute
    // sees the path isn't allowed for the new active role.
    const parentPaths = ["/child", "/parent"];
    const isParentPath = returnTo
      ? parentPaths.some((p) => returnTo.startsWith(p))
      : false;
    let target = getRoleDashboardPath(r);
    if (returnTo) {
      if (r === "parent" && isParentPath) target = returnTo;
      else if (r !== "parent" && !isParentPath) target = returnTo;
    }
    // Defer so context state propagates before navigation runs ProtectedRoute checks.
    setTimeout(() => {
      navigate(target, { replace: true });
    }, 0);
  };

  if (loading || roles.length <= 1) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
    >
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-white shadow-[var(--shadow-soft)] flex items-center justify-center">
            <Leaf className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Choose your mode</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Your account has access to more than one role. Pick how you want to continue —
            you can switch any time from the sidebar.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => {
            const Icon = ROLE_ICON[r] ?? Users;
            const theme = ROLE_THEME[r] ?? ROLE_THEME.teacher;
            return (
              <Card
                key={r}
                className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 group overflow-hidden border-border/60"
                onClick={() => choose(r)}
                style={{ background: theme.tint }}
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                    style={{ background: theme.soft, color: theme.accent }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Continue as {getRoleLabel(r)}</p>
                    <p className="text-xs text-muted-foreground truncate">{ROLE_BLURB[r] ?? ""}</p>
                  </div>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1"
                    style={{ color: theme.accent }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}