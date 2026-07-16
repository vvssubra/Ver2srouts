import { useState, useEffect, lazy, Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { programLabel, programBadgeVariant } from "@/lib/programType";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, Upload, User, Heart, Users, FileText, Save, Loader2, BarChart3, Mail, Copy, Check, Clock, X, Send, Link2, MessageCircle, DollarSign, GraduationCap, Star, BookOpen, ClipboardCheck, History, TrendingUp, Sparkles } from "lucide-react";
const StudentBillingProfile = lazy(() => import("@/components/finance/StudentBillingProfile"));
import StudentProgressTab from "@/components/student/StudentProgressTab";
import ChildHeroBar from "@/components/student/ChildHeroBar";
import StudentLifecycleTab from "@/components/student/StudentLifecycleTab";
import StudentStatusMenu, { StatusBadge, type EnrollmentStatus } from "@/components/student/StudentStatusMenu";
import UnifiedMomentsFeed from "@/components/daily-updates/UnifiedMomentsFeed";
import AddParentDialog, { type AddParentPrefill } from "@/components/AddParentDialog";
import FamilyMemberRow, { type FamilyMember } from "@/components/family/FamilyMemberRow";
import StudentFamilyTab from "@/components/student/StudentFamilyTab";
import TeacherFamilyView from "@/components/student/TeacherFamilyView";
import StudentAttendanceTab from "@/components/student/StudentAttendanceTab";
import StudentBillingHistory from "@/components/student/StudentBillingHistory";
import { TeacherNextFocusCard } from "@/components/teacher/TeacherNextFocusCard";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { compareClasses } from "@/lib/class-sort";

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const isReadOnly = isTeacher; // teachers can view but not edit
  const [uploading, setUploading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "story";
  // Legacy URLs used separate academic/growth/assessments tabs — fold them
  // all into the unified Progress hub.
  const LEGACY_TAB_REMAP: Record<string, string> = {
    academic: "progress",
    growth: "progress",
    assessments: "progress",
  };
  const initialTab = LEGACY_TAB_REMAP[rawTab] ?? rawTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  // Sub-view inside the Progress tab — let the hero bar deep-link into
  // Snapshot / Growth / Assessments.
  const [progressView, setProgressView] = useState<"snapshot" | "growth" | "assessments">("snapshot");

  // Keep ?tab=... in sync (so back-from-invoice can deep-link Billing tab).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeTab === "story") next.delete("tab"); else next.set("tab", activeTab);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // If the URL changes externally (e.g. user opens /students/:id?tab=billing) reflect it.
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) {
      const resolved = LEGACY_TAB_REMAP[t] ?? t;
      if (resolved !== activeTab) setActiveTab(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [addParentPrefill, setAddParentPrefill] = useState<AddParentPrefill | null>(null);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Teacher access scoping — hook must run on every render (cannot be after
  // early-return). Admins/principals/franchisee/super_admin pass through
  // because useTeacherClasses returns teacherClassIds = null for them.
  const { teacherClassIds, isTeacher: isAssignedTeacher } = useTeacherClasses((student as any)?.branch_id);

  const { data: parentLinks } = useQuery({
    queryKey: ["student-parents", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_students")
        .select("id, parent_id, status, profiles(first_name, last_name, email)")
        .eq("student_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  // Richer family roster (relation, is_primary, onboarding status)
  const { data: family } = useQuery({
    queryKey: ["student-family", id],
    enabled: !!id && !!student?.branch_id,
    queryFn: async (): Promise<FamilyMember[]> => {
      const { data: links } = await supabase
        .from("parent_students")
        .select("id, parent_id, status, relation, is_primary, created_via")
        .eq("student_id", id!)
        .eq("status", "approved");
      const linkRows = links ?? [];
      if (linkRows.length === 0) return [];
      const parentIds = linkRows.map((l: any) => l.parent_id);
      const [{ data: profiles }, { data: onboarding }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone, must_change_password")
          .in("id", parentIds),
        supabase
          .from("parent_onboarding_state")
          .select(
            "parent_id, password_changed_at, profile_completed_at, tnc_accepted_at, handbook_accepted_at, completed_at"
          )
          .in("parent_id", parentIds)
          .eq("branch_id", student!.branch_id),
      ]);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const omap = new Map((onboarding ?? []).map((o: any) => [o.parent_id, o]));
      return linkRows.map((l: any) => {
        const p = pmap.get(l.parent_id) || {};
        return {
          link_id: l.id,
          parent_id: l.parent_id,
          relation: l.relation,
          is_primary: l.is_primary,
          created_via: l.created_via,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          must_change_password: p.must_change_password ?? null,
          onboarding: omap.get(l.parent_id) ?? null,
        };
      });
    },
  });

  const { data: pendingInvites } = useQuery({
    queryKey: ["student-invites", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_invitations" as any)
        .select("*")
        .eq("student_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings", student?.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("*").eq("branch_id", student!.branch_id).maybeSingle();
      return data;
    },
    enabled: !!student?.branch_id,
  });

  // Real classes from this branch — only show classrooms that actually exist here.
  // Anything else is treated as "Unassigned".
  const { data: branchClasses = [] } = useQuery({
    queryKey: ["branch-classes-for-student", student?.branch_id],
    enabled: !!student?.branch_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group, is_active")
        .eq("branch_id", student!.branch_id)
        .eq("is_active", true);
      return (data ?? []).slice().sort(compareClasses);
    },
  });

  const UNASSIGNED = "__unassigned__";
  const currentClassInBranch = branchClasses.some((c: any) => c.id === (student as any)?.class_id || c.class_name === student?.class_name);

  const currentMonth = new Date();
  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: monthlyAttendance } = useQuery({
    queryKey: ["student-attendance", id, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("date, status")
        .eq("student_id", id!)
        .gte("date", monthStart)
        .lte("date", monthEnd);
      return data ?? [];
    },
    enabled: !!id,
  });

  const attendanceStats = (() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    monthlyAttendance?.forEach((r: any) => {
      counts[r.status as keyof typeof counts]++;
      counts.total++;
    });
    return counts;
  })();

  const [form, setForm] = useState<Record<string, any>>({});
  const [formInit, setFormInit] = useState<string | null>(null);

  if (student && formInit !== id) {
    setForm({
      first_name: student.first_name ?? "",
      last_name: student.last_name ?? "",
      date_of_birth: student.date_of_birth ?? "",
      gender: student.gender ?? "",
      class_name: student.class_name ?? "",
      photo_url: (student as any).photo_url ?? "",
      nationality: (student as any).nationality ?? "",
      race: (student as any).race ?? "",
      religion: (student as any).religion ?? "",
      birth_cert_no: (student as any).birth_cert_no ?? "",
      mykid_no: (student as any).mykid_no ?? "",
      home_address: (student as any).home_address ?? "",
      enrollment_date: (student as any).enrollment_date ?? "",
      notes: (student as any).notes ?? "",
      allergies: student.allergies ?? "",
      medical_conditions: student.medical_conditions ?? "",
      blood_type: student.blood_type ?? "",
      dietary_notes: student.dietary_notes ?? "",
      emergency_contact_name: student.emergency_contact_name ?? "",
      emergency_contact_phone: student.emergency_contact_phone ?? "",
      emergency_contact_relation: (student as any).emergency_contact_relation ?? "",
      father_name: (student as any).father_name ?? "",
      father_ic: (student as any).father_ic ?? "",
      father_phone: (student as any).father_phone ?? "",
      father_occupation: (student as any).father_occupation ?? "",
      father_email: (student as any).father_email ?? "",
      mother_name: (student as any).mother_name ?? "",
      mother_ic: (student as any).mother_ic ?? "",
      mother_phone: (student as any).mother_phone ?? "",
      mother_occupation: (student as any).mother_occupation ?? "",
      mother_email: (student as any).mother_email ?? "",
      extra_emergency_contacts: Array.isArray((student as any).extra_emergency_contacts)
        ? (student as any).extra_emergency_contacts
        : [],
    });
    setFormInit(id!);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Resolve class_id from selected class_name (or unset for unassigned)
      let resolvedClassId: string | null = (student as any)?.class_id ?? null;
      if (!form.class_name) {
        resolvedClassId = null;
      } else {
        const match = branchClasses.find((c: any) => c.class_name === form.class_name);
        resolvedClassId = match ? match.id : null;
      }
      const { error } = await supabase.from("students").update({
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        class_name: form.class_name || null,
        class_id: resolvedClassId,
        photo_url: form.photo_url || null,
        nationality: form.nationality || null,
        race: form.race || null,
        religion: form.religion || null,
        birth_cert_no: form.birth_cert_no || null,
        mykid_no: form.mykid_no || null,
        home_address: form.home_address || null,
        enrollment_date: form.enrollment_date || null,
        notes: form.notes || null,
        allergies: form.allergies || null,
        medical_conditions: form.medical_conditions || null,
        blood_type: form.blood_type || null,
        dietary_notes: form.dietary_notes || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_relation: form.emergency_contact_relation || null,
        father_name: form.father_name || null,
        father_ic: form.father_ic || null,
        father_phone: form.father_phone || null,
        father_occupation: form.father_occupation || null,
        father_email: form.father_email || null,
        mother_name: form.mother_name || null,
        mother_ic: form.mother_ic || null,
        mother_phone: form.mother_phone || null,
        mother_occupation: form.mother_occupation || null,
        mother_email: form.mother_email || null,
        extra_emergency_contacts: Array.isArray(form.extra_emergency_contacts) ? form.extra_emergency_contacts : [],
      } as any).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-detail", id] });
      toast({ title: "Student profile saved ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Invite parent mutation
  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.from("parent_invitations" as any).insert({
        branch_id: student!.branch_id,
        student_id: id,
        email: email.trim().toLowerCase(),
      }).select().single();
      if (error) throw error;
      // Send email via edge function
      await supabase.functions.invoke("send-parent-invite", {
        body: {
          email: email.trim().toLowerCase(),
          studentName: `${student!.first_name} ${student!.last_name}`,
          branchName: "School",
          token: (data as any).token,
          branchId: student!.branch_id,
          accessCode: (student as any).student_access_code,
        },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-invites", id] });
      setInviteEmail("");
      toast({ title: "Invitation sent 📧", description: "Parent will receive an email invitation." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Approve/reject parent request
  const updateLinkMutation = useMutation({
    mutationFn: async ({ linkId, status }: { linkId: string; status: string }) => {
      if (status === "approved") {
        const { error } = await supabase.from("parent_students").update({ status: "approved" } as any).eq("id", linkId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parent_students").delete().eq("id", linkId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-parents", id] });
      toast({ title: "Parent link updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Revoke a pending parent invitation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("parent_invitations" as any).delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-invites", id] });
      toast({ title: "Invitation revoked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Unlink an approved parent
  const unlinkParentMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("parent_students").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-parents", id] });
      toast({ title: "Parent unlinked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `student-photos/${id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f: any) => ({ ...f, photo_url: publicUrl }));
      toast({ title: "Photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const copyAccessCode = () => {
    const code = (student as any)?.student_access_code;
    if (code) {
      navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const updateField = (field: string, value: any) => setForm((f: any) => ({ ...f, [field]: value }));

  if (isLoading) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>;
  if (!student) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Student not found</div></DashboardLayout>;

  if (
    isAssignedTeacher &&
    teacherClassIds &&
    teacherClassIds.length > 0 &&
    (!(student as any).class_id || !teacherClassIds.includes((student as any).class_id))
  ) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          You don't have access to this student. Only children in your assigned classes are visible.
        </div>
      </DashboardLayout>
    );
  }

  const approvedParents = parentLinks?.filter((pl: any) => pl.status === "approved") ?? [];
  const pendingParents = parentLinks?.filter((pl: any) => pl.status === "pending") ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back link */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/students")} className="-ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Student Directory
        </Button>

        {/* Hero card */}
        <Card className="overflow-hidden border-border/60">
          <div className="relative h-20 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
          <CardContent className="-mt-14 pb-5">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              {/* Avatar with overlay upload */}
              <div className="relative shrink-0 mx-auto md:mx-0">
                {form.photo_url ? (
                  <img src={form.photo_url} alt={form.first_name} className="h-28 w-28 rounded-2xl object-cover ring-4 ring-card shadow-md" />
                ) : (
                  <div className="h-28 w-28 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold text-3xl ring-4 ring-card shadow-md">
                    {student.first_name?.[0]}{student.last_name?.[0]}
                  </div>
                )}
                {!isReadOnly && (
                  <label className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-card border border-border shadow-sm p-1.5 hover:bg-muted transition" title="Upload photo">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                  </label>
                )}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 text-center md:text-left">
                <h1 className="text-2xl font-bold text-foreground truncate">{student.first_name} {student.last_name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center justify-center md:justify-start gap-1.5 text-xs">
                  {currentClassInBranch && student.class_name ? (
                    <Badge variant="outline" className="gap-1"><GraduationCap className="h-3 w-3" />{student.class_name}</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">Unassigned</Badge>
                  )}
                  {(student as any).program_type && (
                    <Badge variant={programBadgeVariant((student as any).program_type)}>
                      {programLabel((student as any).program_type)}
                    </Badge>
                  )}
                  <StatusBadge status={((student as any).enrollment_status ?? (student.is_active ? "active" : "withdrawn")) as EnrollmentStatus} />
                  {student.date_of_birth && (
                    <span className="text-muted-foreground">· DOB {format(new Date(student.date_of_birth), "dd MMM yyyy")}</span>
                  )}
                </div>
              </div>

              {/* Quick stats + actions */}
              <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end">
                <div className="hidden sm:flex rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                  <div className="px-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">This month</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {attendanceStats.total > 0
                        ? `${Math.round(((attendanceStats.present + attendanceStats.late) / attendanceStats.total) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="px-2 border-l border-border">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Family</p>
                    <p className="text-sm font-semibold tabular-nums">{family?.length ?? 0}</p>
                  </div>
                </div>
                {!isTeacher && (
                  <StudentStatusMenu
                    studentId={student.id}
                    currentStatus={((student as any).enrollment_status ?? (student.is_active ? "active" : "withdrawn")) as EnrollmentStatus}
                    variant="button"
                  />
                )}
                {!isReadOnly && (
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1">
                  {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving</> : <><Save className="h-4 w-4" />Save</>}
                </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <ChildHeroBar
          studentId={student.id}
          classId={(student as any).class_id ?? null}
          enrollmentDate={(student as any).enrollment_date ?? null}
          onJumpToProgress={(view) => {
            setProgressView(view);
            setActiveTab("progress");
          }}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="-mx-4 px-4 overflow-x-auto md:mx-0 md:px-0">
            <TabsList className="inline-flex w-auto whitespace-nowrap md:flex md:w-full">
              <TabsTrigger value="story"><Star className="h-3.5 w-3.5 mr-1" />Journal</TabsTrigger>
              <TabsTrigger value="profile"><User className="h-3.5 w-3.5 mr-1" />Profile</TabsTrigger>
              <TabsTrigger value="family"><Users className="h-3.5 w-3.5 mr-1" />Family</TabsTrigger>
              <TabsTrigger value="progress"><Sparkles className="h-3.5 w-3.5 mr-1" />Progress</TabsTrigger>
              <TabsTrigger value="attendance"><BarChart3 className="h-3.5 w-3.5 mr-1" />Attendance</TabsTrigger>
              {!isTeacher && <TabsTrigger value="billing"><DollarSign className="h-3.5 w-3.5 mr-1" />Billing</TabsTrigger>}
              {!isTeacher && <TabsTrigger value="lifecycle"><History className="h-3.5 w-3.5 mr-1" />Lifecycle</TabsTrigger>}
            </TabsList>
          </div>

          {/* Journal Tab — child's single learning journal */}
          <TabsContent value="story" className="space-y-4">
            {id && (
              <UnifiedMomentsFeed
                studentId={id}
                embedded
                initialClassId={(student as any)?.class_id ?? null}
              />
            )}
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Personal Information</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label>First Name</Label><Input value={form.first_name ?? ""} onChange={(e) => updateField("first_name", e.target.value)} disabled={isReadOnly} /></div>
                <div><Label>Last Name</Label><Input value={form.last_name ?? ""} onChange={(e) => updateField("last_name", e.target.value)} disabled={isReadOnly} /></div>
                <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => updateField("date_of_birth", e.target.value)} disabled={isReadOnly} /></div>
                <div>
                  <Label>Gender</Label>
                  <Select value={form.gender ?? ""} onValueChange={(v) => updateField("gender", v)} disabled={isReadOnly}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male / Lelaki</SelectItem>
                      <SelectItem value="female">Female / Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class</Label>
                  <Select
                    value={form.class_name && branchClasses.some((c: any) => c.class_name === form.class_name) ? form.class_name : UNASSIGNED}
                    onValueChange={(v) => updateField("class_name", v === UNASSIGNED ? "" : v)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {branchClasses.map((c: any) => (
                        <SelectItem key={c.id} value={c.class_name}>
                          {c.class_name}{c.age_group ? ` · ${c.age_group}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!currentClassInBranch && student.class_name && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      Current class "{student.class_name}" is not configured for this branch. Reassign or leave Unassigned.
                    </p>
                  )}
                </div>
                <div><Label>Enrollment Date</Label><Input type="date" value={form.enrollment_date ?? ""} onChange={(e) => updateField("enrollment_date", e.target.value)} disabled={isReadOnly} /></div>
                <div><Label>Nationality</Label><Input value={form.nationality ?? ""} onChange={(e) => updateField("nationality", e.target.value)} placeholder="e.g. Malaysian" disabled={isReadOnly} /></div>
                <div><Label>Race</Label><Input value={form.race ?? ""} onChange={(e) => updateField("race", e.target.value)} placeholder="e.g. Malay, Chinese, Indian" disabled={isReadOnly} /></div>
                <div><Label>Religion</Label><Input value={form.religion ?? ""} onChange={(e) => updateField("religion", e.target.value)} placeholder="e.g. Islam, Buddhist" disabled={isReadOnly} /></div>
                <div><Label>Birth Certificate No.</Label><Input value={form.birth_cert_no ?? ""} onChange={(e) => updateField("birth_cert_no", e.target.value)} disabled={isReadOnly} /></div>
                <div><Label>MyKid No.</Label><Input value={form.mykid_no ?? ""} onChange={(e) => updateField("mykid_no", e.target.value)} disabled={isReadOnly} /></div>
                <div className="sm:col-span-2"><Label>Home Address</Label><Textarea value={form.home_address ?? ""} onChange={(e) => updateField("home_address", e.target.value)} rows={2} disabled={isReadOnly} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Heart className="h-4 w-4 text-destructive" />Health & Medical</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label>Blood Type</Label><Input value={form.blood_type ?? ""} onChange={(e) => updateField("blood_type", e.target.value)} placeholder="e.g. A+, O-" disabled={isReadOnly} /></div>
                <div><Label>Dietary Notes</Label><Input value={form.dietary_notes ?? ""} onChange={(e) => updateField("dietary_notes", e.target.value)} placeholder="e.g. Halal, vegetarian" disabled={isReadOnly} /></div>
                <div className="sm:col-span-2"><Label>Allergies</Label><Textarea value={form.allergies ?? ""} onChange={(e) => updateField("allergies", e.target.value)} placeholder="e.g. Peanuts, shellfish, dust" rows={2} disabled={isReadOnly} /></div>
                <div className="sm:col-span-2"><Label>Medical Conditions</Label><Textarea value={form.medical_conditions ?? ""} onChange={(e) => updateField("medical_conditions", e.target.value)} placeholder="e.g. Asthma, eczema" rows={2} disabled={isReadOnly} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />General Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Any general notes about this student..."
                  rows={5}
                  disabled={isReadOnly}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Family Tab */}
          <TabsContent value="family" className="space-y-4">
            {isTeacher ? (
              <TeacherFamilyView
                family={family ?? []}
                form={form}
                emergencyContacts={[
                  ...((form.emergency_contact_name || form.emergency_contact_phone) ? [{
                    name: form.emergency_contact_name,
                    phone: form.emergency_contact_phone,
                    relation: form.emergency_contact_relation,
                    primary: true,
                  }] : []),
                  ...((form.extra_emergency_contacts ?? []) as any[]).map((c: any) => ({ ...c, primary: false })),
                ]}
              />
            ) : (
            <StudentFamilyTab
              studentId={id!}
              branchId={student!.branch_id}
              form={form}
              updateField={updateField}
              family={family}
              pendingParents={pendingParents}
              onAddParent={(prefill) => {
                setAddParentPrefill(prefill ?? null);
                setAddParentOpen(true);
              }}
              onApprovePending={(linkId) => updateLinkMutation.mutate({ linkId, status: "approved" })}
              onRejectPending={(linkId) => updateLinkMutation.mutate({ linkId, status: "rejected" })}
              extraContacts={form.extra_emergency_contacts ?? []}
              onExtraContactsChange={(next) => updateField("extra_emergency_contacts", next)}
            />
            )}
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="space-y-4">
            <StudentAttendanceTab studentId={id!} branchId={student.branch_id} />
          </TabsContent>

          {/* Billing Profile Tab */}
          {!isTeacher && <TabsContent value="billing" className="space-y-4">
            {student && (
              <>
                <Suspense fallback={<div className="text-sm text-muted-foreground py-4 text-center">Loading billing profile…</div>}>
                  <StudentBillingProfile studentId={student.id} branchId={student.branch_id} />
                </Suspense>
                <StudentBillingHistory studentId={student.id} />
              </>
            )}
          </TabsContent>}

          <TabsContent value="progress" className="space-y-4">
            {student && (
              <>
                <TeacherNextFocusCard
                  studentId={student.id}
                  classId={(student as any).class_id ?? null}
                  branchId={student.branch_id}
                  studentFirstName={student.first_name}
                />
                <StudentProgressTab
                studentId={student.id}
                classId={(student as any).class_id ?? null}
                branchId={student.branch_id}
                view={progressView}
                onViewChange={setProgressView}
                />
              </>
            )}
          </TabsContent>

          {!isTeacher && <TabsContent value="lifecycle" className="space-y-4">
            {student && (
              <StudentLifecycleTab
                studentId={student.id}
                currentStatus={((student as any).enrollment_status ?? (student.is_active ? "active" : "withdrawn")) as EnrollmentStatus}
                statusReason={(student as any).status_reason}
                statusChangedAt={(student as any).status_changed_at}
              />
            )}
          </TabsContent>}
        </Tabs>
        {student && (
          <AddParentDialog
            open={addParentOpen}
            onOpenChange={(o) => {
              setAddParentOpen(o);
              if (!o) setAddParentPrefill(null);
            }}
            studentId={student.id}
            branchId={student.branch_id}
            studentName={`${student.first_name} ${student.last_name}`}
            prefill={addParentPrefill}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
