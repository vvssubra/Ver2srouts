import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Leaf, AlertTriangle, Eye, EyeOff, Check, X } from "lucide-react";

const INVALID_LINK_MSG =
  "This password reset link is invalid or has expired. Please request a new password reset link.";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setReady(true);
        setLinkError(null);
      }
    });

    (async () => {
      try {
        // 1) OTP verify flow — `?token_hash=...&type=recovery` (modern Supabase / custom templates)
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");
        if (tokenHash && (type === "recovery" || !type)) {
          const { error } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (cancelled) return;
          if (error) {
            setLinkError(INVALID_LINK_MSG);
            return;
          }
          setReady(true);
          return;
        }

        // 2) PKCE flow — `?code=...`
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error) {
            setLinkError(INVALID_LINK_MSG);
            return;
          }
          setReady(true);
          return;
        }

        // 3) Implicit / hash flow — `#access_token=...&type=recovery`
        if (window.location.hash.includes("access_token")) {
          await new Promise((r) => setTimeout(r, 300));
        }

        // 4) Fallback — existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setReady(true);
          return;
        }

        setLinkError(INVALID_LINK_MSG);
      } catch (err) {
        console.error("[reset-password] recovery init failed:", err);
        if (!cancelled) setLinkError(INVALID_LINK_MSG);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const rules = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { label: "One number", ok: /[0-9]/.test(password) },
    { label: "Passwords match", ok: password.length > 0 && password === confirmPassword },
  ];
  const canSubmit = rules.every((r) => r.ok) && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!rules.every((r) => r.ok)) {
      toast.error("Please meet all password requirements.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    // Sign out so the recovery session can't be reused and force fresh login.
    await supabase.auth.signOut();
    toast.success("Your password has been reset successfully. Please log in using your new password.");
    navigate("/auth", { replace: true });
    setLoading(false);
  };

  if (linkError) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
      >
        <Card className="w-full max-w-md border-border/50 shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-center text-lg">Reset link problem</CardTitle>
            <CardDescription className="text-center">{linkError}</CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-2">
            <Button className="w-full" onClick={() => navigate("/auth")}>Back to sign in</Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Tip: request a new link and open it on the same device where you'll sign in. Use the newest email if you requested several.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
      >
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-soft)]">
            <Leaf className="h-7 w-7 text-primary" />
          </div>
          <p className="text-muted-foreground">Verifying your reset link...</p>
          <div className="mt-4 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-soft)]">
            <Leaf className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a strong password for your account</p>
        </div>

        <Card className="border-border/50 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-4 w-4" /> Reset Password
            </CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>

              <ul className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
                {rules.map((r) => (
                  <li key={r.label} className="flex items-center gap-2">
                    {r.ok ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className={r.ok ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
