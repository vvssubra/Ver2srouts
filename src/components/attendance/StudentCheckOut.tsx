import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, LogOut, Thermometer, AlertTriangle, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Mood = "happy" | "calm" | "upset" | "tired" | "anxious";
type HealthStatus = "healthy" | "unwell" | "fever" | "needs_monitoring";

const moodOptions: { value: Mood; emoji: string; label: string }[] = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "calm", emoji: "😐", label: "Calm" },
  { value: "upset", emoji: "😢", label: "Upset" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "anxious", emoji: "😰", label: "Anxious" },
];

const healthOptions: { value: HealthStatus; label: string; className: string }[] = [
  { value: "healthy", label: "Healthy", className: "text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400" },
  { value: "unwell", label: "Unwell", className: "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400" },
  { value: "fever", label: "Fever", className: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400" },
  { value: "needs_monitoring", label: "Monitor", className: "text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400" },
];

interface CheckOutDraft {
  check_out_time: string; // datetime-local string
  picked_up_by: string;
  picked_up_by_relation: string;
  departure_temperature: string;
  departure_mood: Mood;
  departure_health_status: HealthStatus;
  departure_health_notes: string;
  departure_body_marks: string;
  medication_handover: boolean;
  medication_handover_notes: string;
  departure_notes: string;
  departure_photo_url: string;
  photoFile: File | null;
  expanded: boolean;
}

const emptyDraft: CheckOutDraft = {
  check_out_time: "",
  picked_up_by: "",
  picked_up_by_relation: "",
  departure_temperature: "",
  departure_mood: "happy",
  departure_health_status: "healthy",
  departure_health_notes: "",
  departure_body_marks: "",
  medication_handover: false,
  medication_handover_notes: "",
  departure_notes: "",
  departure_photo_url: "",
  photoFile: null,
  expanded: false,
};

interface Props {
  branchId: string;
  userId: string;
  selectedDate: Date;
  classStudents: any[]; // already filtered by class + search in parent
  existingAttendance: any[]; // rows for branch + date
}

export default function StudentCheckOut({ branchId, userId, selectedDate, classStudents, existingAttendance }: Props) {
  const queryClient = useQueryClient();
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const photoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [drafts, setDrafts] = useState<Record<string, CheckOutDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");

  // Only students with an attendance row marked present or late are eligible to check out
  const eligible = useMemo(() => {
    return classStudents
      .map((s) => {
        const row = existingAttendance.find((a: any) => a.student_id === s.id);
        return { student: s, row };
      })
      .filter(({ row }) => row && (row.status === "present" || row.status === "late"));
  }, [classStudents, existingAttendance]);

  const visible = useMemo(() => {
    return eligible.filter(({ row }) => {
      const done = !!row?.check_out_time;
      if (filter === "pending") return !done;
      if (filter === "done") return done;
      return true;
    });
  }, [eligible, filter]);

  const getDraft = (studentId: string, row: any): CheckOutDraft => {
    if (drafts[studentId]) return drafts[studentId];
    if (row?.check_out_time) {
      // Prefill from saved record so users can edit
      const dt = new Date(row.check_out_time);
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      return {
        check_out_time: local,
        picked_up_by: row.picked_up_by ?? "",
        picked_up_by_relation: row.picked_up_by_relation ?? "",
        departure_temperature: row.departure_temperature?.toString() ?? "",
        departure_mood: (row.departure_mood ?? "happy") as Mood,
        departure_health_status: (row.departure_health_status ?? "healthy") as HealthStatus,
        departure_health_notes: row.departure_health_notes ?? "",
        departure_body_marks: row.departure_body_marks ?? "",
        medication_handover: !!row.medication_handover,
        medication_handover_notes: row.medication_handover_notes ?? "",
        departure_notes: row.departure_notes ?? "",
        departure_photo_url: row.departure_photo_url ?? "",
        photoFile: null,
        expanded: false,
      };
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return { ...emptyDraft, check_out_time: local };
  };

  const updateDraft = (studentId: string, row: any, updates: Partial<CheckOutDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...getDraft(studentId, row), ...updates },
    }));
  };

  const checkOut = async (studentId: string, row: any) => {
    if (!row?.id) return;
    setSavingId(studentId);
    try {
      const d = getDraft(studentId, row);
      if (!d.picked_up_by.trim()) {
        throw new Error("Please record who is picking up the child.");
      }
      if (!d.check_out_time) {
        throw new Error("Departure time is required.");
      }

      let photoUrl = d.departure_photo_url;
      if (d.photoFile) {
        const ext = d.photoFile.name.split(".").pop() || "jpg";
        const path = `${userId}/attendance/${dateStr}/${studentId}-checkout-${Date.now()}.${ext}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        photoUrl = await uploadAndSign("observation-evidence", path, d.photoFile, { upsert: true });
      }

      const checkOutIso = new Date(d.check_out_time).toISOString();
      const update = {
        check_out_time: checkOutIso,
        picked_up_by: d.picked_up_by.trim(),
        picked_up_by_relation: d.picked_up_by_relation.trim() || null,
        departure_temperature: d.departure_temperature ? parseFloat(d.departure_temperature) : null,
        departure_mood: d.departure_mood,
        departure_health_status: d.departure_health_status,
        departure_health_notes: d.departure_health_notes || null,
        departure_body_marks: d.departure_body_marks || null,
        medication_handover: d.medication_handover,
        medication_handover_notes: d.medication_handover ? (d.medication_handover_notes || null) : null,
        departure_notes: d.departure_notes || null,
        departure_photo_url: photoUrl || null,
        checked_out_by: userId,
      };

      const { error } = await supabase
        .from("attendance")
        .update(update as any)
        .eq("id", row.id);
      if (error) throw error;

      // Notify parents
      try {
        const student = classStudents.find((s) => s.id === studentId);
        const { data: parentLinks } = await supabase
          .from("parent_students")
          .select("parent_id")
          .eq("student_id", studentId)
          .eq("status", "approved");
        if (parentLinks?.length) {
          const notifs = parentLinks.map((pl: any) => ({
            user_id: pl.parent_id,
            title: "👋 Checked Out",
            message: `${student?.first_name || "Your child"} was picked up by ${update.picked_up_by} at ${format(new Date(checkOutIso), "p")}.`,
            type: "attendance",
            action_url: "/child",
            group_key: `checkout:${studentId}:${dateStr}`,
          }));
          await supabase.from("notifications").insert(notifs as any);
        }
      } catch (e) {
        console.error("checkout notification error", e);
      }

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["attendance", branchId, dateStr] });
      toast({ title: "Checked out ✅", description: `${classStudents.find((s) => s.id === studentId)?.first_name ?? "Student"} marked as departed.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const pendingCount = eligible.filter(({ row }) => !row?.check_out_time).length;
  const doneCount = eligible.length - pendingCount;

  return (
    <div className="space-y-4">
      {eligible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
            No students are eligible for check-out. Students must be checked in (Present or Late) for the selected date first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={filter === "pending" ? "default" : "outline"} onClick={() => setFilter("pending")}>
              Pending ({pendingCount})
            </Button>
            <Button size="sm" variant={filter === "done" ? "default" : "outline"} onClick={() => setFilter("done")}>
              Checked Out ({doneCount})
            </Button>
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              All ({eligible.length})
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              {visible.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No students in this view.</p>
              ) : (
                <div className="space-y-3">
                  {visible.map(({ student, row }) => {
                    const d = getDraft(student.id, row);
                    const isDone = !!row.check_out_time;
                    return (
                      <div
                        key={student.id}
                        className={cn(
                          "rounded-xl border p-4 transition-all",
                          isDone ? "border-green-300 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10" : "border-border",
                        )}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                              {student.first_name?.[0]}{student.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {student.first_name} {student.last_name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {student.class_name || "Unassigned"}
                                {isDone && (
                                  <span className="ml-2 text-green-600">
                                    ✓ Out at {format(new Date(row.check_out_time), "p")} · {row.picked_up_by}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                            {isDone && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                Departed
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground h-9 px-2"
                              onClick={() => updateDraft(student.id, row, { expanded: !d.expanded })}
                            >
                              {d.expanded ? "▲" : "▼"}
                            </Button>
                          </div>
                        </div>

                        {d.expanded && (
                          <div className="mt-4 space-y-4 pt-3 border-t">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs">Departure Time</Label>
                                <Input
                                  type="datetime-local"
                                  className="mt-1 h-9 text-sm"
                                  value={d.check_out_time}
                                  onChange={(e) => updateDraft(student.id, row, { check_out_time: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Picked Up By <span className="text-destructive">*</span></Label>
                                <Input
                                  className="mt-1 h-9 text-sm"
                                  placeholder="Full name"
                                  value={d.picked_up_by}
                                  onChange={(e) => updateDraft(student.id, row, { picked_up_by: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Relation</Label>
                                <Select
                                  value={d.picked_up_by_relation || "__none__"}
                                  onValueChange={(v) => updateDraft(student.id, row, { picked_up_by_relation: v === "__none__" ? "" : v })}
                                >
                                  <SelectTrigger className="mt-1 h-9 text-sm">
                                    <SelectValue placeholder="Select relation" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">—</SelectItem>
                                    <SelectItem value="mother">Mother</SelectItem>
                                    <SelectItem value="father">Father</SelectItem>
                                    <SelectItem value="guardian">Guardian</SelectItem>
                                    <SelectItem value="grandparent">Grandparent</SelectItem>
                                    <SelectItem value="sibling">Sibling</SelectItem>
                                    <SelectItem value="authorized_adult">Authorized Adult</SelectItem>
                                    <SelectItem value="driver">Driver</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs flex items-center gap-1">
                                  <Thermometer className="h-3 w-3" /> Temperature (°C)
                                </Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  placeholder="36.5"
                                  className="mt-1 h-8 text-sm"
                                  value={d.departure_temperature}
                                  onChange={(e) => updateDraft(student.id, row, { departure_temperature: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Health Status</Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {healthOptions.map((h) => (
                                    <Badge
                                      key={h.value}
                                      variant="outline"
                                      className={cn(
                                        "cursor-pointer text-xs transition-all",
                                        d.departure_health_status === h.value ? h.className + " ring-1 ring-offset-1" : "opacity-50",
                                      )}
                                      onClick={() => updateDraft(student.id, row, { departure_health_status: h.value })}
                                    >
                                      {h.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs">End-of-Day Mood</Label>
                                <div className="flex gap-1 mt-1">
                                  {moodOptions.map((m) => (
                                    <button
                                      key={m.value}
                                      type="button"
                                      className={cn(
                                        "text-lg p-1 rounded transition-all",
                                        d.departure_mood === m.value ? "bg-primary/20 scale-110" : "opacity-40 hover:opacity-70",
                                      )}
                                      title={m.label}
                                      onClick={() => updateDraft(student.id, row, { departure_mood: m.value })}
                                    >
                                      {m.emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Departure Health Notes</Label>
                                <Textarea
                                  className="mt-1 text-sm h-16"
                                  placeholder="Any new symptoms, fatigue, etc."
                                  value={d.departure_health_notes}
                                  onChange={(e) => updateDraft(student.id, row, { departure_health_notes: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">New Body Marks / Injuries</Label>
                                <Textarea
                                  className="mt-1 text-sm h-16"
                                  placeholder="Any bruises or marks noticed during the day..."
                                  value={d.departure_body_marks}
                                  onChange={(e) => updateDraft(student.id, row, { departure_body_marks: e.target.value })}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={d.medication_handover}
                                  onCheckedChange={(v) => updateDraft(student.id, row, { medication_handover: v })}
                                />
                                <Label className="text-xs">Medication Returned / Handover Confirmed</Label>
                              </div>
                              {d.medication_handover && (
                                <Input
                                  placeholder="Handover details..."
                                  className="flex-1 min-w-[200px] h-8 text-sm"
                                  value={d.medication_handover_notes}
                                  onChange={(e) => updateDraft(student.id, row, { medication_handover_notes: e.target.value })}
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div>
                                <Label className="text-xs flex items-center gap-1">
                                  <Camera className="h-3 w-3" /> Departure Photo
                                </Label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  ref={(el) => { photoRefs.current[student.id] = el; }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) updateDraft(student.id, row, { photoFile: file });
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-1 gap-1 text-xs"
                                  onClick={() => photoRefs.current[student.id]?.click()}
                                >
                                  <Camera className="h-3 w-3" />
                                  {d.photoFile ? "Replace Photo" : d.departure_photo_url ? "Captured ✓" : "Take Photo"}
                                </Button>
                              </div>
                              {(d.departure_photo_url || d.photoFile) && (
                                <img
                                  src={d.photoFile ? URL.createObjectURL(d.photoFile) : d.departure_photo_url}
                                  alt="Departure"
                                  className="h-12 w-12 rounded-lg object-cover border"
                                />
                              )}
                            </div>

                            <div>
                              <Label className="text-xs">Pickup / Departure Notes</Label>
                              <Textarea
                                className="mt-1 text-sm h-16"
                                placeholder="Items sent home, incidents, handover messages..."
                                value={d.departure_notes}
                                onChange={(e) => updateDraft(student.id, row, { departure_notes: e.target.value })}
                              />
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => checkOut(student.id, row)}
                                disabled={savingId === student.id}
                              >
                                <LogOut className="mr-1.5 h-4 w-4" />
                                {savingId === student.id ? "Saving..." : isDone ? "Update Check-Out" : "Check Out Student"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}