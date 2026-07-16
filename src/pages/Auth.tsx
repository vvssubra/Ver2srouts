import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Link2, ArrowLeft, Sparkles, Heart, GraduationCap, Briefcase, ShieldCheck, Leaf, Eye, EyeOff } from "lucide-react";
import { getRoleDashboardPath } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/hooks/use-branding";
import { cn } from "@/lib/utils";
import sproutsLogo from "@/assets/sprouts-logo.png.asset.json";

type LoginRole = "parent" | "teacher" | "admin";

const LOGIN_ROLE_ALLOWED: Record<LoginRole, string[]> = {
  parent: ["parent"],
  teacher: ["teacher", "staff"],
  // Non-teaching staff (e.g. Marketing, HR Ops) also use the Admin
  // entry point — they manage admissions/HR rather than classrooms.
  admin: ["admin", "franchisee", "super_admin", "staff"],
};

const LOGIN_ROLE_ERROR: Record<LoginRole, string> = {
  parent:
    "This account is not registered as a Parent. Please select the correct role or contact your school administrator.",
  teacher:
    "This account is not registered as a Teacher or Staff user. Please select the correct role or contact your school administrator.",
  admin:
    "This account is not registered as an Admin, Branch Manager, Super Admin or Staff user. Please select the correct role or contact your school administrator.",
};

const ROLE_PRIORITY_FOR_LOGIN: Record<LoginRole, string[]> = {
  parent: ["parent"],
  teacher: ["teacher", "staff"],
  // Teachers also belonging to a staff group should still land in the
  // teacher experience — so when picking the active role for the Admin
  // entry point we prefer true admin roles first and fall back to staff.
  admin: ["super_admin", "franchisee", "admin", "staff"],
};

const normalizeRole = (r: string) => r.trim().toLowerCase().replace(/[\s-]+/g, "_");

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as any).standalone === true
  );
}

function detectParentOnlyLogin(searchParams: URLSearchParams): boolean {
  if (typeof window === "undefined") return false;
  const app = searchParams.get("app");
  const role = searchParams.get("role");
  const source = searchParams.get("source");
  if (app === "parents" || role === "parent" || source === "pwa-parent") return true;
  if (searchParams.get("accessCode")) return true;
  if (app === "staff" || source === "pwa-teacher") return false;
  // Intentionally NO fallback to the persisted `sprouts:parent_pwa` flag.
  // Previously a stale flag from an earlier parent visit / PWA install could
  // trap staff (teachers, admins) on the Parent-only screen with no way to
  // sign in. Parent-only mode must be triggered by an explicit URL hint
  // (parents manifest start_url, invite/access-code link) on THIS visit.
  // Installed parent PWAs always launch with `?app=parents` in the manifest,
  // so this does not regress genuine parent PWA behaviour.
  return false;
}

const ROLE_META: Record<LoginRole, {
  label: string;
  icon: typeof Heart;
  helper: string;
  button: string;
  accentVar: string;
  accentSoft: string;
}> = {
  parent: {
    label: "Parent",
    icon: Heart,
    helper: "Access your child's updates, fees, learning journey and school messages.",
    button: "Sign in as Parent",
    accentVar: "hsl(45 97% 58%)",
    accentSoft: "hsl(45 97% 58% / 0.12)",
  },
  teacher: {
    label: "Teacher",
    icon: GraduationCap,
    helper: "Manage your class, attendance, learning records and parent communication.",
    button: "Sign in as Teacher",
    accentVar: "hsl(123 41% 45%)",
    accentSoft: "hsl(123 41% 45% / 0.12)",
  },
  admin: {
    label: "Admin",
    icon: Briefcase,
    helper: "Oversee school operations, admissions, HR, fees, reports and settings. Use this option for non-teaching staff too.",
    button: "Sign in as Admin / Staff",
    accentVar: "hsl(123 57% 24%)",
    accentSoft: "hsl(123 57% 24% / 0.12)",
  },
};

