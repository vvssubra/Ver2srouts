import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

export function useChangePassword() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> => {
    if (!user?.email) {
      toast({ title: "Not signed in", variant: "destructive" });
      return false;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return false;
    }
    setLoading(true);
    try {
      // Re-verify current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInErr) {
        toast({ title: "Current password is incorrect", variant: "destructive" });
        return false;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        toast({ title: "Could not update password", description: updateErr.message, variant: "destructive" });
        return false;
      }
      const changedAt = new Date().toISOString();
      await supabase
        .from("profiles")
        .update({ must_change_password: false, password_changed_at: changedAt })
        .eq("id", user.id);
      await supabase
        .from("parent_onboarding_state")
        .update({ password_changed_at: changedAt })
        .eq("parent_id", user.id);
      toast({ title: "Password updated", description: "Your new password is now active." });
      return true;
    } finally {
      setLoading(false);
    }
  };

  return { changePassword, loading };
}