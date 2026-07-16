import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CalendarCheck, Plus, Loader2, MapPin, Clock, Users, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { sendTemplateEmail } from "@/lib/notify";
import { buildAppUrl } from "@/lib/app-url";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  confirmed: "bg-accent/15 text-accent border-accent/30",
  declined: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  completed: "bg-primary/15 text-primary border-primary/30",
};

interface PtmSlotsProps {
  embedded?: boolean;
  /**
   * Restrict the rendered surface:
   *  - "both" (default): show internal Slots/Bookings tabs (legacy behaviour).
   *  - "slots": only render the slot board + publish action.
   *  - "bookings": only render the bookings inbox.
   */
  view?: "both" | "slots" | "bookings";
}
export default function PtmSlots({ embedded = false, view = "both" }: PtmSlotsProps = {}) {
  const { user } = useAuth();
  const { branches, selectedBranchId, activeBranchIds } = useGlobalBranch();
  const isAllSelected = selectedBranchId === "all";
  // A specific branch is required only when publishing a new slot. Reading can span all accessible branches.
  const branchId = selectedBranchId && !isAllSelected ? selectedBranchId : undefined;
  const branchIdsToRead = isAllSelected ? activeBranchIds : branchId ? [branchId] : [];
  const branchQueryKey = branchIdsToRead.join(",");
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const qc = useQueryClient();
  const [tab, setTab] = useState(view === "bookings" ? "bookings" : "slots");
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    branch_id: branchId ?? "",
    class_id: "all",
    slot_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "09:30",
    location: "",
    notes: "",
  });
  const publishBranchId = form.branch_id || branchId;

  useEffect(() => {
    if (branchId) {
      setForm((current) => ({ ...current, branch_id: branchId, class_id: "all" }));
    }
  }, [branchId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-ptm", publishBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, class_name").eq("branch_id", publishBranchId!).order("class_name");
      return data ?? [];
    },
    enabled: !!publishBranchId,
  });

  // Teacher scope: only show classes they're assigned to
  const { teacherClassIds } = useTeacherClasses(publishBranchId);
  const visibleClasses = useMemo(() => {
    if (!teacherClassIds) return classes;
    return classes.filter((c: any) => teacherClassIds.includes(c.id));
  }, [classes, teacherClassIds]);

  const { data: slots = [] } = useQuery({
    queryKey: ["staff-ptm-slots", branchQueryKey],
    queryFn: async () => {
      const { data } = await (supabase.from("ptm_slots" as any).select("*, classes(class_name)") as any)
        .in("branch_id", branchIdsToRead)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: branchIdsToRead.length > 0,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["staff-ptm-bookings", branchQueryKey],
    queryFn: async () => {
      const { data } = await (supabase
        .from("ptm_bookings" as any)
        .select("*, ptm_slots!ptm_bookings_slot_id_fkey(slot_date, start_time, end_time, location, branch_id), students(first_name, last_name, class_id)") as any)
        .in("branch_id", branchIdsToRead)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: branchIdsToRead.length > 0,
  });

  const activeBookingCountBySlot = useMemo(() => {
    const counts = new Map<string, number>();
    bookings.forEach((b: any) => {
      if (["pending", "confirmed"].includes(b.status)) {
        counts.set(b.slot_id, (counts.get(b.slot_id) ?? 0) + 1);
      }
    });
    return counts;
  }, [bookings]);
  const visibleBookings = useMemo(() => {
    if (!teacherClassIds) return bookings;
    return bookings.filter((b: any) => !b.students?.class_id || teacherClassIds.includes(b.students.class_id));
  }, [bookings, teacherClassIds]);

  const createSlot = useMutation({
    mutationFn: async () => {
      if (!publishBranchId) throw new Error("Select a branch before publishing a PTM slot.");
      const { error } = await supabase.from("ptm_slots" as any).insert({
        branch_id: publishBranchId,
        class_id: form.class_id === "all" ? null : form.class_id,
        teacher_id: user!.id,
        slot_date: form.slot_date,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || null,
        notes: form.notes || null,
        status: "open",
        created_by: user!.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-ptm-slots"] });
      setOpenCreate(false);
      toast({ title: "Slot published ✅", description: "Parents can now book this time." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("ptm_slots" as any) as any).update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-ptm-slots"] }),
  });

  const respondBooking = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const update: any = { status };
      if (notes !== undefined) update.staff_notes = notes;
      const { error } = await (supabase.from("ptm_bookings" as any) as any).update(update).eq("id", id);
      if (error) throw error;
      // Free the slot if booking is declined/cancelled so other parents can rebook.
      if (status === "declined" || status === "cancelled") {
        const b = bookings.find((x: any) => x.id === id);
        if (b?.slot_id) {
          await (supabase.from("ptm_slots" as any) as any)
            .update({ status: "open" })
            .eq("id", b.slot_id)
            .eq("status", "booked");
        }
      }
      // Parent confirmation email is sent by the DB trigger
      // `notify_ptm_booking_status_change` (idempotent on booking id + status).
      // Do NOT also send from the client — that previously caused duplicate
      // `parent-ptm-status` emails on confirm.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-ptm-bookings"] });
      qc.invalidateQueries({ queryKey: ["staff-ptm-slots"] });
      toast({ title: "Updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>;

  return (
    <Wrapper>
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            {!embedded && (
              <>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  PTM Slots & Bookings
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Publish meeting slots; review and confirm parent booking requests.
                </p>
              </>
            )}
          </div>
          <Button onClick={() => setOpenCreate(true)} disabled={branches.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Publish Slot
          </Button>
        </div>
        {isAllSelected && (
          <Card>
            <CardContent className="py-3 text-xs text-muted-foreground">
              Viewing PTM slots and bookings across all accessible branches. Select a specific branch from the branch picker to publish a new slot.
            </CardContent>
          </Card>
        )}
        {!isAllSelected && branchName && (
          <p className="text-xs text-muted-foreground">Branch: <span className="font-medium text-foreground">{branchName}</span></p>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          {view === "both" && (
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="slots">Slots ({slots.filter((s: any) => s.status === "open").length} open)</TabsTrigger>
              <TabsTrigger value="bookings">
                Bookings ({visibleBookings.filter((b: any) => b.status === "pending").length} pending)
              </TabsTrigger>
            </TabsList>
          )}

          {view !== "bookings" && (
          <TabsContent value="slots" className="space-y-2 mt-4" forceMount>
            {(() => {
              const visibleSlots = !isAllSelected && teacherClassIds
                ? slots.filter((s: any) => !s.class_id || teacherClassIds.includes(s.class_id))
                : slots;
              return visibleSlots.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No slots yet. Publish your first PTM slot.</CardContent></Card>
            ) : (
              visibleSlots.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-semibold">{format(new Date(s.slot_date), "EEE, d MMM yyyy")}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</span>
                        {isAllSelected && <Badge variant="outline" className="text-[10px]">{branches.find((b) => b.id === s.branch_id)?.name ?? "Branch"}</Badge>}
                        {s.classes?.class_name && <Badge variant="outline" className="text-[10px]">{s.classes.class_name}</Badge>}
                        {!s.classes && <Badge variant="outline" className="text-[10px]">All classes</Badge>}
                        <Badge variant="outline" className="text-[10px]">{activeBookingCountBySlot.get(s.id) ?? 0}/{s.capacity ?? 1} booked</Badge>
                        {s.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize text-[10px]">{s.status}</Badge>
                    {s.status === "open" && (
                      <Button size="sm" variant="ghost" onClick={() => closeSlot.mutate(s.id)}>
                        <X className="h-3 w-3 mr-1" /> Close
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            );
            })()}
          </TabsContent>
          )}

          {view !== "slots" && (
          <TabsContent value="bookings" className="space-y-2 mt-4" forceMount>
            {visibleBookings.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No bookings yet.</CardContent></Card>
            ) : (
              visibleBookings.map((b: any) => {
                const slot = b.ptm_slots;
                return (
                  <Card key={b.id}>
                    <CardContent className="p-3 sm:p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {b.students?.first_name} {b.students?.last_name}
                          </p>
                          {slot && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(slot.slot_date), "EEE, d MMM yyyy")} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                              {slot.location ? ` · ${slot.location}` : ""}
                            </p>
                          )}
                          {isAllSelected && <Badge variant="outline" className="text-[10px]">{branches.find((br) => br.id === b.branch_id)?.name ?? "Branch"}</Badge>}
                          {b.parent_notes && <p className="text-xs text-foreground/80 mt-1"><span className="font-medium">Parent:</span> {b.parent_notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {b.previous_slot_id && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                              Rescheduled
                            </Badge>
                          )}
                          <Badge variant="outline" className={STATUS_BADGE[b.status]}>{b.status}</Badge>
                        </div>
                      </div>
                      {b.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => respondBooking.mutate({ id: b.id, status: "confirmed" })}>Confirm</Button>
                          <Button size="sm" variant="outline" onClick={() => respondBooking.mutate({ id: b.id, status: "declined" })}>Decline</Button>
                        </div>
                      )}
                      {b.status === "confirmed" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => respondBooking.mutate({ id: b.id, status: "completed" })}>Mark completed</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
          )}
        </Tabs>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Publish PTM Slot</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Branch</Label>
                <Select
                  value={publishBranchId ?? ""}
                  onValueChange={(v) => setForm({ ...form, branch_id: v, class_id: "all" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Class</Label>
                <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })} disabled={!publishBranchId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes (whole branch)</SelectItem>
                    {visibleClasses.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5 col-span-3 sm:col-span-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={form.slot_date} onChange={(e) => setForm({ ...form, slot_date: e.target.value })} />
                </div>
                <div className="space-y-1.5 col-span-3 sm:col-span-1">
                  <Label className="text-xs">Start</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div className="space-y-1.5 col-span-3 sm:col-span-1">
                  <Label className="text-xs">End</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location (optional)</Label>
                <Input placeholder="e.g. Classroom A / Zoom link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes for parents (optional)</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
              <Button onClick={() => createSlot.mutate()} disabled={createSlot.isPending || !publishBranchId}>
                {createSlot.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Publish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Wrapper>
  );
}