export default function Auth() {
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isParentOnlyLogin = detectParentOnlyLogin(searchParams);
  const [loginRole, setLoginRole] = useState<LoginRole>(() => {
    if (isParentOnlyLogin) return "parent";
    if (typeof window === "undefined") return "parent";
    const saved = window.localStorage.getItem("sprouts:last_login_role");
    return saved === "teacher" || saved === "admin" ? (saved as LoginRole) : "parent";
  });
  const { generalIcon, generalName } = useBranding();
  const accessCode = searchParams.get("accessCode");
  const errorParam = searchParams.get("error");
  const roleMeta = ROLE_META[loginRole];
  const RoleIcon = roleMeta.icon;

  const handleRoleSelect = (r: LoginRole) => {
    if (isParentOnlyLogin) return;
    setLoginRole(r);
    try { window.localStorage.setItem("sprouts:last_login_role", r); } catch {}
  };
  const effectiveAccessCode =
    accessCode ??
    (typeof window !== "undefined"
      ? sessionStorage.getItem("pending_parent_access_code")
      : null);

  // Self-signup is fully disabled. All accounts (parents, staff, admins) are
  // provisioned by HR/Admin and receive a welcome email with a temporary
  // password. Access codes are still honored so an invited parent who
  // already has an account gets auto-linked to their child on next login.

  useEffect(() => {
    if (errorParam === "no_access") {
      toast.error("Your account isn't linked to this school yet. Please contact your school administrator.");
    }
  }, [errorParam]);

  // ── Auto-login if a Supabase session already exists ─────────────────
  // Parents installing the PWA should not see the login screen every time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;

      // If there's a pending access code AND a live session, attempt the
      // link inline (the onAuthStateChange listener won't fire for an
      // already-existing session, which previously caused a stuck loader).
      if (effectiveAccessCode) {
        try {
          await linkParentToStudent(session.user.id, effectiveAccessCode);
        } catch (linkErr) {
          console.warn("auto-login link-parent-by-code failed:", linkErr);
        } finally {
          try { sessionStorage.removeItem("pending_parent_access_code"); } catch {}
        }
      }

      let userRoles: string[] = [];
      try {
        const { data: rows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        userRoles = ((rows ?? []) as { role: string }[])
          .map((r) => normalizeRole(r.role))
          .filter(Boolean);
      } catch (err) {
        console.error("auto-login role lookup failed:", err);
        toast.error("We could not verify your account access. Please refresh or try again.");
        setLoading(false);
        return;
      }

      if (isParentOnlyLogin) {
        if (userRoles.includes("parent")) {
          try {
            localStorage.setItem(`active-role:${session.user.id}`, "parent");
          } catch {}
          navigate("/child", { replace: true });
        } else {
          await supabase.auth.signOut();
          try {
            const app = searchParams.get("app");
            const source = searchParams.get("source");
            if (app === "staff" || source === "pwa-teacher") {
              localStorage.removeItem("sprouts:parent_pwa");
            }
          } catch {}
          toast.error("This app is for parents only.");
        }
        return;
      }

      // Non parent-only: respect saved active role or pick best.
      let active: string | null = null;
      try {
        const saved = localStorage.getItem(`active-role:${session.user.id}`);
        if (saved && userRoles.includes(normalizeRole(saved))) active = saved;
      } catch {}
      // Admin-tier roles always win: a returning admin who previously
      // switched into a lower-tier role (staff / teacher / parent) should
      // still land in their admin dashboard with admin permissions.
      const adminTier = ["super_admin", "franchisee", "admin"];
      const hasAdminTier = userRoles.some((r) => adminTier.includes(r));
      if (hasAdminTier && (!active || !adminTier.includes(active))) {
        active = adminTier.find((r) => userRoles.includes(r)) ?? active;
        if (active) {
          try { localStorage.setItem(`active-role:${session.user.id}`, active); } catch {}
        }
      }
      if (!active) {
        const order = ["super_admin", "franchisee", "admin", "teacher", "staff", "parent"];
        active = order.find((r) => userRoles.includes(r)) ?? userRoles[0] ?? null;
      }
      if (active) {
        navigate(getRoleDashboardPath(active as any), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If accessCode is present, persist it so it survives the login round-trip.
  useEffect(() => {
    if (accessCode) {
      sessionStorage.setItem("pending_parent_access_code", accessCode);
    }
  }, [accessCode]);

  // Auto-link on return from email verification
  useEffect(() => {
    let hasLinked = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user && effectiveAccessCode && !hasLinked && !linking) {
        hasLinked = true;
        setLinking(true);
        try {
          await linkParentToStudent(session.user.id, effectiveAccessCode);
          toast.success("Account verified and linked to your child!");
          window.location.href = "/child";
        } catch (err) {
          console.error("Auto-link on verify error:", err);
          window.location.href = "/child";
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [effectiveAccessCode, linking]);

  const linkParentToStudent = async (_userId: string, code: string) => {
    const { error } = await supabase.functions.invoke("link-parent-by-code", {
      body: { access_code: code },
    });

    if (error) {
      console.error("link-parent-by-code error:", error);
      throw error;
    }

    sessionStorage.removeItem("pending_parent_access_code");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    toast.success("If an account exists with this email, you'll receive a password reset link.");
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        // Copy-pasted temp passwords from email frequently include a stray
        // leading/trailing space or newline. Trim both fields defensively so
        // the parent isn't blocked by an invisible whitespace character.
        const cleanEmail = email.trim().toLowerCase();
        const cleanPassword = password.replace(/^\s+|\s+$/g, "");
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (error) {
          if (/invalid.*credentials/i.test(error.message)) {
            toast.error(
              "Invalid email or password. If you were sent a temporary password, please use the one from your most recent Sprouts welcome email — older temp passwords are automatically invalidated when a new one is issued.",
              { duration: 8000 }
            );
          } else {
            toast.error(error.message);
          }
          return;
        }

        // Fetch the user's actual assigned roles BEFORE trusting the session.
        let userRoles: string[] = [];
        try {
          const { data: rows, error: rolesErr } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.user!.id);
          if (rolesErr) throw rolesErr;
          userRoles = ((rows ?? []) as { role: string }[])
            .map((r) => normalizeRole(r.role))
            .filter(Boolean);
        } catch (lookupErr) {
          console.error("role lookup error:", lookupErr);
          await supabase.auth.signOut();
          toast.error("We couldn't verify your account access. Please try again.");
          return;
        }

        // Validate selected login role against the user's actual roles.
        const allowed = LOGIN_ROLE_ALLOWED[loginRole];
        const matched = userRoles.filter((r) => allowed.includes(r));

        // Parent access-code linking is only valid when signing in as Parent.
        const isParentLink = !!effectiveAccessCode && loginRole === "parent";

        if (matched.length === 0) {
          // Wrong role for this account — block and sign out.
          try {
            for (const userId of [data.user?.id].filter(Boolean) as string[]) {
              localStorage.removeItem(`active-role:${userId}`);
            }
          } catch {}
          await supabase.auth.signOut();
          toast.error(LOGIN_ROLE_ERROR[loginRole]);
          return;
        }

        // Pre-set the active role within the selected login group so the app
        // lands in the right experience (and stale active-role can't override).
        const priority = ROLE_PRIORITY_FOR_LOGIN[loginRole];
        const activeRole =
          priority.find((r) => matched.includes(r)) ?? matched[0];
        try {
          localStorage.setItem(`active-role:${data.user!.id}`, activeRole);
          localStorage.setItem("sprouts:last_login_role", loginRole);
        } catch {}

        if (isParentLink && data.user) {
          try {
            await linkParentToStudent(data.user.id, effectiveAccessCode);
          } catch (linkErr) {
            console.error("link-parent-by-code (login) error:", linkErr);
          }
        }

        toast.success("Welcome back!");
        const dest = getRoleDashboardPath(activeRole as any);
        navigate(dest);
    } catch (err: any) {
      console.error("auth submit error:", err);
      toast.error(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* ─── Brand panel (desktop only) ────────────────────────── */}
      <aside
        className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12"
        style={{
          background:
            "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 40%, hsl(50 100% 96%) 100%)",
        }}
      >
        {/* leafy accent shapes */}
        <div aria-hidden className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full" style={{ background: "hsl(45 97% 58% / 0.18)", filter: "blur(64px)" }} />
        <div aria-hidden className="absolute top-1/3 left-1/2 h-40 w-40 rounded-full bg-accent/15 blur-2xl" />

        <div className="relative flex items-center gap-3">
          <img
            src={sproutsLogo.url}
            alt="Sprouts"
            className="h-14 w-14 rounded-2xl object-contain bg-white shadow-[var(--shadow-soft)] p-1"
          />
          <div>
            <p className="text-base font-bold text-foreground">Sprouts</p>
            <p className="text-xs text-muted-foreground">by Little Green Hearts</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
            Growing bright futures, together.
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            One smart platform for parents, teachers and school administrators.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {(["parent", "teacher", "admin"] as LoginRole[]).map((r) => {
              const m = ROLE_META[r];
              const Icon = m.icon;
              return (
                <div
                  key={r}
                  className="flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: m.accentVar }} />
                  {m.label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI-Powered Preschool Management
        </div>
      </aside>

      {/* ─── Login card column ─────────────────────────────────── */}
      <main className="flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          {/* Logo (mobile + tablet stacked) */}
          <div className="mb-6 text-center lg:hidden">
            <img src={sproutsLogo.url} alt="Sprouts" className="mx-auto mb-3 h-24 w-24 rounded-2xl object-contain bg-white shadow-[var(--shadow-soft)] p-1" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Sprouts</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Preschool Management</p>
          </div>
          <div className="mb-6 hidden lg:flex lg:items-center lg:gap-4">
            <img src={sproutsLogo.url} alt="Sprouts" className="h-16 w-16 rounded-2xl object-contain bg-white shadow-[var(--shadow-soft)] p-1 shrink-0" />
            <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to continue to your dashboard.</p>
            </div>
          </div>

          <>
            {accessCode && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <Link2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-foreground">
                  You'll be automatically linked to your child after signing in.
                </span>
                <Badge variant="outline" className="ml-auto font-mono shrink-0">{accessCode}</Badge>
              </div>
            )}

            <Card className="border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
              {isForgotPassword ? (
                <>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Reset password</CardTitle>
                    <CardDescription>
                      Enter your email and we'll send you a reset link
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleForgotPassword}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="resetEmail">Email</Label>
                        <Input
                          id="resetEmail"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Please wait..." : "Send reset link"}
                      </Button>
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        onClick={() => setIsForgotPassword(false)}
                      >
                        <ArrowLeft className="h-3 w-3" /> Back to sign in
                      </button>
                    </CardFooter>
                  </form>
                </>
              ) : (
                <>
                  <div
                    className="h-1.5 w-full transition-colors"
                    style={{ background: roleMeta.accentVar }}
                  />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      {isParentOnlyLogin ? "Parent Sign In" : "Sign in"}
                    </CardTitle>
                    <CardDescription>
                      {isParentOnlyLogin
                        ? "Access your child's updates, learning journey, fees and school messages."
                        : "I am signing in as…"}
                    </CardDescription>
                    {/* Role selector — hidden in parent-only mode */}
                    {!isParentOnlyLogin && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {(["parent", "teacher", "admin"] as LoginRole[]).map((r) => {
                        const m = ROLE_META[r];
                        const Icon = m.icon;
                        const active = loginRole === r;
                        return (
                          <button
                            type="button"
                            key={r}
                            onClick={() => handleRoleSelect(r)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-all",
                              active
                                ? "shadow-sm"
                                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80",
                            )}
                            style={
                              active
                                ? { borderColor: m.accentVar, background: m.accentSoft, color: m.accentVar }
                                : undefined
                            }
                            aria-pressed={active}
                          >
                            <Icon className="h-5 w-5" />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    )}
                    {!isParentOnlyLogin && (
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed flex gap-2">
                      <RoleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: roleMeta.accentVar }} />
                      <span>{roleMeta.helper}</span>
                    </p>
                    )}
                  </CardHeader>
                  <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                            <button
                              type="button"
                              className="text-xs text-primary hover:text-primary/80 transition-colors"
                              onClick={() => setIsForgotPassword(true)}
                            >
                              Forgot password?
                            </button>
                        </div>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3">
                      <Button
                        type="submit"
                        className="w-full text-white border-0 hover:opacity-90 transition-opacity"
                        disabled={loading}
                        style={{ background: roleMeta.accentVar, color: loginRole === "parent" ? "hsl(217 33% 17%)" : "#fff" }}
                      >
                        {loading ? "Please wait..." : roleMeta.button}
                      </Button>
                      <div className="w-full space-y-2 text-center">
                        <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                          <ShieldCheck className="h-3 w-3 text-success" />
                          Your data is safe and secure with Sprouts.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Accounts are created by your school administrator. Contact your school if you need access.
                        </p>
                        {isParentOnlyLogin && (
                          <p className="text-xs text-muted-foreground pt-1">
                            Staff or Admin?{" "}
                            <button
                              type="button"
                              className="text-primary hover:underline font-medium"
                              onClick={() => {
                                try {
                                  localStorage.removeItem("sprouts:parent_pwa");
                                } catch {}
                                window.location.href = "/auth?app=staff";
                              }}
                            >
                              Switch to staff sign-in
                            </button>
                          </p>
                        )}
                      </div>
                    </CardFooter>
                  </form>
                </>
              )}
            </Card>
          </>
        </div>
      </main>
    </div>
  );
}
