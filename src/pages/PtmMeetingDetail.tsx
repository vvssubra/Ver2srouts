import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, Save, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

interface PtmMeetingDetailProps { embedded?: boolean }
export default function PtmMeetingDetail({ embedded = false }: PtmMeetingDetailProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeBranchIds: branchIds, selectedBranchId } = useGlobalBranch();
  const defaultBranchId = selectedBranchId !== "all" ? selectedBranchId : branchIds[0];
  // Class-scope: a teacher only sees meetings/students from classes they are assigned to.
  const { teacherClassIds, isTeacher } = useTeacherClasses(defaultBranchId);
  const teacherClassKey = (teacherClassIds ?? []).join(",");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState<any>({ student_id: "", meeting_date: "", meeting_time: "", parent_attendee_names: "", discussion_notes: "" });
  const [actionForm, setActionForm] = useState({ action_text: "", action_owner: "teacher", due_date: "" });
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");

  const { data: students } = useQuery({
    queryKey: ["students-for-meetings", branchIds, isTeacher, teacherClassKey],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, first_name, last_name, branch_id, class_id")
        .in("branch_id", branchIds)
        .eq("is_active", true)
        .order("first_name");
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        q = q.in("class_id", teacherClassIds);
      }
      const { data } = await q;
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const { data: meetings, isLoading } = useQuery({
    queryKey: ["ptm-meetings", branchIds, isTeacher, teacherClassKey],
    queryFn: async () => {
      let q = supabase
        .from("ptm_meetings")
        .select("*")
        .in("branch_id", branchIds)
        .order("meeting_date", { ascending: false });
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        // ptm_meetings.class_id may be null for ad-hoc meetings → still show them so
        // teachers don't lose visibility on legacy rows.
        q = q.or(
          `class_id.in.(${teacherClassIds.join(",")}),class_id.is.null`,
        );
      }
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: branchIds.length > 0,
  });

  const { data: actionItems } = useQuery({
    queryKey: ["ptm-action-items", selectedMeeting],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_action_items").select("*").eq("ptm_meeting_id", selectedMeeting!).order("created_at");
      return (data ?? []) as any[];
    },
    enabled: !!selectedMeeting,
  });

  const createMeetingMutation = useMutation({
    mutationFn: async () => {
      const student = students?.find((s: any) => s.id === form.student_id);
      const branchId = student?.branch_id || defaultBranchId;
      const { error } = await supabase.from("ptm_meetings").insert({
        student_id: form.student_id,
        branch_id: branchId,
        meeting_date: form.meeting_date,
        meeting_time: form.meeting_time || null,
        teacher_id: user?.id,
        parent_attendee_names: form.parent_attendee_names || null,
        discussion_notes: form.discussion_notes || null,
        status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-meetings"] });
      setShowCreateDialog(false);
      setForm({ student_id: "", meeting_date: "", meeting_time: "", parent_attendee_names: "", discussion_notes: "" });
      toast({ title: "Meeting Created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMeetingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await (supabase.from("ptm_meetings").update(updates as any) as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-meetings"] });
      toast({ title: "Meeting Updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (id: string) => {
      // Detach any linked booking first so the FK doesn't block deletion.
      await (supabase.from("ptm_bookings" as any) as any)
        .update({ ptm_meeting_id: null })
        .eq("ptm_meeting_id", id);
      const { error } = await (supabase.from("ptm_meetings") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-meetings"] });
      setSelectedMeeting(null);
      toast({ title: "Meeting deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addActionMutation = useMutation({
    mutationFn: async () => {
      const meeting = meetings?.find((m: any) => m.id === selectedMeeting);
      const { error } = await supabase.from("ptm_action_items").insert({
        ptm_meeting_id: selectedMeeting,
        student_id: meeting?.student_id,
        branch_id: meeting?.branch_id || defaultBranchId,
        action_owner: actionForm.action_owner,
        action_text: actionForm.action_text,
        due_date: actionForm.due_date || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-action-items"] });
      setActionForm({ action_text: "", action_owner: "teacher", due_date: "" });
      toast({ title: "Action Item Added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleActionStatus = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "pending" ? "completed" : "pending";
      const { error } = await (supabase.from("ptm_action_items").update({ status: newStatus }) as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ptm-action-items"] }),
  });

  const getStudentName = (id: string) => {
    const s = students?.find((s: any) => s.id === id);
    return s ? `${s.first_name} ${s.last_name}` : "—";
  };

  const activeMeeting = meetings?.find((m: any) => m.id === selectedMeeting);

  useEffect(() => {
    setNotesDraft(activeMeeting?.discussion_notes || "");
  }, [selectedMeeting, activeMeeting?.discussion_notes]);

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>;

  return (
    <Wrapper>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            {!embedded && (
              <>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-primary" />
                  PTM Meetings
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Schedule and manage parent-teacher meetings</p>
              </>
            )}
          </div>
          <Button onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-1" />New Meeting</Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">All Meetings</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {meetings?.map((m: any) => (
                <div key={m.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedMeeting === m.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => setSelectedMeeting(m.id)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{getStudentName(m.student_id)}</span>
                    <Badge variant="outline" className={
                      m.status === "completed" ? "bg-accent/15 text-accent border-accent/30" : "bg-primary/15 text-primary border-primary/30"
                    }>{m.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" /> {m.meeting_date}
                    {m.meeting_time && <><Clock className="h-3 w-3 ml-2" /> {m.meeting_time}</>}
                  </div>
                </div>
              ))}
              {meetings?.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No meetings scheduled yet.</p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {activeMeeting ? (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Meeting Details</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Student:</span> <span className="font-medium">{getStudentName(activeMeeting.student_id)}</span></div>
                      <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{activeMeeting.meeting_date}</span></div>
                      <div><span className="text-muted-foreground">Parents:</span> <span className="font-medium">{activeMeeting.parent_attendee_names || "—"}</span></div>
                      <div><span className="text-muted-foreground">Follow-up:</span> <span className="font-medium">{activeMeeting.followup_date || "—"}</span></div>
                    </div>
                    <div>
                      <Label className="text-sm">Discussion Notes</Label>
                      <Textarea
                        value={notesDraft}
                        onChange={e => setNotesDraft(e.target.value)}
                        placeholder="Add meeting notes..."
                        className="mt-1 min-h-[80px]"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Button size="sm" onClick={() => updateMeetingMutation.mutate({ id: activeMeeting.id, updates: { discussion_notes: notesDraft || activeMeeting.discussion_notes } })}>
                          <Save className="h-3.5 w-3.5 mr-1" />Save notes
                        </Button>
                        {activeMeeting.status !== "completed" && (
                          <Button size="sm" variant="secondary" onClick={() => updateMeetingMutation.mutate({ id: activeMeeting.id, updates: { discussion_notes: notesDraft || activeMeeting.discussion_notes, status: "completed" } })}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark completed
                          </Button>
                        )}
                        {activeMeeting.status !== "cancelled" && activeMeeting.status !== "completed" && (
                          <Button size="sm" variant="outline" onClick={() => updateMeetingMutation.mutate({ id: activeMeeting.id, updates: { status: "cancelled" } })}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />Cancel meeting
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this meeting? This cannot be undone.")) deleteMeetingMutation.mutate(activeMeeting.id); }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Action Items</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {actionItems?.map((item: any) => (
                      <div key={item.id} className="flex items-start gap-2 p-2 rounded border">
                        <button onClick={() => toggleActionStatus.mutate({ id: item.id, currentStatus: item.status })} className="mt-0.5">
                          {item.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <div className="flex-1">
                          <p className={`text-sm ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{item.action_text}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>Owner: {item.action_owner}</span>
                            {item.due_date && <span>Due: {item.due_date}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-3">
                      <Input placeholder="New action item..." value={actionForm.action_text} onChange={e => setActionForm(f => ({ ...f, action_text: e.target.value }))} className="flex-1" />
                      <Select value={actionForm.action_owner} onValueChange={v => setActionForm(f => ({ ...f, action_owner: v }))}>
                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="teacher">Teacher</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => addActionMutation.mutate()} disabled={!actionForm.action_text || addActionMutation.isPending}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Select a meeting to view details</CardContent></Card>
            )}
          </div>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule PTM Meeting</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Student</Label>
                <Select value={form.student_id} onValueChange={v => setForm((f: any) => ({ ...f, student_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={form.meeting_date} onChange={e => setForm((f: any) => ({ ...f, meeting_date: e.target.value }))} /></div>
                <div><Label>Time</Label><Input type="time" value={form.meeting_time} onChange={e => setForm((f: any) => ({ ...f, meeting_time: e.target.value }))} /></div>
              </div>
              <div><Label>Parent Attendees</Label><Input value={form.parent_attendee_names} onChange={e => setForm((f: any) => ({ ...f, parent_attendee_names: e.target.value }))} placeholder="Names of parents attending" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={() => createMeetingMutation.mutate()} disabled={!form.student_id || !form.meeting_date || createMeetingMutation.isPending}>Create Meeting</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Wrapper>
  );
}