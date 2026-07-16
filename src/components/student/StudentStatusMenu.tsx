import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, MoreHorizontal, CheckCircle2, PauseCircle, UserMinus, GraduationCap, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type EnrollmentStatus = "active" | "on_hold" | "withdrawn" | "graduated";

export const STATUS_META: Record<EnrollmentStatus, { label: string; badge: string; icon: any }> = {
  active:     { label: "Active",     badge: "bg-accent/20 text-accent-foreground border-accent/40",     icon: CheckCircle2 },
  on_hold:    { label: "On Hold",    badge: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",   icon: PauseCircle },
  withdrawn:  { label: "Withdrawn",  badge: "bg-destructive/15 text-destructive border-destructive/30", icon: UserMinus },
  graduated:  { label: "Graduated",  badge: "bg-primary/15 text-primary border-primary/30",            icon: GraduationCap },
};

export function StatusBadge({ status }: { status: EnrollmentStatus | null | undefined }) {
  const s = (status ?? "active") as EnrollmentStatus;
  const meta = STATUS_META[s];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", meta.badge)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

interface Props {
  studentId: string;
  currentStatus: EnrollmentStatus;
  variant?: "button" | "icon";
  onChanged?: () => void;
}

export default function StudentStatusMenu({ studentId, currentStatus, variant = "icon", onChanged }: Props) {
  const { user, role } = useAuth();
  // Teachers must not be able to change student lifecycle status
  if (role === "teacher") return null;
  const qc = useQueryClient();
  const [pendingStatus, setPendingStatus] = useState<EnrollmentStatus | null>(null);
  const [reason, setReason] = useState("");

  const mutate = useMutation({
    mutationFn: async ({ to, reason }: { to: EnrollmentStatus; reason: string }) => {
      const { error: uerr } = await supabase
        .from("students")
        .update({
          enrollment_status: to,
          status_reason: reason || null,
          status_changed_at: new Date().toISOString(),
          status_changed_by: user?.id ?? null,
        } as any)
        .eq("id", studentId);
      if (uerr) throw uerr;
      await supabase.from("student_status_history" as any).insert({
        student_id: studentId,
        from_status: currentStatus,
        to_status: to,
        reason: reason || null,
        changed_by: user?.id ?? null,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student-detail", studentId] });
      qc.invalidateQueries({ queryKey: ["student-status-history", studentId] });
      setPendingStatus(null);
      setReason("");
      toast({ title: "Status updated" });
      onChanged?.();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const allTransitions: { to: EnrollmentStatus; label: string; danger?: boolean }[] = [
    { to: "active",    label: "Mark Active" },
    { to: "on_hold",   label: "Place On Hold" },
    { to: "graduated", label: "Mark Graduated" },
    { to: "withdrawn", label: "Withdraw", danger: true },
  ];
  const transitions = allTransitions.filter(t => t.to !== currentStatus);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "button" ? (
            <Button variant="outline" size="sm" className="gap-1.5">
              Change Status <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Change status">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Lifecycle</DropdownMenuLabel>
          {transitions.map(t => {
            const Icon = STATUS_META[t.to].icon;
            return (
              <DropdownMenuItem
                key={t.to}
                className={cn("gap-2", t.danger && "text-destructive focus:text-destructive")}
                onSelect={(e) => { e.preventDefault(); setPendingStatus(t.to); }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingStatus && `Change status to ${STATUS_META[pendingStatus].label}`}
            </DialogTitle>
            <DialogDescription>
              This will be recorded in the student's lifecycle history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason (optional but recommended)</Label>
            <Textarea
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family relocating overseas, completed K2 programme, requested temporary pause..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingStatus(null)}>Cancel</Button>
            <Button
              onClick={() => pendingStatus && mutate.mutate({ to: pendingStatus, reason })}
              disabled={mutate.isPending}
            >
              {mutate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}