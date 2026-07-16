import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";

interface EditAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: any;
  branchId: string;
  branchStaff?: any[];
  mode: "edit" | "add";
}

export default function EditAttendanceDialog({ open, onOpenChange, record, branchId, branchStaff, mode }: EditAttendanceDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState(record?.date || today);
  const [staffId, setStaffId] = useState(record?.user_id || "");
  const [clockIn, setClockIn] = useState(record?.clock_in ? format(new Date(record.clock_in), "HH:mm") : "");
  const [clockOut, setClockOut] = useState(record?.clock_out ? format(new Date(record.clock_out), "HH:mm") : "");
  const [notes, setNotes] = useState(record?.notes || "");
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["branch-staff-attendance"] });
    queryClient.invalidateQueries({ queryKey: ["staff-attendance-today"] });
    queryClient.invalidateQueries({ queryKey: ["branch-attendance-history"] });
    // Keep Payroll editor in sync with attendance edits.
    queryClient.invalidateQueries({ queryKey: ["staff-attendance-inline"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const clockInTs = clockIn ? new Date(`${date}T${clockIn}:00`).toISOString() : null;
      const clockOutTs = clockOut ? new Date(`${date}T${clockOut}:00`).toISOString() : null;

      if (mode === "edit" && record) {
        if (!reason.trim()) throw new Error("Please provide a reason for the change");
        
        // Log audit trail
        await supabase.from("staff_attendance_audit_log").insert({
          attendance_id: record.id,
          action: "update",
          changed_by: user!.id,
          reason: reason.trim(),
          old_values: { clock_in: record.clock_in, clock_out: record.clock_out, notes: record.notes },
          new_values: { clock_in: clockInTs, clock_out: clockOutTs, notes },
        } as any);

        const { error } = await supabase
          .from("staff_attendance")
          .update({ clock_in: clockInTs, clock_out: clockOutTs, notes } as any)
          .eq("id", record.id);
        if (error) throw error;
      } else {
        if (!staffId) throw new Error("Please select a staff member");
        const { error } = await supabase.from("staff_attendance").insert({
          user_id: staffId,
          branch_id: branchId,
          date,
          clock_in: clockInTs,
          clock_out: clockOutTs,
          notes,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: mode === "edit" ? "Attendance updated" : "Attendance added" });
      invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteReason.trim()) throw new Error("Please provide a reason for deletion");
      if (!record) throw new Error("No record to delete");

      // Log audit trail before deleting
      await supabase.from("staff_attendance_audit_log").insert({
        attendance_id: record.id,
        action: "delete",
        changed_by: user!.id,
        reason: deleteReason.trim(),
        old_values: { clock_in: record.clock_in, clock_out: record.clock_out, notes: record.notes, date: record.date, user_id: record.user_id },
        new_values: null,
      } as any);

      const { error } = await supabase.from("staff_attendance").delete().eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Attendance record deleted" });
      invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Attendance" : "Add Attendance Record"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "add" && branchStaff && (
            <div>
              <Label>Staff Member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {branchStaff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "add" && (
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Clock In</Label>
              <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div>
              <Label>Clock Out</Label>
              <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          {mode === "edit" && (
            <div>
              <Label>Reason for Change <span className="text-destructive">*</span></Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this record being changed? (required)"
                className="min-h-[60px]"
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {mode === "edit" && record && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="mr-auto gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Attendance Record</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this attendance record. A reason is required for audit purposes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div>
                  <Label>Reason for Deletion <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Why is this record being deleted?"
                    className="min-h-[60px] mt-1"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={!deleteReason.trim() || deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
