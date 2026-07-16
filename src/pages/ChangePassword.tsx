import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useChangePassword } from "@/hooks/use-change-password";

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const forced = params.get("forced") === "1";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const { changePassword, loading } = useChangePassword();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMustChange(!!(data as any)?.must_change_password));
  }, [user]);

  const showForced = forced || mustChange;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    const ok = await changePassword(current, next);
    if (ok) navigate("/", { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
    >
      <Card className="w-full max-w-md border-border/60 shadow-[var(--shadow-card)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{showForced ? "Set your new password" : "Change password"}</CardTitle>
          <CardDescription>
            {showForced
              ? "For your security, please replace the temporary password with one you'll remember."
              : "Enter your current password and choose a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              {confirm && next !== confirm && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !current || !next || next !== confirm}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
            {!showForced && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}