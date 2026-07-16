import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Share2, Loader2, X, UserPlus } from "lucide-react";

interface SharePlanDialogProps {
  planId: string;
  planTitle: string;
  children?: React.ReactNode;
}

export default function SharePlanDialog({ planId, planTitle, children }: SharePlanDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  // Fetch existing shares for this plan
  const { data: shares = [], isLoading: sharesLoading } = useQuery({
    queryKey: ["plan-shares", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_plans")
        .select("id, shared_with, created_at")
        .eq("lesson_plan_id", planId)
        .eq("shared_by", user!.id);
      if (error) throw error;

      // Fetch profile info for shared_with users
      const userIds = data.map((s: any) => s.shared_with);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", userIds);

      return data.map((s: any) => ({
        ...s,
        profile: profiles?.find((p: any) => p.id === s.shared_with),
      }));
    },
    enabled: open && !!user,
  });

  const shareMutation = useMutation({
    mutationFn: async (targetEmail: string) => {
      // Find user by email
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", targetEmail)
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profile) throw new Error("User not found with that email");
      if (profile.id === user!.id) throw new Error("You can't share with yourself");

      const { error } = await supabase.from("shared_plans").insert({
        lesson_plan_id: planId,
        shared_by: user!.id,
        shared_with: profile.id,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Already shared with this user");
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-shares", planId] });
      setEmail("");
      toast({ title: "Dikongsi! ✅", description: "Plan shared successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from("shared_plans").delete().eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-shares", planId] });
      toast({ title: "Removed", description: "Share access removed." });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-1.5" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kongsi Rancangan / Share Plan</DialogTitle>
          <DialogDescription>
            Share "{planTitle}" with another teacher by their email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="share-email" className="sr-only">Email</Label>
              <Input
                id="share-email"
                placeholder="teacher@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && email.trim() && shareMutation.mutate(email.trim())}
              />
            </div>
            <Button
              onClick={() => shareMutation.mutate(email.trim())}
              disabled={!email.trim() || shareMutation.isPending}
            >
              {shareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><UserPlus className="h-4 w-4 mr-1" />Add</>
              )}
            </Button>
          </div>

          {shares.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Shared with</Label>
              {shares.map((share: any) => (
                <div key={share.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {share.profile?.first_name
                        ? `${share.profile.first_name} ${share.profile.last_name || ""}`
                        : share.profile?.email || "Unknown"}
                    </p>
                    {share.profile?.first_name && (
                      <p className="text-xs text-muted-foreground">{share.profile.email}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unshareMutation.mutate(share.id)}
                    disabled={unshareMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
