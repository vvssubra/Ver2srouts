import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Mail, KeyRound, X, Loader2, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface FamilyMember {
  link_id: string;
  parent_id: string;
  relation: string;
  is_primary: boolean;
  created_via: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  must_change_password: boolean | null;
  last_sign_in_at?: string | null;
  onboarding: {
    password_changed_at: string | null;
    profile_completed_at: string | null;
    tnc_accepted_at: string | null;
    handbook_accepted_at: string | null;
    completed_at: string | null;
  } | null;
}

function statusChip(m: FamilyMember) {
  const o = m.onboarding;
  if (o?.completed_at) return { label: "Active", variant: "default" as const };
  if (m.must_change_password) return { label: "Invited", variant: "secondary" as const };
  if (!o?.password_changed_at) return { label: "Password pending", variant: "outline" as const };
  if (!o?.profile_completed_at) return { label: "Profile pending", variant: "outline" as const };
  if (!o?.tnc_accepted_at) return { label: "T&C pending", variant: "outline" as const };
  if (!o?.handbook_accepted_at) return { label: "Handbook pending", variant: "outline" as const };
  return { label: "In progress", variant: "outline" as const };
}

export default function FamilyMemberRow({
  member,
  studentId,
  branchId,
}: {
  member: FamilyMember;
  studentId: string;
  branchId: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const chip = statusChip(member);
  const initial = (member.first_name?.[0] || member.email?.[0] || "P").toUpperCase();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["student-family", studentId] });
  };

  const setPrimaryMut = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) {
        // Clear other primaries on the same student first
        await supabase
          .from("parent_students")
          .update({ is_primary: false } as any)
          .eq("student_id", studentId);
      }
      const { error } = await supabase
        .from("parent_students")
        .update({ is_primary: next } as any)
        .eq("id", member.link_id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Primary contact updated" });
    },
    onError: (e: any) =>
      toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const callProvision = async (mode: "resend" | "reset") => {
    setBusy(mode);
    try {
      const { error, data } = await supabase.functions.invoke("provision-parent-account", {
        body: {
          student_id: studentId,
          branch_id: branchId,
          relation: member.relation,
          email: member.email,
          first_name: member.first_name,
          last_name: member.last_name,
          phone: member.phone,
          is_primary: member.is_primary,
          send_email: true,
          reset_password: true, // always rotate so we can email the password
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const niceName = member.first_name || member.email?.split("@")[0] || "the parent";
      toast({
        title: mode === "reset" ? "Password reset & emailed 🔑" : "Welcome email re-sent 📨",
        description: `We've emailed ${niceName} at ${member.email} — ask them to check spam if it doesn't arrive in a few minutes.`,
      });
      invalidate();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const unlinkMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parent_students")
        .delete()
        .eq("id", member.link_id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Parent unlinked" });
    },
    onError: (e: any) =>
      toast({ title: "Could not unlink", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-3 rounded-lg p-3 bg-muted/30 border">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">
            {member.first_name} {member.last_name}
          </p>
          <Badge variant="outline" className="capitalize text-[10px] py-0">
            {member.relation}
          </Badge>
          {member.is_primary && (
            <Badge className="text-[10px] py-0 gap-1">
              <Star className="h-2.5 w-2.5" /> Primary
            </Badge>
          )}
          <Badge variant={chip.variant} className="text-[10px] py-0">{chip.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Switch
            checked={member.is_primary}
            disabled={setPrimaryMut.isPending}
            onCheckedChange={(v) => setPrimaryMut.mutate(v)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => callProvision("resend")}>
              <Mail className="h-4 w-4 mr-2" /> Resend welcome email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => callProvision("reset")}>
              <KeyRound className="h-4 w-4 mr-2" /> Reset password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm("Unlink this parent from the child?")) unlinkMut.mutate();
              }}
            >
              <X className="h-4 w-4 mr-2" /> Unlink
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}