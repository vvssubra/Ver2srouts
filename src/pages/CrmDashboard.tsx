import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, User, Phone, Mail, CalendarDays, ArrowRight, Send, FileText, Loader2, ClipboardCheck, Trash2, CheckCircle2, XCircle, Clock, TrendingUp, Users, Activity, AlertTriangle, ChevronDown, List, LayoutGrid, MessageCircle, Download, Printer, BarChart3 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { format, isToday, isPast, differenceInDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useSensor, useSensors, useDroppable, closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import LeadCard from "@/components/crm/LeadCard";
import LeadNoteEditor from "@/components/crm/LeadNoteEditor";
import NextStepCard from "@/components/crm/NextStepCard";
import ScheduleVisitForm, { type VisitType } from "@/components/crm/ScheduleVisitForm";
import ToursCalendarView from "@/components/crm/ToursCalendarView";
import EnrollmentIntakeDialog from "@/components/crm/EnrollmentIntakeDialog";
import PreEnrollmentAssessmentDialog from "@/components/crm/PreEnrollmentAssessmentDialog";
import AssessmentGateDialog from "@/components/crm/AssessmentGateDialog";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import AdmissionsReporting from "@/components/crm/AdmissionsReporting";
import { LEAD_SOURCES as CANONICAL_LEAD_SOURCES, sourceLabel as canonicalSourceLabel } from "@/lib/crm-sources";

const STATUSES = ["new", "contacted", "tour_scheduled", "trial_scheduled", "waitlisted", "enrolled"] as const;
type LeadStatus = typeof STATUSES[number];

// Visit (tour/trial) lifecycle status presentation
const VISIT_STATUS_META: Record<string, { label: string; className: string }> = {
  requested:  { label: "Requested",  className: "bg-primary/10 text-primary border-primary/30" },
  confirmed:  { label: "Confirmed",  className: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30" },
  pending:    { label: "Scheduled",  className: "bg-primary/10 text-primary border-primary/30" },
  completed:  { label: "Completed",  className: "bg-accent/20 text-accent-foreground border-accent/40" },
  no_show:    { label: "No-show",    className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled:  { label: "Cancelled",  className: "bg-muted text-muted-foreground border-muted-foreground/20" },
};
const isActiveVisit = (s: string) => s === "requested" || s === "confirmed" || s === "pending";

function KanbanColumn({ status, children }: { status: LeadStatus; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { type: "column", status } });
  return (
    <div ref={setNodeRef} className={cn("w-[300px] flex-shrink-0 snap-start", isOver && "ring-2 ring-primary rounded-xl")}>
      {children}
    </div>
  );
}

const statusLabels: Record<LeadStatus, string> = {
  new: "New Inquiries",
  contacted: "Contacted",
  tour_scheduled: "Tour Scheduled",
  trial_scheduled: "Trial Scheduled",
  waitlisted: "Waitlisted",
  enrolled: "Enrolled",
};

const statusColors: Record<LeadStatus, string> = {
  new: "bg-primary/10 border-primary/20",
  contacted: "bg-accent/10 border-accent/20",
  tour_scheduled: "bg-[hsl(var(--role-teacher))]/10 border-[hsl(var(--role-teacher))]/20",
  trial_scheduled: "bg-[hsl(var(--role-franchisee))]/10 border-[hsl(var(--role-franchisee))]/20",
  waitlisted: "bg-muted border-muted-foreground/20",
  enrolled: "bg-accent/15 border-accent/30",
};

const badgeColors: Record<LeadStatus, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  contacted: "bg-accent/15 text-accent-foreground border-accent/30",
  tour_scheduled: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  trial_scheduled: "bg-[hsl(var(--role-franchisee))]/15 text-[hsl(var(--role-franchisee))] border-[hsl(var(--role-franchisee))]/30",
  waitlisted: "bg-muted text-muted-foreground border-muted-foreground/30",
  enrolled: "bg-accent/20 text-accent-foreground border-accent/40",
};

const TOUR_OUTCOMES = [
  { value: "interested", label: "Interested — Schedule Trial" },
  { value: "not_interested", label: "Not Interested" },
  { value: "enrolled", label: "Enrolled" },
  { value: "follow_up", label: "Follow Up Needed" },
];

const LEAD_SOURCES = CANONICAL_LEAD_SOURCES;

const TIME_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const min = i % 2 === 0 ? "00" : "30";
  const label = `${hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? "PM" : "AM"}`;
  return { value: `${String(hour).padStart(2, "0")}:${min}`, label };
});

const ACTIVITY_ICONS: Record<string, string> = {
  status_change: "🔄",
  tour_scheduled: "🏫",
  trial_scheduled: "🧪",
  tour_completed: "✅",
  tour_cancelled: "❌",
  note_added: "📝",
  form_sent: "📨",
  enrolled: "🎓",
  source_updated: "🌐",
  lead_created: "➕",
};

