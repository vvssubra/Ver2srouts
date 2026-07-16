import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CalendarCheck, FileText, History, Clock, MapPin, Loader2, BookOpenCheck, Sparkles, Inbox, CalendarClock, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { generatePtmReportPdf } from "@/lib/ptm-pdf";
import { useParentChildren } from "@/hooks/use-parent-children";
import { notifyUsers } from "@/lib/notify";

function downloadIcs(b: any) {
  const slot = b?.ptm_slots;
  if (!slot) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [sy, sm, sd] = slot.slot_date.split("-").map(Number);
  const [sh, smin] = slot.start_time.split(":").map(Number);
  const [eh, emin] = slot.end_time.split(":").map(Number);
  const startLocal = new Date(sy, sm - 1, sd, sh, smin);
  const endLocal = new Date(sy, sm - 1, sd, eh, emin);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const childName = `${b.students?.first_name ?? ""} ${b.students?.last_name ?? ""}`.trim();
  const summary = `Parent–Teacher Meeting${childName ? ` — ${childName}` : ""}`;
  const location = (slot.location || "").replace(/\n/g, " ");
  const description = (slot.notes || "").replace(/\n/g, " ");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sprouts//PTM//EN",
    "BEGIN:VEVENT",
    `UID:ptm-${b.id}@sprouts`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(startLocal)}`,
    `DTEND:${fmt(endLocal)}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : "",
    description ? `DESCRIPTION:${description}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ptm-${slot.slot_date}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Slot = {
  id: string;
  branch_id: string;
  class_id: string | null;
  teacher_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
  status: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  confirmed: "bg-accent/15 text-accent border-accent/30",
  declined: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  completed: "bg-primary/15 text-primary border-primary/30",
};

export default function ParentPTM() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("book");
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [parentNotes, setParentNotes] = useState("");
  const [rescheduleBooking, setRescheduleBooking] = useState<any | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Parent's approved children — shared cache key
  const { children, childIds: studentIds, classIds, branchIds } = useParentChildren();

  // Open slots
  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ["ptm-open-slots", branchIds, classIds],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      let query = (supabase.from("ptm_slots" as any).select("*") as any)
        .eq("status", "open")
        .gte("slot_date", today)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (branchIds.length) query = query.in("branch_id", branchIds);
      const { data } = await query;
      // Filter to slots matching child's class (or class-agnostic ones)
      return ((data ?? []) as Slot[]).filter(
        (s) => s.class_id === null || classIds.includes(s.class_id)
      );
    },
    enabled: !!user && children.length > 0,
    staleTime: 30 * 1000,
  });

  // Parent's bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ["my-ptm-bookings", user?.id],
    queryFn: async () => {
      const { data } = await (supabase
        .from("ptm_bookings" as any)
        .select("*, ptm_slots!ptm_bookings_slot_id_fkey(slot_date, start_time, end_time, location, notes, teacher_id), students(first_name, last_name)") as any)
        .eq("parent_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  // PTM reports for parent's children (only published ones — RLS enforces)
  const { data: reports = [] } = useQuery({
    queryKey: ["my-ptm-reports", studentIds.join(",")],
    queryFn: async () => {
      if (!studentIds.length) return [];
      const { data } = await supabase
        .from("ptm_reports")
        .select("*, students(first_name, last_name)")
        .in("student_id", studentIds)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: studentIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Past meetings (history)
  const { data: pastMeetings = [] } = useQuery({
    queryKey: ["my-ptm-meetings", studentIds.join(",")],
    queryFn: async () => {
      if (!studentIds.length) return [];
      const { data } = await (supabase
        .from("ptm_meetings" as any)
        .select("*, students(first_name, last_name)") as any)
        .in("student_id", studentIds)
        .order("meeting_date", { ascending: false });
      return (data ?? []) as any[];
    },
    enabled: studentIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!bookingSlot || !selectedStudent) throw new Error("Select a child");
      // A unique (slot_id, student_id) constraint exists regardless of
      // status, so a prior cancelled booking for the same slot+child blocks
      // a fresh insert. Reuse that row by flipping it back to pending.
      const { data: existing } = await (supabase.from("ptm_bookings" as any) as any)
        .select("id, status")
        .eq("slot_id", bookingSlot.id)
        .eq("student_id", selectedStudent)
        .maybeSingle();
      let inserted: { id: string } | null = null;
      if (existing?.id) {
        const { data: updated, error: updErr } = await (supabase.from("ptm_bookings" as any) as any)
          .update({
            parent_id: user!.id,
            branch_id: bookingSlot.branch_id,
            status: "pending",
            parent_notes: parentNotes || null,
            rescheduled_at: null,
            previous_slot_id: null,
          } as any)
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updErr) throw updErr;
        inserted = updated as { id: string };
      } else {
        const { data: created, error } = await (supabase.from("ptm_bookings" as any) as any).insert({
          slot_id: bookingSlot.id,
          student_id: selectedStudent,
          parent_id: user!.id,
          branch_id: bookingSlot.branch_id,
          status: "pending",
          parent_notes: parentNotes || null,
        } as any).select("id").single();
        if (error) throw error;
        inserted = created as { id: string };
      }
      // Atomically claim the slot so other parents cannot double-book the
      // same slot for the same class. Guarded by status='open' so a race
      // between two parents only lets the first booking win at the slot
      // level (the booking row remains for audit).
      await (supabase.from("ptm_slots" as any) as any)
        .update({ status: "booked" })
        .eq("id", bookingSlot.id)
        .eq("status", "open");
      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-ptm-bookings"] });
      qc.invalidateQueries({ queryKey: ["ptm-open-slots"] });
      // NOTE: confirmation email is intentionally NOT sent here. It is sent
      // only after a teacher/admin confirms the booking from PtmSlots.
      setBookingSlot(null);
      setSelectedStudent(null);
      setParentNotes("");
      toast({ title: "Request sent ✅", description: "Awaiting teacher confirmation. You'll receive an email once it's confirmed." });
    },
    onError: (e: any) => toast({ title: "Could not book", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      // Read slot + child info first so we can release the slot and notify
      // the teacher in the same flow.
      const { data: bRow } = await (supabase.from("ptm_bookings" as any) as any)
        .select("id, slot_id, student_id, ptm_slots:ptm_slots!ptm_bookings_slot_id_fkey(teacher_id, slot_date, start_time), students(first_name, last_name)")
        .eq("id", bookingId)
        .maybeSingle();
      const { error } = await (supabase.from("ptm_bookings" as any) as any)
        .update({ status: "cancelled" })
        .eq("id", bookingId);
      if (error) throw error;

      // Free the slot so other parents can rebook it. Guard on status='booked'
      // so we never re-open a slot the teacher has already cancelled/completed.
      if (bRow?.slot_id) {
        await (supabase.from("ptm_slots" as any) as any)
          .update({ status: "open" })
          .eq("id", bRow.slot_id)
          .eq("status", "booked");
      }

      // Best-effort in-app notification to the teacher.
      const teacherId = (bRow as any)?.ptm_slots?.teacher_id;
      if (teacherId) {
        const childName = `${(bRow as any)?.students?.first_name ?? ""} ${(bRow as any)?.students?.last_name ?? ""}`.trim() || "their child";
        const when = (bRow as any)?.ptm_slots?.slot_date
          ? format(new Date((bRow as any).ptm_slots.slot_date), "d MMM")
          : "";
        notifyUsers(
          [teacherId],
          "PTM cancelled by parent",
          `${childName}'s parent cancelled the PTM${when ? ` on ${when}` : ""}.`,
          "ptm",
          bookingId,
          "/staff/ptm-slots",
          `ptm-cancel-${bookingId}`,
        ).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-ptm-bookings"] });
      qc.invalidateQueries({ queryKey: ["ptm-open-slots"] });
      qc.invalidateQueries({ queryKey: ["staff-ptm-slots"] });
      qc.invalidateQueries({ queryKey: ["staff-ptm-bookings"] });
      toast({ title: "Booking cancelled" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ bookingId, newSlot, oldSlotId }: { bookingId: string; newSlot: Slot; oldSlotId: string }) => {
      // 0a. Same-slot guard — nothing to do, don't touch the DB.
      if (newSlot.id === oldSlotId) {
        throw new Error("You already have this slot booked.");
      }
      // 0. The (slot_id, student_id) unique constraint blocks repointing if a
      // previous cancelled booking exists for the same child on the new slot.
      // Remove any such stale cancelled rows for this student before we move.
      const studentId = (rescheduleBooking as any)?.student_id;
      if (studentId) {
        await (supabase.from("ptm_bookings" as any) as any)
          .delete()
          .eq("slot_id", newSlot.id)
          .eq("student_id", studentId)
          .eq("status", "cancelled")
          .neq("id", bookingId);
      }

      // 1. Atomically claim the NEW slot so two parents can't race onto it.
      const { data: claimed } = await (supabase.from("ptm_slots" as any) as any)
        .update({ status: "booked" })
        .eq("id", newSlot.id)
        .eq("status", "open")
        .select("id");
      if (!claimed || (claimed as any[]).length === 0) {
        throw new Error("That slot was just taken. Please pick another.");
      }

      // 2. Repoint the booking. If this fails, roll the new slot back to open.
      const { error } = await (supabase.from("ptm_bookings" as any) as any)
        .update({
          slot_id: newSlot.id,
          previous_slot_id: oldSlotId,
          rescheduled_at: new Date().toISOString(),
          status: "pending",
        })
        .eq("id", bookingId);
      if (error) {
        await (supabase.from("ptm_slots" as any) as any)
          .update({ status: "open" })
          .eq("id", newSlot.id)
          .eq("status", "booked");
        throw error;
      }

      // 3. Release the OLD slot so other parents can grab it.
      // We unconditionally flip it to open — at this point we have repointed
      // the booking off this slot, so it should not stay marked booked even
      // if its status drifted (e.g. teacher-side change).
      if (oldSlotId && oldSlotId !== newSlot.id) {
        await (supabase.from("ptm_slots" as any) as any)
          .update({ status: "open" })
          .eq("id", oldSlotId);
      }

      // 4. Notify the teacher (best-effort, never throws).
      const teacherId = (rescheduleBooking as any)?.ptm_slots?.teacher_id;
      const childName = `${(rescheduleBooking as any)?.students?.first_name ?? ""} ${(rescheduleBooking as any)?.students?.last_name ?? ""}`.trim() || "their child";
      const when = format(new Date(newSlot.slot_date), "d MMM");
      if (teacherId) {
        notifyUsers(
          [teacherId],
          "PTM rescheduled by parent",
          `${childName}'s parent moved the PTM to ${when}. Please reconfirm.`,
          "ptm",
          bookingId,
          "/staff/ptm-slots",
          `ptm-reschedule-${bookingId}`,
        ).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-ptm-bookings"] });
      qc.invalidateQueries({ queryKey: ["ptm-open-slots"] });
      qc.invalidateQueries({ queryKey: ["staff-ptm-slots"] });
      qc.invalidateQueries({ queryKey: ["staff-ptm-bookings"] });
      setRescheduleBooking(null);
      toast({ title: "Reschedule requested ✅", description: "The teacher will reconfirm your new slot." });
    },
    onError: (e: any) => toast({ title: "Could not reschedule", description: e.message, variant: "destructive" }),
  });

  const bookedSlotIds = new Set(
    bookings.filter((b: any) => ["pending", "confirmed"].includes(b.status)).map((b: any) => b.slot_id)
  );

  // Auto-tab: if the parent already has upcoming bookings, default to
  // "My Meetings" instead of the Book list. Only runs once per mount.
  const upcomingCount = (bookings as any[]).filter((b) =>
    ["pending", "confirmed"].includes(b.status),
  ).length;
  const [autoTabbed, setAutoTabbed] = useState(false);
  useEffect(() => {
    if (!autoTabbed && upcomingCount > 0) {
      setAutoTabbed(true);
      setTab("mine");
    }
  }, [autoTabbed, upcomingCount]);

  // Group open slots by date for a scannable mobile list.
  const slotsByDate = useMemo(() => {
    const groups: Record<string, Slot[]> = {};
    (slots as Slot[]).forEach((s) => {
      (groups[s.slot_date] ||= []).push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Parent–Teacher Meetings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Book a slot, view your upcoming meetings and read past PTM reports.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="book" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <CalendarCheck className="h-3.5 w-3.5" /> Book
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <Inbox className="h-3.5 w-3.5" /> My Meetings{upcomingCount > 0 ? ` (${upcomingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <FileText className="h-3.5 w-3.5" /> Reports
            </TabsTrigger>
          </TabsList>

          {/* BOOK */}
          <TabsContent value="book" className="space-y-3 mt-4">
            {loadingSlots ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Loading slots…</CardContent></Card>
            ) : slots.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center space-y-2">
                  <CalendarCheck className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium">No open PTM slots right now</p>
                  <p className="text-xs text-muted-foreground">
                    Your child's teacher will publish PTM slots soon. You'll be notified when booking opens.
                  </p>
                  {upcomingCount > 0 && (
                    <p className="text-xs text-foreground/70 pt-1">
                      You already have an upcoming PTM meeting. Manage it under{" "}
                      <button
                        type="button"
                        className="underline font-medium"
                        onClick={() => setTab("mine")}
                      >
                        My Meetings
                      </button>
                      .
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {slotsByDate.map(([date, dateSlots]) => (
                  <div key={date} className="space-y-2">
                    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1.5 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[11px] font-semibold">
                        {format(new Date(date), "EEE, d MMM yyyy")}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {dateSlots.length} {dateSlots.length === 1 ? "slot" : "slots"}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {dateSlots.map((slot: Slot) => {
                      const taken = bookedSlotIds.has(slot.id);
                      return (
                    <Card key={slot.id} className={taken ? "opacity-60" : "hover:shadow-md transition-shadow"}>
                      <CardContent className="p-3 sm:p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span>
                            </div>
                            {slot.location && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{slot.location}</span>
                              </div>
                            )}
                            {slot.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{slot.notes}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            disabled={taken}
                            onClick={() => {
                              setBookingSlot(slot);
                              setSelectedStudent(children[0]?.id ?? null);
                            }}
                          >
                            {taken ? "Booked" : "Book"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* MY MEETINGS */}
          <TabsContent value="mine" className="space-y-3 mt-4">
            {(() => {
              const upcoming = (bookings as any[]).filter((b) =>
                ["pending", "confirmed"].includes(b.status),
              );
              const renderBookingCard = (b: any) => {
                const slot = b.ptm_slots;
                return (
                  <Card key={b.id}>
                    <CardContent className="p-3 sm:p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {b.students?.first_name} {b.students?.last_name}
                          </p>
                          {slot && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(slot.slot_date), "EEE, d MMM yyyy")} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                            </p>
                          )}
                          {slot?.location && (
                            <p className="text-xs text-muted-foreground">📍 {slot.location}</p>
                          )}
                          {b.parent_notes && (
                            <p className="text-xs text-foreground/70 mt-1"><span className="font-medium">Your note:</span> {b.parent_notes}</p>
                          )}
                          {b.staff_notes && (
                            <p className="text-xs text-foreground/70 mt-1"><span className="font-medium">From teacher:</span> {b.staff_notes}</p>
                          )}
                          {b.status === "pending" && (
                            <p className="text-[11px] mt-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                              Awaiting teacher confirmation — you'll be emailed once confirmed.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant="outline" className={STATUS_BADGE[b.status]}>{b.status}</Badge>
                          {b.status === "confirmed" && slot && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => downloadIcs(b)}
                            >
                              <CalendarClock className="h-3 w-3 mr-1" /> Add to calendar
                            </Button>
                          )}
                          {["pending", "confirmed"].includes(b.status) && (
                            <div className="flex flex-col gap-1 items-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs"
                                onClick={() => setRescheduleBooking(b)}
                              >
                                <CalendarClock className="h-3 w-3 mr-1" /> Reschedule
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-muted-foreground"
                                onClick={() => cancelMutation.mutate(b.id)}
                                disabled={cancelMutation.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              };
              if (upcoming.length === 0) {
                return (
                  <Card>
                    <CardContent className="py-10 text-center space-y-2">
                      <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <p className="text-sm font-medium">No active bookings</p>
                      <p className="text-xs text-muted-foreground">Your upcoming PTM requests and confirmed meetings will appear here.</p>
                    </CardContent>
                  </Card>
                );
              }
              return (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upcoming</h3>
                    {upcoming.map(renderBookingCard)}
                  </div>
                </div>
              );
            })()}
            {(() => {
              // History = meetings that actually happened. Hide stale
              // "scheduled" rows left behind by cancelled/rescheduled
              // bookings so the list doesn't clutter over time.
              const completed = (pastMeetings as any[]).filter(
                (m) => m.status === "completed",
              );
              if (completed.length === 0) return null;
              const visible = showAllHistory ? completed : completed.slice(0, 5);
              return (
                <div className="pt-4 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <History className="h-3 w-3" /> Meeting History
                    <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
                      ({completed.length})
                    </span>
                  </h3>
                  {visible.map((m: any) => (
                    <Card key={m.id} className="border-dashed">
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {m.students?.first_name} {m.students?.last_name}
                          </p>
                          <Badge variant="outline" className="text-[10px] capitalize">{m.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(m.meeting_date), "EEE, d MMM yyyy")}
                          {m.meeting_time ? ` · ${m.meeting_time.slice(0, 5)}` : ""}
                        </p>
                        {m.discussion_notes && (
                          <p className="text-xs text-foreground/70">{m.discussion_notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {completed.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => setShowAllHistory((v) => !v)}
                    >
                      {showAllHistory ? "Show less" : `Show all ${completed.length}`}
                    </Button>
                  )}
                </div>
              );
            })()}
          </TabsContent>

          {/* REPORTS */}
          <TabsContent value="reports" className="space-y-3 mt-4">
            {reports.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center space-y-2">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium">No reports yet</p>
                  <p className="text-xs text-muted-foreground">Published PTM reports for your child will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              reports.map((r: any) => <ReportCard key={r.id} report={r} />)
            )}
          </TabsContent>
        </Tabs>

        {/* Booking dialog */}
        <Dialog open={!!bookingSlot} onOpenChange={(o) => !o && setBookingSlot(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Booking</DialogTitle>
              <DialogDescription>
                {bookingSlot && (
                  <>
                    {format(new Date(bookingSlot.slot_date), "EEE, d MMM yyyy")} at {bookingSlot.start_time.slice(0, 5)}
                    {bookingSlot.location ? ` · ${bookingSlot.location}` : ""}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {children.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">For which child?</p>
                  <div className="flex flex-wrap gap-2">
                    {children.map((c: any) => (
                      <Badge
                        key={c.id}
                        variant={selectedStudent === c.id ? "default" : "outline"}
                        className="cursor-pointer text-xs px-3 py-1"
                        onClick={() => setSelectedStudent(c.id)}
                      >
                        {c.first_name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Anything you'd like to discuss? (optional)</p>
                <Textarea
                  placeholder="e.g. Concerns about reading progress, behaviour at home…"
                  value={parentNotes}
                  onChange={(e) => setParentNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBookingSlot(null)}>Cancel</Button>
              <Button
                onClick={() => bookMutation.mutate()}
                disabled={!selectedStudent || bookMutation.isPending}
              >
                {bookMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Send Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reschedule dialog */}
        <Dialog open={!!rescheduleBooking} onOpenChange={(o) => !o && setRescheduleBooking(null)}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Reschedule PTM</DialogTitle>
              <DialogDescription>
                Pick a new slot. The teacher will need to reconfirm.
              </DialogDescription>
            </DialogHeader>
            {rescheduleBooking?.ptm_slots && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Currently:</span>{" "}
                {format(new Date(rescheduleBooking.ptm_slots.slot_date), "EEE, d MMM yyyy")} ·{" "}
                {rescheduleBooking.ptm_slots.start_time.slice(0, 5)}–{rescheduleBooking.ptm_slots.end_time.slice(0, 5)}
              </div>
            )}
            <div className="space-y-2">
              {(() => {
                const childClassId = rescheduleBooking
                  ? children.find((c: any) => c.id === rescheduleBooking.student_id)?.class_id
                  : null;
                const opts = (slots as Slot[]).filter(
                  (s) =>
                    s.id !== rescheduleBooking?.slot_id &&
                    !bookedSlotIds.has(s.id) &&
                    (s.class_id === null || s.class_id === childClassId)
                );
                if (opts.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No alternative slots available right now.
                    </p>
                  );
                }
                return opts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      rescheduleMutation.mutate({
                        bookingId: rescheduleBooking.id,
                        newSlot: s,
                        oldSlotId: rescheduleBooking.slot_id,
                      })
                    }
                    disabled={rescheduleMutation.isPending}
                    className="w-full text-left border rounded-md p-2.5 hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-medium">
                      {format(new Date(s.slot_date), "EEE, d MMM yyyy")} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </p>
                    {s.location && <p className="text-xs text-muted-foreground">📍 {s.location}</p>}
                  </button>
                ));
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleBooking(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function ReportCard({ report }: { report: any }) {
  const [open, setOpen] = useState(false);
  const c = report.generated_content || {};
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-primary" />
            {report.students?.first_name} {report.students?.last_name}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{report.term_name}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{format(new Date(report.created_at), "d MMM yyyy")}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {c.overallNarrative && (
          <p className="text-sm text-foreground/85 whitespace-pre-wrap">
            {open ? c.overallNarrative : c.overallNarrative.slice(0, 220) + (c.overallNarrative.length > 220 ? "…" : "")}
          </p>
        )}
        {open && (
          <div className="space-y-3 pt-2">
            {Array.isArray(c.strengthsCelebrations) && c.strengthsCelebrations.length > 0 && (
              <Section icon={<Sparkles className="h-3.5 w-3.5 text-accent" />} title="Strengths">
                <ul className="list-disc pl-5 space-y-0.5 text-sm">
                  {c.strengthsCelebrations.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </Section>
            )}
            {Array.isArray(c.areasForSupport) && c.areasForSupport.length > 0 && (
              <Section title="Areas for Support">
                <div className="space-y-2">
                  {c.areasForSupport.map((a: any, i: number) => (
                    <div key={i} className="text-sm border-l-2 border-primary/30 pl-2">
                      <p className="font-medium">{a.area}</p>
                      <p className="text-foreground/80">{a.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">💡 {a.suggestion}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {Array.isArray(c.atHomeActivities) && c.atHomeActivities.length > 0 && (
              <Section title="Try At Home">
                <div className="space-y-2">
                  {c.atHomeActivities.map((a: any, i: number) => (
                    <div key={i} className="text-sm bg-muted/40 rounded p-2">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-foreground/80 text-xs">{a.description}</p>
                      {a.materials && <p className="text-xs text-muted-foreground mt-0.5">Needs: {a.materials}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Read full report"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => generatePtmReportPdf(report)}
          >
            <Download className="h-3 w-3 mr-1" /> PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
        {icon}{title}
      </p>
      {children}
    </div>
  );
}