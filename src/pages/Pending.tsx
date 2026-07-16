import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, LogOut, RefreshCw, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { useBranding } from "@/hooks/use-branding";

export default function Pending() {
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { role, loading } = useAuth();
  const { iconForRole, nameForRole } = useBranding();
  const appIcon = iconForRole(role);
  const appName = nameForRole(role);
  const pendingInviteAccessCode =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("accessCode") ||
        sessionStorage.getItem("pending_parent_access_code")
      : null;

  // Auto-redirect when role is detected
  useEffect(() => {
    if (!loading && role) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, role, navigate]);

  // Invite-only app: if there's no parent access code in flight, this user
  // shouldn't be on /pending at all. Sign them out and send to /auth with
  // a clear error.
  useEffect(() => {
    if (loading || role) return;
    if (pendingInviteAccessCode) return;
    (async () => {
      await supabase.auth.signOut();
      navigate("/auth?error=no_access", { replace: true });
    })();
  }, [loading, role, pendingInviteAccessCode, navigate]);

  // If this is a school invite flow that reached pending, self-heal by linking in background
  useEffect(() => {
    const autoLinkFromInvite = async () => {
      if (loading || role || !pendingInviteAccessCode) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { error } = await supabase.functions.invoke("link-parent-by-code", {
        body: { access_code: pendingInviteAccessCode },
      });

      if (error) {
        console.error("Pending auto-link error:", error);
        return;
      }

      sessionStorage.removeItem("pending_parent_access_code");
      toast.success("Access granted! Redirecting...");
      window.location.href = "/dashboard";
    };

    void autoLinkFromInvite();
  }, [loading, role, pendingInviteAccessCode]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    if (pendingInviteAccessCode) {
      const { error } = await supabase.functions.invoke("link-parent-by-code", {
        body: { access_code: pendingInviteAccessCode },
      });

      if (!error) {
        sessionStorage.removeItem("pending_parent_access_code");
        toast.success("Access granted! Redirecting...");
        window.location.href = "/dashboard";
        return;
      }

      console.error("Pending refresh auto-link error:", error);
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .limit(1)
      .single();

    if (data?.role) {
      toast.success("Access granted! Redirecting...");
      window.location.href = "/dashboard";
    } else {
      toast.info("Your account is still pending approval.");
    }
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, hsl(110 47% 94%) 0%, hsl(108 100% 98%) 50%, hsl(50 100% 96%) 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={appIcon} alt={appName} className="mx-auto mb-2 h-24 w-24 rounded-2xl object-cover shadow-[var(--shadow-soft)]" />
          <p className="mt-1 text-xs text-muted-foreground">by Little Green Hearts</p>
        </div>

        <Card className="border-border/50 shadow-[var(--shadow-card)]">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Account Pending Approval</CardTitle>
            <CardDescription className="text-sm">
              Your account has been created successfully. An administrator needs to assign your role before you can access the system.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                What happens next?
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                <li>Your administrator has been notified of your registration</li>
                <li>They will review and assign your role (Teacher, Admin, etc.)</li>
                <li>Once approved, click "Check access" below to proceed</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                If you need immediate access, contact your school's administrator directly.
              </p>
            </div>
            <Button onClick={handleRefresh} disabled={refreshing} className="w-full">
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Checking..." : "Check access"}
            </Button>
            <Button variant="outline" onClick={handleSignOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
