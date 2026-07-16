import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useBranchTeachers, type BranchTeacher } from "@/hooks/use-branch-teachers";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: string | undefined;
  classId: string;
  className: string;
}

function fullName(t: BranchTeacher) {
  return `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || "Teacher";
}
function initials(t: BranchTeacher) {
  return `${t.first_name?.[0] ?? ""}${t.last_name?.[0] ?? ""}`.trim() || "T";
}

export default function AssignTeachersDialog({ open, onOpenChange, branchId, classId, className }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: teachers = [], isLoading } = useBranchTeachers(branchId);

  const initiallyAssigned = useMemo(
    () => new Set(teachers.filter((t) => t.assigned_class_ids.includes(classId)).map((t) => t.user_id)),
    [teachers, classId],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setSelected(new Set(initiallyAssigned)); }, [open, initiallyAssigned]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const changes: Array<{ membershipId: string; classIds: string[] }> = [];
      for (const t of teachers) {
        const wasAssigned = initiallyAssigned.has(t.user_id);
        const isAssigned = selected.has(t.user_id);
        if (wasAssigned === isAssigned) continue;
        const current = new Set(t.assigned_class_ids);
        isAssigned ? current.add(classId) : current.delete(classId);
        changes.push({ membershipId: t.membership_id, classIds: Array.from(current) });
      }
      for (const c of changes) {
        const { error } = await supabase
          .from("branch_memberships")
          .update({ assigned_class_ids: c.classIds.length ? c.classIds : null })
          .eq("id", c.membershipId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-teachers", branchId] });
      qc.invalidateQueries({ queryKey: ["branch-teachers", branchId] });
      toast({ title: "Teachers updated", description: `Assignments saved for ${className}.` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign teachers · {className}</DialogTitle>
          <DialogDescription>Select the teachers who should appear on this class roster.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : teachers.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <UserPlus className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No teachers in this branch yet.</p>
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate("/users"); }}>
                Go to Staff Management
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {teachers.map((t) => {
                const checked = selected.has(t.user_id);
                const otherCount = t.assigned_class_ids.filter((id) => id !== classId).length;
                return (
                  <li key={t.user_id}>
                    <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(t.user_id)} />
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
                          {initials(t)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{fullName(t)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {otherCount === 0 ? "No other classes" : `Also in ${otherCount} other class${otherCount > 1 ? "es" : ""}`}
                        </p>
                      </div>
                      {checked && <Badge variant="secondary" className="text-[10px]">Assigned</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading || teachers.length === 0}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}