export default function CrmDashboard() {
  const { user, role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeLead, setIntakeLead] = useState<any>(null);
  const [assessOpen, setAssessOpen] = useState(false);
  const [assessLead, setAssessLead] = useState<any>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateLead, setGateLead] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "pipeline";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [tourViewMode, setTourViewMode] = useState<"list" | "calendar">("list");
  const [activeDragLead, setActiveDragLead] = useState<any>(null);

  // Skip-stage reason dialog
  const [skipDialog, setSkipDialog] = useState<{
    open: boolean;
    leadId: string | null;
    fromStatus: LeadStatus | null;
    toStatus: LeadStatus | null;
    skipped: string[];
  }>({ open: false, leadId: null, fromStatus: null, toStatus: null, skipped: [] });
  const [skipReason, setSkipReason] = useState("");

  // Reason dialog for cancel / no-show
  const [reasonDialog, setReasonDialog] = useState<{
    open: boolean;
    tourId: string | null;
    status: "cancelled" | "no_show";
  }>({ open: false, tourId: null, status: "cancelled" });
  const [reasonText, setReasonText] = useState("");

  const openReasonDialog = (tourId: string, status: "cancelled" | "no_show") => {
    setReasonText("");
    setReasonDialog({ open: true, tourId, status });
  };
  const submitReason = () => {
    if (!reasonDialog.tourId || !reasonText.trim()) return;
    updateTourStatus.mutate(
      { tourId: reasonDialog.tourId, status: reasonDialog.status, reason: reasonText.trim() },
      { onSuccess: () => setReasonDialog({ open: false, tourId: null, status: "cancelled" }) },
    );
  };

  // New lead form
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [leadNotes, setLeadNotes] = useState("");
  const [leadSource, setLeadSource] = useState("walk_in");
  const [inquiryDate, setInquiryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Use the global branch selector (respects super_admin "all" + persisted choice)
  const { selectedBranchId, branches: allBranches, activeBranchIds } = useGlobalBranch();
  // For inserts (new lead / tour / form) we need a single concrete branch.
  const branchId = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== "all") return selectedBranchId;
    return activeBranchIds[0];
  }, [selectedBranchId, activeBranchIds]);
  const activeBranchName = useMemo(() => {
    if (selectedBranchId === "all") return "All Branches";
    return allBranches.find((b) => b.id === selectedBranchId)?.name
      ?? allBranches.find((b) => b.id === branchId)?.name
      ?? "Branch";
  }, [selectedBranchId, allBranches, branchId]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads", activeBranchIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .in("branch_id", activeBranchIds)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: tours = [] } = useQuery({
    queryKey: ["crm-tours", activeBranchIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("tours")
        .select("*")
        .in("branch_id", activeBranchIds)
        .order("scheduled_date", { ascending: true });
      return data ?? [];
    },
    enabled: activeBranchIds.length > 0,
  });

  const { data: eforms = [] } = useQuery({
    queryKey: ["eforms-for-crm", activeBranchIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("eforms")
        .select("*")
        .in("branch_id", activeBranchIds)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: activeBranchIds.length > 0,
  });

  // Fetch activities for selected lead
  const { data: leadActivities = [] } = useQuery({
    queryKey: ["lead-activities", selectedLead?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", selectedLead!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!selectedLead?.id,
  });

  // --- Helper: log activity ---
  const logActivity = async (leadId: string, activityType: string, description: string, metadata?: any) => {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      activity_type: activityType,
      description,
      metadata: metadata || {},
      created_by: user!.id,
    });
    queryClient.invalidateQueries({ queryKey: ["lead-activities", leadId] });
  };

  const createLead = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("leads").insert({
        branch_id: branchId!,
        parent_name: parentName.trim(),
        child_name: childName.trim(),
        child_age: childAge ? parseInt(childAge) : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: leadNotes.trim() || null,
        source: leadSource,
        inquiry_date: inquiryDate,
        lead_received_date: inquiryDate,
        created_by: user!.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      logActivity(data.id, "lead_created", `New lead created for ${data.child_name} (Source: ${canonicalSourceLabel(leadSource)})`);
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      setNewLeadOpen(false);
      setParentName(""); setChildName(""); setChildAge(""); setPhone(""); setEmail(""); setLeadNotes(""); setLeadSource("walk_in");
      setInquiryDate(format(new Date(), "yyyy-MM-dd"));
      toast({ title: "Lead added", description: "New inquiry has been recorded." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({ id, status, skipLog }: { id: string; status: string; skipLog?: boolean }) => {
      const nowIso = new Date().toISOString();
      const patch: any = { status, updated_at: nowIso };
      const current = leads.find((l: any) => l.id === id);
      if (status === "contacted" && current && !current.first_contacted_at) {
        patch.first_contacted_at = nowIso;
      }
      if (status === "enrolled" && current && !current.enrolled_at) {
        patch.enrolled_at = nowIso;
      }
      const { error } = await supabase.from("leads").update(patch).eq("id", id);
      if (error) throw error;
      return { id, status, skipLog };
    },
    onSuccess: ({ id, status, skipLog }) => {
      if (!skipLog) {
        logActivity(id, "status_change", `Status changed to "${statusLabels[status as LeadStatus] || status}"`);
      }
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      if (selectedLead && selectedLead.id === id) setSelectedLead({ ...selectedLead, status });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLeadSource = useMutation({
    mutationFn: async ({ id, source }: { id: string; source: string }) => {
      const { error } = await supabase.from("leads").update({ source } as any).eq("id", id);
      if (error) throw error;
      return { id, source };
    },
    onSuccess: ({ id, source }) => {
      logActivity(id, "source_updated", `Lead source updated to "${canonicalSourceLabel(source)}"`);
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      if (selectedLead) setSelectedLead({ ...selectedLead, source });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateKanbanNote = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ kanban_note: note || null } as any)
        .eq("id", id);
      if (error) throw error;
      return { id, note };
    },
    onSuccess: ({ id, note }) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      if (selectedLead && selectedLead.id === id) {
        setSelectedLead({ ...selectedLead, kanban_note: note } as any);
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("lead_activities").delete().eq("lead_id", id);
      await supabase.from("tours").delete().eq("lead_id", id);
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tours"] });
      setSheetOpen(false);
      setSelectedLead(null);
      toast({ title: "Lead deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const combineDateAndTime = (date: Date, time: string): string => {
    const [h, m] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(h, m, 0, 0);
    return combined.toISOString();
  };

  const notifyBranchStaff = async (title: string, message: string) => {
    // Scope CRM (enrolment / tour / trial) notifications to branch managers
    // (admins / franchisees / super_admins). Teachers are not stakeholders
    // for cross-class CRM events and should not be spammed.
    const { data: members } = await supabase
      .from("branch_memberships")
      .select("user_id")
      .eq("branch_id", branchId!);
    const userIds = (members ?? []).map((m: any) => m.user_id);
    if (userIds.length === 0) return;
    const { data: managerRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", userIds)
      .in("role", ["admin", "franchisee", "super_admin"]);
    const managerIds = Array.from(new Set((managerRoles ?? []).map((r: any) => r.user_id)));
    if (managerIds.length > 0) {
      const notifs = managerIds.map((uid: string) => ({
        user_id: uid, title, message, type: "general",
        action_url: "/crm",
      }));
      await supabase.from("notifications").insert(notifs);
    }
  };

  const scheduleVisit = useMutation({
    mutationFn: async ({ type, date, time, notes, leadId }: {
      type: VisitType; date: Date; time: string; notes: string; leadId: string;
    }) => {
      const scheduledDate = combineDateAndTime(date, time);
      const lead = leads.find((l: any) => l.id === leadId);
      const { error } = await supabase.from("tours").insert({
        branch_id: branchId!,
        lead_id: leadId,
        scheduled_date: scheduledDate,
        notes: notes || null,
        created_by: user!.id,
        type,
      } as any);
      if (error) throw error;
      const newStatus = type === "trial" ? "trial_scheduled" : "tour_scheduled";
      const tsField = type === "trial" ? "trial_scheduled_at" : "tour_scheduled_at";
      await supabase.from("leads").update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        [tsField]: scheduledDate,
      } as any).eq("id", leadId);
      await logActivity(
        leadId,
        type === "trial" ? "trial_scheduled" : "tour_scheduled",
        `${type === "trial" ? "Trial session" : "Tour"} scheduled for ${format(new Date(scheduledDate), "PPp")}${notes ? ` — ${notes}` : ""}`
      );
      await notifyBranchStaff(
        `${type === "trial" ? "Trial" : "Tour"} Scheduled`,
        `${type === "trial" ? "Trial session" : "Tour"} for ${lead?.child_name || "lead"} scheduled on ${format(new Date(scheduledDate), "PPp")}`
      );
      return { type, leadId };
    },
    onSuccess: ({ type, leadId }) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tours"] });
      const newStatus = type === "trial" ? "trial_scheduled" : "tour_scheduled";
      if (selectedLead && selectedLead.id === leadId) setSelectedLead({ ...selectedLead, status: newStatus });
      toast({ title: `${type === "trial" ? "Trial" : "Tour"} scheduled`, description: "Visit booked and staff notified." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTourStatus = useMutation({
    mutationFn: async ({ tourId, status, reason }: { tourId: string; status: string; reason?: string }) => {
      if ((status === "cancelled" || status === "no_show") && !reason?.trim()) {
        throw new Error(`A reason is required to mark this visit as ${status === "no_show" ? "no-show" : "cancelled"}.`);
      }
      const tour = tours.find((t: any) => t.id === tourId);
      const updates: any = { status };
      if (status === "completed" || status === "cancelled" || status === "no_show") {
        updates.completed_at = new Date().toISOString();
      }
      if (reason?.trim()) {
        const tag = status === "no_show" ? "No-show reason" : "Cancellation reason";
        const stamp = format(new Date(), "PP");
        const line = `[${stamp}] ${tag}: ${reason.trim()}`;
        updates.notes = tour?.notes ? `${tour.notes}\n${line}` : line;
      }
      const { error } = await supabase.from("tours").update(updates).eq("id", tourId);
      if (error) throw error;

      if (tour) {
        const tourType = (tour as any).type || "tour";
        const visitLabel = tourType === "trial" ? "Trial" : "Tour";
        const dateLabel = format(new Date(tour.scheduled_date), "PPp");
        if (status === "cancelled" || status === "no_show") {
          const verb = status === "no_show" ? "marked as No-show" : "was cancelled";
          await logActivity(tour.lead_id, "tour_cancelled", `${visitLabel} on ${dateLabel} ${verb} — Reason: ${reason!.trim()}`);
          const remainingActive = tours.filter((t: any) => t.lead_id === tour.lead_id && t.id !== tourId && isActiveVisit(t.status));
          if (remainingActive.length === 0) {
            await supabase.from("leads").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", tour.lead_id);
            await logActivity(tour.lead_id, "status_change", "Auto-reverted to Contacted (no pending visits)");
          }
        } else if (status === "confirmed") {
          await logActivity(tour.lead_id, "tour_confirmed", `${visitLabel} on ${dateLabel} confirmed by parent`);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tours"] });
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateTourOutcome = useMutation({
    mutationFn: async ({ tourId, outcome }: { tourId: string; outcome: string }) => {
      const { error } = await supabase.from("tours").update({ outcome, status: "completed", completed_at: new Date().toISOString() } as any).eq("id", tourId);
      if (error) throw error;

      const tour = tours.find((t: any) => t.id === tourId);
      if (tour) {
        const tourType = (tour as any).type || "tour";
        // Stamp the per-lead completion timestamp for funnel reporting
        const tsField = tourType === "trial" ? "trial_completed_at" : "tour_completed_at";
        await supabase.from("leads").update({ [tsField]: new Date().toISOString() } as any).eq("id", tour.lead_id);
        await logActivity(tour.lead_id, "tour_completed", `${tourType === "trial" ? "Trial" : "Tour"} completed — Outcome: ${outcome.replace("_", " ")}`);

        // Smart status sync based on outcome
        if (outcome === "enrolled") {
          // Auto-enroll
          const lead = leads.find((l: any) => l.id === tour.lead_id);
          if (lead) {
            await handleEnrollInternal(lead);
          }
        } else if (outcome === "interested" && tourType === "tour") {
          // Suggest trial — update toast
          toast({ title: "Tour completed", description: "Consider scheduling a trial session for this lead.", duration: 6000 });
        } else if (outcome === "not_interested") {
          // Keep as contacted
          await supabase.from("leads").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", tour.lead_id);
          await logActivity(tour.lead_id, "status_change", "Auto-set to Contacted (not interested)");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tours"] });
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      toast({ title: "Outcome recorded" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openLeadDetail = (lead: any) => { setSelectedLead(lead); setSheetOpen(true); };

  const sendFormToLead = async (lead: any, formType: string) => {
    const form = eforms.find((f: any) => f.form_type === formType);
    if (!form) {
      toast({ title: "No form found", description: `Create a ${formType} form in e-Forms first.`, variant: "destructive" });
      return;
    }
    try {
      await supabase.from("eform_submissions").insert({
        eform_id: form.id, branch_id: branchId!,
        recipient_name: lead.parent_name, recipient_email: lead.email || "",
        recipient_phone: lead.phone || null, child_name: lead.child_name, status: "sent",
      });
      await logActivity(lead.id, "form_sent", `${formType === "interest" ? "Interest" : "Registration"} form sent to ${lead.parent_name}`);
      const url = `${window.location.origin}/form/${form.share_token}`;
      if (lead.phone) {
        const msg = encodeURIComponent(`Hi ${lead.parent_name}, please fill out this form: ${url}`);
        window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${msg}`, "_blank");
      } else {
        navigator.clipboard.writeText(url);
      }
      queryClient.invalidateQueries({ queryKey: ["eform-submissions"] });
      toast({ title: "Form sent", description: lead.phone ? "WhatsApp opened with form link" : "Form link copied to clipboard" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Internal enroll helper (no UI state dependency)
  const handleEnrollInternal = async (lead: any) => {
    // Gate: prompt for assessment first when none has been recorded yet.
    const fresh = leads.find((l: any) => l.id === lead.id) ?? lead;
    if (!fresh?.pre_enrollment_assessment) {
      setGateLead(fresh);
      setGateOpen(true);
      return;
    }
    setIntakeLead(fresh);
    setIntakeOpen(true);
  };

  const handleEnroll = (lead: any) => {
    handleEnrollInternal(lead);
  };

  const handleIntakeComplete = async (studentId: string, extras?: {
    totalFeesPaid: number | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentDate: string | null;
  }) => {
    const lead = intakeLead;
    if (!lead) return;
    try {
      const nowIso = new Date().toISOString();
      const updatePayload: any = {
        status: "enrolled",
        updated_at: nowIso,
        enrolled_at: nowIso,
        enrollment_student_id: studentId,
      };
      if (extras) {
        if (extras.totalFeesPaid !== null && Number.isFinite(extras.totalFeesPaid)) {
          updatePayload.total_fees_paid_at_enrollment = extras.totalFeesPaid;
        }
        if (extras.paymentMethod) updatePayload.enrollment_payment_method = extras.paymentMethod;
        if (extras.paymentReference) updatePayload.enrollment_payment_reference = extras.paymentReference;
        if (extras.paymentDate) updatePayload.enrollment_payment_date = extras.paymentDate;
      }
      await supabase
        .from("leads")
        .update(updatePayload)
        .eq("id", lead.id);
      await logActivity(
        lead.id,
        "enrolled",
        `${lead.child_name} enrolled (student ${studentId.slice(0, 8)})${
          extras?.totalFeesPaid != null
            ? ` — fees paid: RM ${Number(extras.totalFeesPaid).toFixed(2)}`
            : ""
        }`,
        extras ?? {},
      );
      await notifyBranchStaff(
        "New Student Enrolled",
        `${lead.child_name} has been enrolled successfully.`,
      );
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setSelectedLead((cur: any) => (cur ? { ...cur, status: "enrolled" } : cur));
    } catch (e: any) {
      console.error("Post-enroll lead update failed:", e);
    }
  };

  const leadTours = selectedLead ? tours.filter((t: any) => t.lead_id === selectedLead.id) : [];

  // Build enriched tours list
  const leadsMap = new Map(leads.map((l: any) => [l.id, l]));
  const enrichedTours = tours.map((t: any) => ({ ...t, lead: leadsMap.get(t.lead_id) }));

  const getTourDateStatus = (tour: any) => {
    const date = new Date(tour.scheduled_date);
    if (tour.status === "completed") return "completed";
    if (tour.status === "cancelled") return "cancelled";
    if (isToday(date)) return "today";
    if (isPast(date)) return "overdue";
    return "upcoming";
  };

  const tourDateStatusStyles: Record<string, string> = {
    today: "bg-accent/15 text-accent-foreground",
    upcoming: "bg-primary/10 text-primary",
    overdue: "bg-destructive/10 text-destructive",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground line-through",
  };

  // --- KPI Calculations ---
  const totalLeads = leads.length;
  const newLeadsCount = leads.filter((l: any) => l.status === "new").length;
  const contactedCount = leads.filter((l: any) => l.status === "contacted").length;
  const enrolledCount = leads.filter((l: any) => l.status === "enrolled").length;
  const conversionRate = totalLeads > 0 ? Math.round((enrolledCount / totalLeads) * 100) : 0;
  const pendingTours = tours.filter((t: any) => t.status === "pending").length;
  const toursScheduledCount = tours.filter((t: any) => isActiveVisit(t.status) && ((t as any).type ?? "tour") === "tour").length;
  const toursCompletedCount = tours.filter((t: any) => t.status === "completed" && ((t as any).type ?? "tour") === "tour").length;
  const trialsScheduledCount = tours.filter((t: any) => isActiveVisit(t.status) && (t as any).type === "trial").length;
  const trialsCompletedCount = tours.filter((t: any) => t.status === "completed" && (t as any).type === "trial").length;
  const assessmentsPendingCount = leads.filter((l: any) => !l.pre_enrollment_assessment && (l.status === "tour_scheduled" || l.status === "trial_scheduled" || l.status === "waitlisted")).length;
  const staleLeadsCount = leads.filter((l: any) => {
    if (l.status === "enrolled") return false;
    return differenceInDays(new Date(), new Date(l.updated_at || l.created_at)) > 7;
  }).length;
  const leadAge = selectedLead ? differenceInDays(new Date(), new Date(selectedLead.created_at)) : 0;

  // Trend: leads created in last 30 days vs prior 30
  const last30 = leads.filter((l: any) => new Date(l.created_at) >= subDays(new Date(), 30)).length;
  const prior30 = leads.filter((l: any) => {
    const d = new Date(l.created_at);
    return d >= subDays(new Date(), 60) && d < subDays(new Date(), 30);
  }).length;
  const leadsTrend = prior30 === 0 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - prior30) / prior30) * 100);

  // Source breakdown
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l: any) => {
      const src = l.source || "walk_in";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [leads]);

  // --- Conversion Funnel (per-franchise via branchId scope) ---
  const funnelStages = useMemo(() => {
    // Build latest-visit map per lead (by created_at)
    const latestVisitByLead = new Map<string, any>();
    for (const t of tours as any[]) {
      const prev = latestVisitByLead.get(t.lead_id);
      const tTime = new Date(t.created_at || 0).getTime();
      const pTime = prev ? new Date(prev.created_at || 0).getTime() : -1;
      if (!prev || tTime >= pTime) latestVisitByLead.set(t.lead_id, t);
    }

    // Classify each lead into exactly one bucket based on its latest status + latest visit outcome
    const buckets = { lead: 0, contacted: 0, scheduled: 0, completed: 0, enrolled: 0 };
    const activeVisitStatuses = new Set(["requested", "confirmed", "pending"]);

    for (const l of leads as any[]) {
      // Terminal: enrolled lead status OR latest visit outcome = enrolled
      if (l.status === "enrolled" || latestVisitByLead.get(l.id)?.outcome === "enrolled") {
        buckets.enrolled++;
        continue;
      }
      const v = latestVisitByLead.get(l.id);
      // Visit completed (and not enrolled)
      if (v && v.status === "completed") {
        buckets.completed++;
        continue;
      }
      // Visit currently scheduled (active) — by lead status or active visit
      if (
        ["tour_scheduled", "trial_scheduled", "waitlisted"].includes(l.status) ||
        (v && activeVisitStatuses.has(v.status))
      ) {
        buckets.scheduled++;
        continue;
      }
      // Contacted
      if (l.status === "contacted") {
        buckets.contacted++;
        continue;
      }
      // Default: new lead (includes 'lead', 'lost', etc. that never progressed)
      buckets.lead++;
    }

    const total = leads.length;
    const reachedLead = total;
    const reachedContacted = buckets.contacted + buckets.scheduled + buckets.completed + buckets.enrolled;
    const reachedScheduled = buckets.scheduled + buckets.completed + buckets.enrolled;
    const reachedCompleted = buckets.completed + buckets.enrolled;
    const reachedEnrolled = buckets.enrolled;

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    return [
      { key: "lead",      label: "New Lead",        count: reachedLead,      rate: 100,                                    tone: "bg-primary",                          exclusive: buckets.lead },
      { key: "contacted", label: "Contacted",       count: reachedContacted, rate: pct(reachedContacted, reachedLead),     tone: "bg-primary/80",                       exclusive: buckets.contacted },
      { key: "scheduled", label: "Visit Scheduled", count: reachedScheduled, rate: pct(reachedScheduled, reachedContacted),tone: "bg-[hsl(var(--role-teacher))]",       exclusive: buckets.scheduled },
      { key: "completed", label: "Visit Completed", count: reachedCompleted, rate: pct(reachedCompleted, reachedScheduled),tone: "bg-[hsl(var(--role-teacher))]/80",    exclusive: buckets.completed },
      { key: "enrolled",  label: "Enrolled",        count: reachedEnrolled,  rate: pct(reachedEnrolled, reachedCompleted), tone: "bg-accent",                           exclusive: buckets.enrolled },
    ];
  }, [leads, tours]);

  const tourToEnrollRate = useMemo(() => {
    const completed = tours.filter((t: any) => t.status === "completed").length;
    const enrolledFromTour = tours.filter((t: any) => t.outcome === "enrolled").length;
    return completed > 0 ? Math.round((enrolledFromTour / completed) * 100) : 0;
  }, [tours]);

  // --- Funnel Export Helpers ---
  const branchName = activeBranchName;
  const exportStamp = format(new Date(), "yyyy-MM-dd");

  const exportFunnelCsv = () => {
    const headers = ["Stage", "Reached (Cumulative)", "At This Stage", "Conversion from Previous (%)"];
    const rows = funnelStages.map((s: any, i) => [
      s.label,
      String(s.count),
      String((s as any).exclusive ?? ""),
      i === 0 ? "100" : String(s.rate),
    ]);
    const meta = [
      ["Enrollment Pipeline Conversion"],
      [`Branch: ${branchName}`],
      [`Generated: ${format(new Date(), "PPpp")}`],
      [`Tour → Enrolled Rate: ${tourToEnrollRate}%`],
      [],
    ];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [...meta, headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrollment-funnel_${branchName.replace(/\s+/g, "-")}_${exportStamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: "Funnel metrics downloaded." });
  };

  const exportFunnelPdf = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups to export PDF.", variant: "destructive" });
      return;
    }
    const rowsHtml = funnelStages.map((s: any, i) => `
      <tr>
        <td>${s.label}</td>
        <td style="text-align:right">${s.count}</td>
        <td style="text-align:right">${(s as any).exclusive ?? "-"}</td>
        <td style="text-align:right">${i === 0 ? "100" : s.rate}%</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>Enrollment Funnel — ${branchName}</title>
      <style>
        *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;margin:0}
        h1{font-size:20px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:18px}
        .badge{display:inline-block;padding:4px 10px;border:1px solid #ccc;border-radius:999px;font-size:12px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #ddd;padding:8px 10px} th{background:#f5f5f5;text-align:left}
        tfoot td{font-style:italic;color:#666;border:none;padding-top:14px;font-size:11px}
        @media print{ .no-print{display:none} }
        .actions{margin-top:18px}
        button{padding:8px 14px;border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;border-radius:6px;cursor:pointer;font-size:13px}
      </style></head><body>
      <h1>Enrollment Pipeline Conversion</h1>
      <div class="meta">${branchName} · Generated ${format(new Date(), "PPpp")}</div>
      <div class="badge">Tour → Enrolled: <strong>${tourToEnrollRate}%</strong></div>
      <table>
        <thead><tr><th>Stage</th><th style="text-align:right">Reached (cumulative)</th><th style="text-align:right">At this stage</th><th style="text-align:right">Conv. from previous</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td colspan="4">Each lead is counted in exactly one bucket under "At this stage" based on its latest status and most recent visit outcome.</td></tr></tfoot>
      </table>
      <div class="actions no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
      <script>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    win.document.close();
  };

  // --- Trends Export (grouped by month) ---
  // Basis: 'created' uses lead.created_at for every bucket;
  //        'enrollment' uses lead.updated_at when the lead is enrolled (proxy for enrollment date),
  //        otherwise falls back to lead.created_at.
  const buildTrendRows = (basis: "created" | "enrollment") => {
    // Recompute latest visit per lead (mirrors funnelStages logic)
    const latestVisitByLead = new Map<string, any>();
    for (const t of tours as any[]) {
      const prev = latestVisitByLead.get(t.lead_id);
      const tTime = new Date(t.created_at || 0).getTime();
      const pTime = prev ? new Date(prev.created_at || 0).getTime() : -1;
      if (!prev || tTime >= pTime) latestVisitByLead.set(t.lead_id, t);
    }
    const activeVisitStatuses = new Set(["requested", "confirmed", "pending"]);

    type Row = { lead: number; contacted: number; scheduled: number; completed: number; enrolled: number };
    const byMonth = new Map<string, Row>();
    const ensure = (k: string): Row => {
      let r = byMonth.get(k);
      if (!r) { r = { lead: 0, contacted: 0, scheduled: 0, completed: 0, enrolled: 0 }; byMonth.set(k, r); }
      return r;
    };

    for (const l of leads as any[]) {
      const v = latestVisitByLead.get(l.id);
      const isEnrolled = l.status === "enrolled" || v?.outcome === "enrolled";
      const dateSource = basis === "enrollment" && isEnrolled
        ? (l.updated_at || l.created_at)
        : l.created_at;
      if (!dateSource) continue;
      const monthKey = format(new Date(dateSource), "yyyy-MM");
      const row = ensure(monthKey);

      if (isEnrolled) { row.enrolled++; continue; }
      if (v && v.status === "completed") { row.completed++; continue; }
      if (["tour_scheduled", "trial_scheduled", "waitlisted"].includes(l.status) || (v && activeVisitStatuses.has(v.status))) {
        row.scheduled++; continue;
      }
      if (l.status === "contacted") { row.contacted++; continue; }
      row.lead++;
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, r]) => {
        const total = r.lead + r.contacted + r.scheduled + r.completed + r.enrolled;
        const convPct = total > 0 ? Math.round((r.enrolled / total) * 100) : 0;
        return { month, ...r, total, convPct };
      });
  };

  const exportTrendsCsv = (basis: "created" | "enrollment") => {
    const rows = buildTrendRows(basis);
    if (rows.length === 0) {
      toast({ title: "No data", description: "No leads to export for trends.", variant: "destructive" });
      return;
    }
    const basisLabel = basis === "enrollment" ? "Enrollment Month" : "Lead Created Month";
    const headers = ["Month", "New Lead", "Contacted", "Visit Scheduled", "Visit Completed", "Enrolled", "Total Leads", "Conversion (%)"];
    const meta = [
      ["Enrollment Funnel — Monthly Trends"],
      [`Branch: ${branchName}`],
      [`Grouping: ${basisLabel}`],
      [`Generated: ${format(new Date(), "PPpp")}`],
      [],
    ];
    const dataRows = rows.map(r => [
      r.month, String(r.lead), String(r.contacted), String(r.scheduled),
      String(r.completed), String(r.enrolled), String(r.total), String(r.convPct),
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [...meta, headers, ...dataRows].map(r => r.map(escape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrollment-funnel-trends_${basis}_${branchName.replace(/\s+/g, "-")}_${exportStamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `Monthly trends by ${basisLabel.toLowerCase()}.` });
  };

  const exportTrendsPdf = (basis: "created" | "enrollment") => {
    const rows = buildTrendRows(basis);
    if (rows.length === 0) {
      toast({ title: "No data", description: "No leads to export for trends.", variant: "destructive" });
      return;
    }
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups to export PDF.", variant: "destructive" });
      return;
    }
    const basisLabel = basis === "enrollment" ? "Enrollment Month" : "Lead Created Month";
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${format(new Date(r.month + "-01"), "MMM yyyy")}</td>
        <td style="text-align:right">${r.lead}</td>
        <td style="text-align:right">${r.contacted}</td>
        <td style="text-align:right">${r.scheduled}</td>
        <td style="text-align:right">${r.completed}</td>
        <td style="text-align:right"><strong>${r.enrolled}</strong></td>
        <td style="text-align:right">${r.total}</td>
        <td style="text-align:right">${r.convPct}%</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>Funnel Trends — ${branchName}</title>
      <style>
        *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;padding:32px;margin:0}
        h1{font-size:20px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:18px}
        .badge{display:inline-block;padding:4px 10px;border:1px solid #ccc;border-radius:999px;font-size:12px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px} th{background:#f5f5f5;text-align:left}
        tfoot td{font-style:italic;color:#666;border:none;padding-top:14px;font-size:11px}
        @media print{ .no-print{display:none} }
        .actions{margin-top:18px}
        button{padding:8px 14px;border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;border-radius:6px;cursor:pointer;font-size:13px}
      </style></head><body>
      <h1>Enrollment Funnel — Monthly Trends</h1>
      <div class="meta">${branchName} · Grouped by ${basisLabel} · Generated ${format(new Date(), "PPpp")}</div>
      <table>
        <thead><tr>
          <th>Month</th><th style="text-align:right">New Lead</th><th style="text-align:right">Contacted</th>
          <th style="text-align:right">Scheduled</th><th style="text-align:right">Completed</th>
          <th style="text-align:right">Enrolled</th><th style="text-align:right">Total</th><th style="text-align:right">Conv. %</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td colspan="8">Conversion % = Enrolled ÷ Total leads in that month. Each lead is counted in exactly one bucket per row.</td></tr></tfoot>
      </table>
      <div class="actions no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
      <script>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    win.document.close();
  };

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find((l: any) => l.id === event.active.id);
    setActiveDragLead(lead || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragLead(null);
    const { active, over } = event;
    if (!over) return;
    // over.id may be the column id ("col-<status>") or a card id (when dropping onto a card)
    const rawOverId = String(over.id);
    let newStatus: string | undefined =
      (over.data?.current as any)?.status ??
      (rawOverId.startsWith("col-") ? rawOverId.slice(4) : undefined);
    if (!newStatus) {
      // dropped on a card — find that card's status
      const overLead = leads.find((l: any) => l.id === rawOverId);
      newStatus = overLead?.status;
    }
    if (!newStatus || !STATUSES.includes(newStatus as LeadStatus)) return;
    const lead = leads.find((l: any) => l.id === active.id);
    if (!lead || lead.status === newStatus) return;

    // Moving to "enrolled" must go through the enrollment intake flow
    // (assessment gate → intake dialog), not a silent status update.
    if (newStatus === "enrolled") {
      handleEnrollInternal(lead);
      return;
    }

    // Detect "stage skip" — skipping 2+ stages forward triggers the reason modal
    const fromIdx = STATUSES.indexOf(lead.status as LeadStatus);
    const toIdx = STATUSES.indexOf(newStatus as LeadStatus);
    const isForward = toIdx > fromIdx;
    const skipped = isForward && toIdx - fromIdx >= 2
      ? STATUSES.slice(fromIdx + 1, toIdx).map((s) => statusLabels[s])
      : [];
    if (skipped.length > 0) {
      setSkipReason("");
      setSkipDialog({
        open: true,
        leadId: lead.id,
        fromStatus: lead.status as LeadStatus,
        toStatus: newStatus as LeadStatus,
        skipped,
      });
      return;
    }
    updateLeadStatus.mutate({ id: lead.id, status: newStatus });
  };

  const confirmSkip = async () => {
    if (!skipDialog.leadId || !skipDialog.toStatus || !skipReason.trim()) return;
    const { leadId, toStatus, fromStatus, skipped } = skipDialog;
    // If the target is "enrolled", route through the intake flow instead of
    // silently flipping status. Log the skip reason first for audit trail.
    if (toStatus === "enrolled") {
      const lead = leads.find((l: any) => l.id === leadId);
      await logActivity(
        leadId,
        "status_change",
        `Stage advanced from "${statusLabels[fromStatus!]}" toward "${statusLabels[toStatus]}" — skipped: ${skipped.join(", ")}. Reason: ${skipReason.trim()}`,
        { from: fromStatus, to: toStatus, skipped, reason: skipReason.trim() },
      );
      setSkipDialog({ open: false, leadId: null, fromStatus: null, toStatus: null, skipped: [] });
      setSkipReason("");
      if (lead) handleEnrollInternal(lead);
      return;
    }
    await updateLeadStatus.mutateAsync({ id: leadId, status: toStatus, skipLog: true });
    await logActivity(
      leadId,
      "status_change",
      `Stage advanced from "${statusLabels[fromStatus!]}" to "${statusLabels[toStatus]}" — skipped: ${skipped.join(", ")}. Reason: ${skipReason.trim()}`,
      { from: fromStatus, to: toStatus, skipped, reason: skipReason.trim() },
    );
    setSkipDialog({ open: false, leadId: null, fromStatus: null, toStatus: null, skipped: [] });
    setSkipReason("");
  };

  const openWhatsApp = (lead: any) => {
    if (!lead.phone) return;
    const msg = encodeURIComponent(`Hi ${lead.parent_name}, this is regarding ${lead.child_name}'s enrollment inquiry.`);
    window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${msg}`, "_blank");
    if (lead.status === "new") {
      updateLeadStatus.mutate({ id: lead.id, status: "contacted" });
    }
  };

  const openEmail = (lead: any) => {
    if (!lead.email) return;
    window.open(`mailto:${lead.email}?subject=Regarding ${lead.child_name}'s enrollment`);
    if (lead.status === "new") {
      updateLeadStatus.mutate({ id: lead.id, status: "contacted" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Premium page header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-wash via-card to-card p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[11px] uppercase tracking-wide font-semibold">
                  Admissions CRM
                </Badge>
                <span className="text-xs text-muted-foreground hidden md:inline">·</span>
                <span className="text-xs font-medium text-foreground">{activeBranchName}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Admissions</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Manage leads, school visits, trials, assessments and enrollment for {activeBranchName}.
              </p>
            </div>
          <Dialog open={newLeadOpen} onOpenChange={setNewLeadOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="shadow-sm shadow-primary/20"><Plus className="mr-2 h-4 w-4" />New Lead</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
              <div className="space-y-5">
                {/* Parent section */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parent</p>
                  <div><Label>Parent Name *</Label><Input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent's full name" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-3456789" />
                      <p className="text-[10px] text-muted-foreground mt-1">Malaysia format, e.g. 012-3456789</p>
                    </div>
                    <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" /></div>
                  </div>
                  <div>
                    <Label>Source</Label>
                    <Select value={leadSource} onValueChange={setLeadSource}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lead Received Date *</Label>
                    <Input
                      type="date"
                      value={inquiryDate}
                      max={format(new Date(), "yyyy-MM-dd")}
                      onChange={(e) => setInquiryDate(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Date the parent's enquiry was actually received — drives marketing reporting (separate from the system-created date).</p>
                  </div>
                </div>
                {/* Child section */}
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Child</p>
                  <div><Label>Child Name *</Label><Input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Child's name" /></div>
                  <div><Label>Child Age</Label><Input type="number" value={childAge} onChange={(e) => setChildAge(e.target.value)} placeholder="Age" min="1" max="7" /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Any additional notes..." rows={2} /></div>
                <Button className="w-full" disabled={!parentName.trim() || !childName.trim() || !inquiryDate || createLead.isPending} onClick={() => createLead.mutate()}>
                  {createLead.isPending ? "Adding..." : "Add Lead"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Premium KPI Grid */}
        {(() => {
          const kpis: { label: string; value: string | number; icon: any; tone: string; iconClass: string }[] = [
            { label: "Total Leads",        value: totalLeads,           icon: Users,         tone: "bg-primary/10",                                                      iconClass: "text-primary" },
            { label: "New",                value: newLeadsCount,        icon: Plus,          tone: "bg-primary-wash",                                                    iconClass: "text-primary" },
            { label: "Contacted",          value: contactedCount,       icon: Phone,         tone: "bg-accent/15",                                                       iconClass: "text-accent-foreground" },
            { label: "Tours Scheduled",    value: toursScheduledCount,  icon: CalendarDays,  tone: "bg-[hsl(var(--role-teacher))]/10",                                   iconClass: "text-[hsl(var(--role-teacher))]" },
            { label: "Tours Completed",    value: toursCompletedCount,  icon: CheckCircle2,  tone: "bg-[hsl(var(--role-teacher))]/15",                                   iconClass: "text-[hsl(var(--role-teacher))]" },
            { label: "Trials Scheduled",   value: trialsScheduledCount, icon: ClipboardCheck,tone: "bg-[hsl(var(--role-franchisee))]/10",                                iconClass: "text-[hsl(var(--role-franchisee))]" },
            { label: "Trials Completed",   value: trialsCompletedCount, icon: CheckCircle2,  tone: "bg-[hsl(var(--role-franchisee))]/15",                                iconClass: "text-[hsl(var(--role-franchisee))]" },
            { label: "Assessments Pending",value: assessmentsPendingCount, icon: FileText,   tone: "bg-amber-100 dark:bg-amber-500/10",                                  iconClass: "text-amber-700 dark:text-amber-300" },
            { label: "Enrolled",           value: enrolledCount,        icon: User,          tone: "bg-accent/20",                                                       iconClass: "text-accent-foreground" },
            { label: "Lead → Enrolled",    value: `${conversionRate}%`, icon: TrendingUp,    tone: "bg-primary/15",                                                      iconClass: "text-primary" },
            { label: "Stale > 7d",         value: staleLeadsCount,      icon: AlertTriangle, tone: staleLeadsCount > 0 ? "bg-destructive/10" : "bg-muted",               iconClass: staleLeadsCount > 0 ? "text-destructive" : "text-muted-foreground" },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {kpis.map((k) => (
                <Card key={k.label} className="border-border/70 hover:border-primary/40 hover:shadow-sm transition-all">
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", k.tone)}>
                      <k.icon className={cn("h-5 w-5", k.iconClass)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold text-foreground leading-none">{k.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

        {/* Enrollment Conversion Funnel */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Enrollment Pipeline Conversion</p>
                <p className="text-xs text-muted-foreground">
                  Stage-by-stage funnel for this branch — % shows conversion from the previous stage.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={exportFunnelCsv} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {funnelStages.map((s, idx) => {
                const prev = idx > 0 ? funnelStages[idx - 1] : null;
                const widthPct = funnelStages[0].count > 0
                  ? Math.max(8, Math.round((s.count / funnelStages[0].count) * 100))
                  : 8;
                return (
                  <div key={s.key} className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                      {prev && (
                        <span className={cn(
                          "text-[10px] font-semibold",
                          s.rate >= 50 ? "text-emerald-600 dark:text-emerald-400" : s.rate >= 25 ? "text-primary" : "text-muted-foreground"
                        )}>
                          {s.rate}%
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-foreground">{s.count}</p>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", s.tone)}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="tours">
              Tours & Trials
              {pendingTours > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">{pendingTours}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reporting">
              <BarChart3 className="h-3.5 w-3.5 mr-1" />Reporting & ROI
            </TabsTrigger>
          </TabsList>

          {/* Pipeline Tab — Drag & Drop Kanban */}
          <TabsContent value="pipeline">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-1 px-1">
                {STATUSES.map((status) => {
                  const columnLeads = leads.filter((l: any) => l.status === status);
                  return (
                    <KanbanColumn key={status} status={status}>
                      <div className={cn("rounded-xl border p-2 min-h-[400px] flex flex-col", statusColors[status])}>
                        <div className="flex items-center justify-between px-1.5 py-1 mb-2 sticky top-0">
                          <h3 className="text-sm font-semibold text-foreground tracking-tight">{statusLabels[status]}</h3>
                          <Badge variant="outline" className={cn("h-5 px-2 text-[11px]", badgeColors[status])}>{columnLeads.length}</Badge>
                        </div>
                        <div className="space-y-2 flex-1">
                        <SortableContext items={columnLeads.map((l: any) => l.id)} strategy={verticalListSortingStrategy}>
                          {columnLeads.map((lead: any) => {
                            const nextVisit = tours
                              .filter((t: any) => t.lead_id === lead.id && isActiveVisit(t.status))
                              .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0];
                            const visitMeta = nextVisit ? VISIT_STATUS_META[nextVisit.status] : undefined;
                            return (
                              <LeadCard
                                key={lead.id}
                                lead={lead}
                                sourceLabel={
                                  (lead as any).source && (lead as any).source !== "walk_in"
                                    ? canonicalSourceLabel((lead as any).source)
                                    : undefined
                                }
                                visitStatusLabel={visitMeta?.label}
                                visitStatusClass={visitMeta?.className}
                                onOpen={openLeadDetail}
                                onWhatsApp={openWhatsApp}
                                onSchedule={(l) => { openLeadDetail(l); }}
                                canEditNote={isSuperAdmin}
                                onSaveNote={async (id, note) => {
                                  await updateKanbanNote.mutateAsync({ id, note });
                                }}
                              />
                            );
                          })}
                        </SortableContext>
                          {columnLeads.length === 0 && (
                            <div className="flex flex-col items-center justify-center text-center py-10 px-3 rounded-lg border-2 border-dashed border-border/50">
                              <p className="text-xs text-muted-foreground">No leads here</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">Drag cards to this stage</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </KanbanColumn>
                  );
                })}
              </div>
              <DragOverlay>
                {activeDragLead && (
                  <Card className="shadow-lg ring-2 ring-primary cursor-grabbing">
                    <CardContent className="p-3">
                      <p className="text-sm font-medium">{activeDragLead.child_name}</p>
                      <p className="text-xs text-muted-foreground">{activeDragLead.parent_name}</p>
                    </CardContent>
                  </Card>
                )}
              </DragOverlay>
            </DndContext>
          </TabsContent>

          {/* Tours & Trials Tab */}
          <TabsContent value="tours" className="space-y-3">
            <div className="flex items-center justify-end">
              <div className="inline-flex bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setTourViewMode("list")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1",
                    tourViewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  )}
                >
                  <List className="h-3 w-3" />List
                </button>
                <button
                  onClick={() => setTourViewMode("calendar")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1",
                    tourViewMode === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                  )}
                >
                  <LayoutGrid className="h-3 w-3" />Week Calendar
                </button>
              </div>
            </div>
            {tourViewMode === "calendar" ? (
              <ToursCalendarView
                tours={enrichedTours}
                onTourClick={(t) => t.lead && openLeadDetail(t.lead)}
              />
            ) : (
            <Card>
              <CardContent className="p-0">
                {enrichedTours.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No tours or trials scheduled yet.</p>
                    <p className="text-xs mt-1">Open a lead and schedule a tour or trial.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Child Name</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrichedTours.map((tour: any) => {
                        const dateStatus = getTourDateStatus(tour);
                        const tourType = (tour as any).type || "tour";
                        return (
                          <TableRow key={tour.id} className={cn(tourDateStatusStyles[dateStatus], "transition-colors")}>
                            <TableCell className="font-medium">
                              {tour.lead ? (
                                <button className="text-primary hover:underline text-left" onClick={() => openLeadDetail(tour.lead)}>
                                  {tour.lead.child_name}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">Unknown</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{tour.lead?.parent_name || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn(
                                tourType === "trial"
                                  ? "bg-[hsl(var(--role-franchisee))]/15 text-[hsl(var(--role-franchisee))] border-[hsl(var(--role-franchisee))]/30"
                                  : "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30"
                              )}>
                                {tourType === "trial" ? "Trial" : "Tour"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">{format(new Date(tour.scheduled_date), "PPp")}</span>
                              </div>
                              {dateStatus === "today" && <Badge className="mt-1 bg-accent text-accent-foreground text-[10px]">Today</Badge>}
                              {dateStatus === "overdue" && <Badge variant="destructive" className="mt-1 text-[10px]">Overdue</Badge>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={VISIT_STATUS_META[tour.status]?.className}>
                                {VISIT_STATUS_META[tour.status]?.label || tour.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {tour.status === "completed" && (tour as any).outcome ? (
                                <Badge variant="secondary" className="capitalize">{(tour as any).outcome.replace("_", " ")}</Badge>
                              ) : tour.status === "completed" ? (
                                <Select onValueChange={(v) => updateTourOutcome.mutate({ tourId: tour.id, outcome: v })}>
                                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Set outcome" /></SelectTrigger>
                                  <SelectContent>
                                    {TOUR_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isActiveVisit(tour.status) && (
                                <div className="flex items-center justify-end gap-1">
                                  {(tour.status === "requested" || tour.status === "pending") && (
                                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => updateTourStatus.mutate({ tourId: tour.id, status: "confirmed" })}>
                                      <CheckCircle2 className="h-3.5 w-3.5" />Confirm
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-accent-foreground" onClick={() => updateTourStatus.mutate({ tourId: tour.id, status: "completed" })}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />Done
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openReasonDialog(tour.id, "no_show")}>
                                    <AlertTriangle className="h-3.5 w-3.5" />No-show
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => openReasonDialog(tour.id, "cancelled")}>
                                    <XCircle className="h-3.5 w-3.5" />Cancel
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            )}
          </TabsContent>

          <TabsContent value="reporting">
            <AdmissionsReporting activeBranchIds={activeBranchIds} branches={allBranches as any} />
          </TabsContent>
        </Tabs>

        {/* Lead Detail Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
            {selectedLead && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {selectedLead.child_name}
                    <Badge variant="outline" className={cn("text-[10px]", badgeColors[selectedLead.status as LeadStatus])}>
                      {statusLabels[selectedLead.status as LeadStatus] || selectedLead.status}
                    </Badge>
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-5 mt-6">
                  {/* Lead Info + Age */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{selectedLead.parent_name}</span></div>
                    {selectedLead.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{selectedLead.phone}</span></div>}
                    {selectedLead.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{selectedLead.email}</span></div>}
                    {selectedLead.child_age && <p className="text-sm text-muted-foreground">Child Age: {selectedLead.child_age}</p>}
                    {selectedLead.notes && <p className="text-sm text-muted-foreground">{selectedLead.notes}</p>}
                    <LeadNoteEditor
                      lead={selectedLead}
                      canEdit={isSuperAdmin}
                      onSave={(note) => updateKanbanNote.mutateAsync({ id: selectedLead.id, note })}
                    />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created {format(new Date(selectedLead.created_at), "PP")}</span>
                      <span>•</span>
                      <span className="font-medium">{leadAge} days in pipeline</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Label className="text-xs text-muted-foreground shrink-0">Lead Received Date</Label>
                      <Input
                        type="date"
                        className="h-8 w-[160px]"
                        max={format(new Date(), "yyyy-MM-dd")}
                        value={(selectedLead as any).lead_received_date || (selectedLead as any).inquiry_date || format(new Date(selectedLead.created_at), "yyyy-MM-dd")}
                        onChange={async (e) => {
                          const v = e.target.value;
                          if (!v) return;
                          setSelectedLead({ ...selectedLead, lead_received_date: v, inquiry_date: v } as any);
                          const { error } = await supabase.from("leads")
                            .update({ lead_received_date: v, inquiry_date: v } as any)
                            .eq("id", selectedLead.id);
                          if (error) {
                            toast({ title: "Failed to update", description: error.message, variant: "destructive" });
                          } else {
                            queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
                            queryClient.invalidateQueries({ queryKey: ["report-leads"] });
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Source + Status Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Source</Label>
                      <Select
                        value={(selectedLead as any).source || "walk_in"}
                        onValueChange={(v) => updateLeadSource.mutate({ id: selectedLead.id, source: v })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          {(selectedLead as any).source && !LEAD_SOURCES.some(s => s.value === (selectedLead as any).source) && (
                            <SelectItem value={(selectedLead as any).source}>{canonicalSourceLabel((selectedLead as any).source)}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select
                        value={selectedLead.status}
                        onValueChange={(v) => {
                          if (v === "enrolled") {
                            handleEnroll(selectedLead);
                            return;
                          }
                          setSelectedLead({ ...selectedLead, status: v });
                          updateLeadStatus.mutate({ id: selectedLead.id, status: v });
                        }}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Existing Tours/Trials */}
                  {leadTours.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-2 block">Scheduled Tours & Trials</Label>
                      <div className="space-y-2">
                        {leadTours.map((t: any) => {
                          const tourType = (t as any).type || "tour";
                          const dateStatus = getTourDateStatus(t);
                          return (
                            <div key={t.id} className={cn("p-3 rounded-lg border space-y-2", tourDateStatusStyles[dateStatus])}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={cn(
                                    "text-[10px]",
                                    tourType === "trial"
                                      ? "bg-[hsl(var(--role-franchisee))]/15 text-[hsl(var(--role-franchisee))]"
                                      : "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]"
                                  )}>
                                    {tourType === "trial" ? "Trial" : "Tour"}
                                  </Badge>
                                  <span className="text-sm font-medium">{format(new Date(t.scheduled_date), "PPp")}</span>
                                </div>
                                <Badge variant="outline" className={cn("text-[10px]", VISIT_STATUS_META[t.status]?.className)}>
                                  {VISIT_STATUS_META[t.status]?.label || t.status}
                                </Badge>
                              </div>
                              {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                              {(t as any).outcome && (
                                <p className="text-xs"><span className="text-muted-foreground">Outcome:</span> <span className="capitalize font-medium">{(t as any).outcome.replace("_", " ")}</span></p>
                              )}
                              {isActiveVisit(t.status) && (
                                <div className="space-y-2 pt-1">
                                  {(t.status === "requested" || t.status === "pending") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs w-full gap-1"
                                      onClick={() => updateTourStatus.mutate({ tourId: t.id, status: "confirmed" })}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />Mark as Confirmed
                                    </Button>
                                  )}
                                  <div className="flex gap-2">
                                    <Select onValueChange={(v) => updateTourOutcome.mutate({ tourId: t.id, outcome: v })}>
                                      <SelectTrigger className="h-7 text-xs flex-1">
                                        <SelectValue placeholder="Mark completed with outcome" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {TOUR_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openReasonDialog(t.id, "no_show")}>
                                      No-show
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => openReasonDialog(t.id, "cancelled")}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unified Schedule Visit */}
                  <div className="border-t pt-4">
                    <NextStepCard
                      lead={selectedLead}
                      onWhatsApp={() => openWhatsApp(selectedLead)}
                      onMarkContacted={() => updateLeadStatus.mutate({ id: selectedLead.id, status: "contacted" })}
                      onEnroll={() => handleEnroll(selectedLead)}
                      isEnrolling={enrolling}
                      isSchedulingVisit={scheduleVisit.isPending}
                      onScheduleVisit={({ type, date, time, notes }) =>
                        scheduleVisit.mutate({ type, date, time, notes, leadId: selectedLead.id })
                      }
                      onEmail={() => { if (selectedLead.email) window.location.href = `mailto:${selectedLead.email}`; }}
                      onStartAssessment={() => {
                        setAssessLead(selectedLead);
                        setAssessOpen(true);
                      }}
                      onMoveToWaitlist={() => updateLeadStatus.mutate({ id: selectedLead.id, status: "waitlisted" })}
                    />
                  </div>

                  {/* e-Form Actions */}
                  <div className="border-t pt-4 space-y-3">
                    <Label className="font-semibold">e-Form Actions</Label>
                    {eforms.length === 0 ? (
                      <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                        No active e-Forms available. Create one in the e-Forms module first.
                      </p>
                    ) : (
                      <Select onValueChange={(formId) => {
                        const form = eforms.find((f: any) => f.id === formId);
                        if (form) sendFormToLead(selectedLead, form.form_type);
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a form to send…" />
                        </SelectTrigger>
                        <SelectContent>
                          {eforms.map((f: any) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.title || (f.form_type === "interest" ? "Interest Form" : f.form_type === "registration" ? "Registration Form" : f.form_type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Pre-enrollment Assessment status / CTA */}
                  {selectedLead.status !== "enrolled" && (
                    <div className="border-t pt-4 space-y-2">
                      <Label className="font-semibold flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />Baseline Assessment
                      </Label>
                      {selectedLead.pre_enrollment_assessment ? (
                        <div className="text-xs space-y-1 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                          <div className="font-medium text-emerald-700 dark:text-emerald-300">✓ Assessed</div>
                          <div className="text-muted-foreground">
                            Motor {(selectedLead.pre_enrollment_assessment as any).motor_skills_score}/5 ·
                            Language {(selectedLead.pre_enrollment_assessment as any).language_score}/5 ·
                            Socio-Emo {(selectedLead.pre_enrollment_assessment as any).socio_emotional_score}/5 ·
                            Cognitive {(selectedLead.pre_enrollment_assessment as any).cognitive_score}/5
                          </div>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => { setAssessLead(selectedLead); setAssessOpen(true); }}>
                            Update assessment
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Record a quick baseline before enrolling so the AI can personalise lesson plans accurately.
                          </p>
                          <Button variant="outline" className="w-full gap-2"
                            onClick={() => { setAssessLead(selectedLead); setAssessOpen(true); }}>
                            <ClipboardCheck className="h-4 w-4" />Conduct Baseline Assessment
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Activity Timeline */}
                  <div className="border-t pt-4">
                    <Label className="font-semibold flex items-center gap-2 mb-3">
                      <Activity className="h-4 w-4" />Activity Timeline
                    </Label>
                    {leadActivities.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No activity recorded yet</p>
                    ) : (
                      <div className="relative pl-6 space-y-3">
                        <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                        {leadActivities.map((act: any) => (
                          <div key={act.id} className="relative">
                            <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-background border-2 border-muted-foreground/30 flex items-center justify-center text-[8px]">
                              {ACTIVITY_ICONS[act.activity_type] || "•"}
                            </div>
                            <div>
                              <p className="text-sm text-foreground">{act.description}</p>
                              <p className="text-[10px] text-muted-foreground">{format(new Date(act.created_at), "PPp")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete Lead */}
                  <div className="border-t pt-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full text-destructive hover:text-destructive gap-2">
                          <Trash2 className="h-4 w-4" />Delete Lead
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete {selectedLead.child_name}'s lead record and associated tours. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteLead.mutate(selectedLead.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Cancel / No-show reason dialog */}
        <Dialog
          open={reasonDialog.open}
          onOpenChange={(o) => !o && setReasonDialog({ open: false, tourId: null, status: "cancelled" })}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {reasonDialog.status === "no_show" ? "Mark visit as No-show" : "Cancel visit"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Please provide a reason. This will be saved to the visit record and the lead's activity log.
              </p>
              <div>
                <Label>
                  Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={
                    reasonDialog.status === "no_show"
                      ? "e.g. Parent did not show up, no contact made"
                      : "e.g. Parent rescheduled, found another school, illness"
                  }
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  onClick={() => setReasonDialog({ open: false, tourId: null, status: "cancelled" })}
                >
                  Back
                </Button>
                <Button
                  variant={reasonDialog.status === "cancelled" ? "destructive" : "default"}
                  disabled={!reasonText.trim() || updateTourStatus.isPending}
                  onClick={submitReason}
                >
                  {updateTourStatus.isPending
                    ? "Saving..."
                    : reasonDialog.status === "no_show"
                    ? "Confirm No-show"
                    : "Confirm Cancel"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <EnrollmentIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        lead={intakeLead}
        branchId={branchId}
        onEnrolled={handleIntakeComplete}
      />
      <PreEnrollmentAssessmentDialog
        open={assessOpen}
        onOpenChange={setAssessOpen}
        lead={assessLead}
        onSaved={(payload) => {
          // If the user came here from the enrol gate, continue straight into enrolment.
          if (gateLead && gateLead.id === assessLead?.id) {
            setIntakeLead({ ...assessLead, pre_enrollment_assessment: payload });
            setIntakeOpen(true);
            setGateLead(null);
          }
          if (selectedLead && assessLead && selectedLead.id === assessLead.id) {
            setSelectedLead({ ...selectedLead, pre_enrollment_assessment: payload, pre_enrollment_assessed_at: new Date().toISOString() });
          }
        }}
      />
      <AssessmentGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        childName={gateLead?.child_name}
        onConductAssessment={() => {
          setGateOpen(false);
          setAssessLead(gateLead);
          setAssessOpen(true);
        }}
        onSkipAndEnroll={async (reason) => {
          if (gateLead) {
            try {
              await supabase
                .from("leads")
                .update({ assessment_skipped_reason: reason } as any)
                .eq("id", gateLead.id);
              await logActivity(
                gateLead.id,
                "assessment_skipped",
                `Pre-enrollment assessment skipped — Reason: ${reason}`,
                { reason },
              );
              queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
            } catch (e: any) {
              toast({ title: "Could not save skip reason", description: e.message, variant: "destructive" });
            }
          }
          setGateOpen(false);
          setIntakeLead(gateLead);
          setIntakeOpen(true);
        }}
      />
      {/* Skip-stage reason dialog */}
      <Dialog
        open={skipDialog.open}
        onOpenChange={(o) => {
          if (!o) {
            setSkipDialog({ open: false, leadId: null, fromStatus: null, toStatus: null, skipped: [] });
            setSkipReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Skipping admission stages
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              You're moving this lead from
              <span className="font-semibold text-foreground"> {skipDialog.fromStatus ? statusLabels[skipDialog.fromStatus] : ""}</span>
              {" "}straight to{" "}
              <span className="font-semibold text-foreground">{skipDialog.toStatus ? statusLabels[skipDialog.toStatus] : ""}</span>,
              skipping: <span className="font-medium text-foreground">{skipDialog.skipped.join(", ")}</span>.
            </p>
            <div>
              <Label className="text-xs">Reason for skipping *</Label>
              <Textarea
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="e.g. Parent already visited, sibling/returning student, principal approved, urgent enrollment…"
                rows={3}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                This reason will be saved in the lead's activity history.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => {
                  setSkipDialog({ open: false, leadId: null, fromStatus: null, toStatus: null, skipped: [] });
                  setSkipReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!skipReason.trim() || updateLeadStatus.isPending}
                onClick={confirmSkip}
              >
                {updateLeadStatus.isPending ? "Saving…" : "Confirm & Move"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
