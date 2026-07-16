import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UserCheck, Plus, Loader2, Phone, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

interface Props {
  studentId: string;
  branchId: string;
  studentName?: string;
}

/**
 * Lets a parent notify the school in advance that a different person will pick up
 * their child on a specific day. Triggers a notification to class teachers + branch
 * admins on insert (database trigger `notify_pickup_change`).
 */
export function PickupChangeCard({ studentId, branchId, studentName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    pickup_date: today,
    pickup_person_name: "",
    pickup_person_phone: "",
    relationship: "",
    ic_number: "",
    notes: "",
  });

  const { data: changes = [] } = useQuery({
    queryKey: ["pickup-changes", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pickup_changes")
        .select("*")
        .eq("student_id", studentId)
        .gte("pickup_date", today)
        .order("pickup_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (!form.pickup_person_name || !form.pickup_person_phone) {
        throw new Error("Name and phone are required");
      }
      const { error } = await (supabase as any).from("pickup_changes").insert({
        student_id: studentId,
        branch_id: branchId,
        parent_id: user.id,
        ...form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teacher has been notified.");
      setOpen(false);
      setForm({
        pickup_date: today,
        pickup_person_name: "",
        pickup_person_phone: "",
        relationship: "",
        ic_number: "",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["pickup-changes", studentId] });
    },
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" /> Pickup Change
          </span>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Notify
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader className="text-left">
                <SheetTitle>Notify pickup change</SheetTitle>
                <SheetDescription>
                  Tell the teacher who will pick up {studentName || "your child"} and when.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    min={today}
                    value={form.pickup_date}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Person's full name *</Label>
                  <Input
                    placeholder="e.g. Auntie Sarah"
                    value={form.pickup_person_name}
                    onChange={(e) => setForm({ ...form, pickup_person_name: e.target.value })}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone *</Label>
                  <Input
                    type="tel"
                    placeholder="e.g. 012-3456789"
                    value={form.pickup_person_phone}
                    onChange={(e) => setForm({ ...form, pickup_person_phone: e.target.value })}
                    className="text-base"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Relationship</Label>
                    <Input
                      placeholder="e.g. Aunt"
                      value={form.relationship}
                      onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IC / passport</Label>
                    <Input
                      placeholder="optional"
                      value={form.ic_number}
                      onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
                      className="text-base"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes for teacher</Label>
                  <Textarea
                    rows={2}
                    placeholder="Anything else the teacher should know"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="text-base"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Notify teacher
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No pickup changes scheduled. Tap “Notify” to let the teacher know if someone different will collect your child today.
          </p>
        ) : (
          <div className="space-y-2">
            {changes.map((c: any) => (
              <div key={c.id} className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(c.pickup_date), "EEE, d MMM")}
                  </span>
                  <Badge
                    variant={c.status === "acknowledged" ? "default" : c.status === "cancelled" ? "outline" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {c.status}
                  </Badge>
                </div>
                <p className="text-foreground/90">
                  {c.pickup_person_name}
                  {c.relationship ? ` (${c.relationship})` : ""}
                </p>
                <p className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3 w-3" /> {c.pickup_person_phone}
                </p>
                {c.notes && <p className="text-muted-foreground italic">{c.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}