import { useState, useCallback } from "react";
import ImageCropDialog from "@/components/ImageCropDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Building2, Pencil, Trash2, MapPin, Phone, Mail, Users, FileText, Upload, Image, Plus, X, GraduationCap, Clock, UserPlus, Search, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// Email settings have moved to /admin/email — see the link card below.
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Branch = Tables<"branches">;

import { AGE_GROUP_OPTIONS, inferProgramType } from "@/lib/programType";

function BranchProgramsCard({ branchId, branchSettings }: { branchId: string; branchSettings: any }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSchedule, setNewSchedule] = useState("half-day");
  const [newStartTime, setNewStartTime] = useState("08:00");
  const [newEndTime, setNewEndTime] = useState("12:00");

  const programs: any[] = Array.isArray(branchSettings?.programs_offered) ? branchSettings.programs_offered : [];

  const saveMutation = useMutation({
    mutationFn: async (updatedPrograms: any[]) => {
      if (branchSettings?.id) {
        const { error } = await supabase
          .from("branch_settings")
          .update({ programs_offered: updatedPrograms } as any)
          .eq("id", branchSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("branch_settings")
          .insert({ branch_id: branchId, programs_offered: updatedPrograms } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-settings", branchId] });
      toast({ title: "Programs updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addProgram = () => {
    if (!newName.trim()) return;
    const updated = [...programs, { name: newName.trim(), description: newDesc.trim(), schedule_type: newSchedule, start_time: newStartTime, end_time: newEndTime }];
    saveMutation.mutate(updated);
    setNewName("");
    setNewDesc("");
    setNewSchedule("half-day");
    setNewStartTime("08:00");
    setNewEndTime("12:00");
  };

  const removeProgram = (index: number) => {
    saveMutation.mutate(programs.filter((_, i) => i !== index));
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Programs Offered</CardTitle>
        <CardDescription>Configure the programs your branch offers, including operating hours. The AI assessment will use this to suggest the best program for each child.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {programs.length > 0 ? (
          <div className="space-y-2">
            {programs.map((p: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">{p.schedule_type}</Badge>
                    {(p.start_time || p.end_time) && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Clock className="h-3 w-3" />
                        {p.start_time || "—"} – {p.end_time || "—"}
                      </Badge>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeProgram(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
            No programs configured yet. Add your first program below.
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium">Add New Program</Label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="text-xs">Program Name</Label>
              <Input placeholder="e.g., Full-Day Program" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input placeholder="e.g., With enrichment activities" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Schedule Type</Label>
              <Select value={newSchedule} onValueChange={setNewSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="half-day">Half Day</SelectItem>
                  <SelectItem value="full-day">Full Day</SelectItem>
                  <SelectItem value="extended-care">Extended Care</SelectItem>
                  <SelectItem value="enrichment">Enrichment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End Time</Label>
              <Input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={addProgram} disabled={!newName.trim() || saveMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add Program
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BranchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", max_capacity: "50", is_active: true });
  const [editingSettings, setEditingSettings] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [showEditClass, setShowEditClass] = useState<any>(null);
  const [newClassForm, setNewClassForm] = useState({ class_name: "", age_group: "", program_type: "preschool" as "taska" | "preschool" });
  const [editClassForm, setEditClassForm] = useState({ class_name: "", age_group: "", program_type: "preschool" as "taska" | "preschool" });
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [createStaffForm, setCreateStaffForm] = useState({ email: "", first_name: "", last_name: "", role: "teacher" as string });
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    school_display_name: "", business_registration_no: "", address_line: "", phone: "", email: "",
    invoice_terms: "", invoice_notes: "", receipt_footer: "",
  });

  const { data: branch, isLoading } = useQuery({
    queryKey: ["branch", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*, organizations(name)").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["branch-members", id],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from("branch_memberships")
        .select("id, user_id, branch_id, created_at")
        .eq("branch_id", id!);
      if (error) throw error;

      if (!memberships || memberships.length === 0) return [];

      const userIds = memberships.map((m) => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

      return memberships.map((membership) => ({
        ...membership,
        profile: profileById.get(membership.user_id) ?? null,
      }));
    },
    enabled: !!id,
  });

  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings", id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("*").eq("branch_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  // All staff (non-parent profiles) for the "Add Existing Staff" picker
  const { data: allStaff = [] } = useQuery({
    queryKey: ["all-staff-profiles"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      return (profiles ?? []).filter((p: any) => roleMap.get(p.id) && roleMap.get(p.id) !== "parent")
        .map((p: any) => ({ ...p, role: roleMap.get(p.id) }));
    },
    enabled: !!id,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("branch_memberships").insert({ user_id: userId, branch_id: id! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-members", id] });
      toast({ title: "Staff added to branch" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.from("branch_memberships").delete().eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-members", id] });
      toast({ title: "Removed from branch", description: "The staff account remains active." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleCreateStaff = async () => {
    if (!createStaffForm.email || !createStaffForm.first_name || !id) return;
    setCreatingStaff(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { ...createStaffForm, branch_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Staff created", description: `Temporary password: ${data.temporary_password}` });
      setShowCreateStaff(false);
      setCreateStaffForm({ email: "", first_name: "", last_name: "", role: "teacher" });
      queryClient.invalidateQueries({ queryKey: ["branch-members", id] });
      queryClient.invalidateQueries({ queryKey: ["all-staff-profiles"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setCreatingStaff(false);
  };

  // Fetch classes from the classes table (single source of truth)
  const { data: branchClasses = [] } = useQuery({
    queryKey: ["branch-classes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group, is_active, program_type")
        .eq("branch_id", id!)
        .order("class_name");
      return data ?? [];
    },
    enabled: !!id,
  });

  // Count students per class
  const { data: studentCounts = {} } = useQuery({
    queryKey: ["class-student-counts", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("class_id")
        .eq("branch_id", id!)
        .eq("is_active", true);
      const counts: Record<string, number> = {};
      data?.forEach((s: any) => {
        if (s.class_id) counts[s.class_id] = (counts[s.class_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Branch>) => {
      const { error } = await supabase.from("branches").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch", id] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      setEditing(false);
      toast({ title: "Branch updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("branches").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      navigate("/branches");
      toast({ title: "Branch deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (branchSettings) {
        const { error } = await supabase.from("branch_settings").update({ ...settingsForm }).eq("id", branchSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branch_settings").insert({ branch_id: id!, ...settingsForm });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-settings", id] });
      setEditingSettings(false);
      toast({ title: "Invoice settings saved" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addClassMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classes").insert({
        branch_id: id!,
        class_name: newClassForm.class_name.trim(),
        age_group: newClassForm.age_group || "Mixed",
        program_type: newClassForm.program_type,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-classes", id] });
      setShowAddClass(false);
      setNewClassForm({ class_name: "", age_group: "", program_type: "preschool" });
      toast({ title: "Class created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateClassMutation = useMutation({
    mutationFn: async ({ classId, updates }: { classId: string; updates: any }) => {
      const { error } = await supabase.from("classes").update(updates).eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-classes", id] });
      setShowEditClass(null);
      toast({ title: "Class updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase.from("classes").delete().eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-classes", id] });
      toast({ title: "Class deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = () => {
    if (branch) setForm({
      name: branch.name,
      email: branch.email || "",
      phone: branch.phone || "",
      address: branch.address || "",
      max_capacity: String(branch.max_capacity || 50),
      is_active: branch.is_active,
    });
    setEditing(true);
  };

  const startEditSettings = () => {
    setSettingsForm({
      school_display_name: branchSettings?.school_display_name || "",
      business_registration_no: branchSettings?.business_registration_no || "",
      address_line: branchSettings?.address_line || "",
      phone: branchSettings?.phone || "",
      email: branchSettings?.email || "",
      invoice_terms: branchSettings?.invoice_terms || "",
      invoice_notes: branchSettings?.invoice_notes || "",
      receipt_footer: branchSettings?.receipt_footer || "",
    });
    setEditingSettings(true);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => setCropImageSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCroppedLogo = async (blob: Blob) => {
    if (!id) return;
    setCropImageSrc(null);
    setUploadingLogo(true);
    try {
      const path = `branch-logos/${id}/logo.png`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

      if (branchSettings) {
        await supabase.from("branch_settings").update({ logo_url: urlWithCacheBust }).eq("id", branchSettings.id);
      } else {
        await supabase.from("branch_settings").insert({ branch_id: id, logo_url: urlWithCacheBust });
      }
      queryClient.invalidateQueries({ queryKey: ["branch-settings", id] });
      toast({ title: "Logo uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  if (isLoading) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>;
  if (!branch) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Branch not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/branches")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{branch.name}</h1>
            <p className="text-sm text-muted-foreground">{(branch as any).organizations?.name}</p>
          </div>
          <Badge variant={branch.is_active ? "default" : "outline"} className={branch.is_active ? "bg-accent text-accent-foreground" : ""}>
            {branch.is_active ? "Active" : "Inactive"}
          </Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete {branch.name}. All memberships will be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {editing ? (
          <Card>
            <CardHeader><CardTitle>Edit Branch</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Max Capacity</Label><Input type="number" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate({ name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null, max_capacity: parseInt(form.max_capacity) || 50, is_active: form.is_active })} disabled={!form.name || updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {branch.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{branch.email}</p>}
                {branch.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{branch.phone}</p>}
                {branch.address && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{branch.address}</p>}
                <p className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" />Capacity: {branch.max_capacity}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Members</CardTitle>
                  <CardDescription>Staff assigned to manage this branch.</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary">{members.length}</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setMemberSearch(""); setShowAddMember(true); }}>
                      <UserPlus className="h-3 w-3 mr-1" />Add Existing
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreateStaff(true)}>
                      <Plus className="h-3 w-3 mr-1" />New Staff
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                    No members assigned yet. Use <strong>Add Existing</strong> to attach a staff member who already manages another branch, or <strong>New Staff</strong> to create a fresh account.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                          {(m as any).profile?.first_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {(m as any).profile?.first_name} {(m as any).profile?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{(m as any).profile?.email}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMemberMutation.mutate(m.id)} title="Remove from branch">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Classes — using classes table */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Classes</CardTitle>
                  <CardDescription>Manage classes for this branch. These are used in Students, Timetables, and Lesson Planning.</CardDescription>
                </div>
                <Button size="sm" onClick={() => { setNewClassForm({ class_name: "", age_group: "", program_type: "preschool" }); setShowAddClass(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Class
                </Button>
              </CardHeader>
              <CardContent>
                {branchClasses.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                    <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No classes created yet.</p>
                    <p className="text-xs mt-1">Classes you create here will appear in Students, Timetables, and Lesson Planning.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {branchClasses.map((cls: any) => (
                      <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-foreground">{cls.class_name}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{cls.age_group}</Badge>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${cls.program_type === "taska" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200"}`}
                            >
                              {cls.program_type === "taska" ? "Taska" : "Preschool"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{(studentCounts as any)[cls.id] || 0} students</span>
                            {!cls.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                            setEditClassForm({ class_name: cls.class_name, age_group: cls.age_group, program_type: (cls.program_type as any) ?? inferProgramType(cls.age_group) });
                            setShowEditClass(cls);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{cls.class_name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {(studentCounts as any)[cls.id] > 0
                                    ? `This class has ${(studentCounts as any)[cls.id]} students assigned. They will become unassigned.`
                                    : "This class has no students assigned. It will be permanently removed."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteClassMutation.mutate(cls.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Class Dialog */}
            <Dialog open={showAddClass} onOpenChange={setShowAddClass}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Class</DialogTitle>
                  <DialogDescription>Create a class for this branch.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Class Name</Label>
                    <Input placeholder="e.g. Tadika Bintang, Preschool A" value={newClassForm.class_name} onChange={(e) => setNewClassForm({ ...newClassForm, class_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Age Group</Label>
                    <Select value={newClassForm.age_group} onValueChange={(v) => setNewClassForm({ ...newClassForm, age_group: v, program_type: inferProgramType(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select age group" /></SelectTrigger>
                      <SelectContent>
                        {AGE_GROUP_OPTIONS.map((ag) => (
                          <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Program Type</Label>
                    <Select value={newClassForm.program_type} onValueChange={(v) => setNewClassForm({ ...newClassForm, program_type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taska">Taska (Childcare, Age 1–2)</SelectItem>
                        <SelectItem value="preschool">Preschool (Age 3–6)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-set from age group; override if needed.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addClassMutation.mutate()} disabled={!newClassForm.class_name.trim() || addClassMutation.isPending}>
                    {addClassMutation.isPending ? "Creating..." : "Create Class"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Class Dialog */}
            <Dialog open={!!showEditClass} onOpenChange={(open) => { if (!open) setShowEditClass(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Class</DialogTitle>
                  <DialogDescription>Update class details.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Class Name</Label>
                    <Input value={editClassForm.class_name} onChange={(e) => setEditClassForm({ ...editClassForm, class_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Age Group</Label>
                    <Select value={editClassForm.age_group} onValueChange={(v) => setEditClassForm({ ...editClassForm, age_group: v, program_type: inferProgramType(v) })}>
                      <SelectTrigger><SelectValue placeholder="Select age group" /></SelectTrigger>
                      <SelectContent>
                        {AGE_GROUP_OPTIONS.map((ag) => (
                          <SelectItem key={ag} value={ag}>{ag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Program Type</Label>
                    <Select value={editClassForm.program_type} onValueChange={(v) => setEditClassForm({ ...editClassForm, program_type: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taska">Taska (Childcare, Age 1–2)</SelectItem>
                        <SelectItem value="preschool">Preschool (Age 3–6)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showEditClass?.is_active ?? true}
                      onCheckedChange={(v) => setShowEditClass({ ...showEditClass, is_active: v })}
                    />
                    <Label>Active</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => updateClassMutation.mutate({
                    classId: showEditClass.id,
                    updates: { class_name: editClassForm.class_name.trim(), age_group: editClassForm.age_group, is_active: showEditClass.is_active, program_type: editClassForm.program_type },
                  })} disabled={!editClassForm.class_name.trim() || updateClassMutation.isPending}>
                    {updateClassMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Invoice Branding Settings */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice Settings</CardTitle>
                <Button variant="outline" size="sm" onClick={startEditSettings}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
              </CardHeader>
              <CardContent>
                {/* Logo Upload Section */}
                <div className="flex items-center gap-4 mb-6 pb-4 border-b">
                  {branchSettings?.logo_url ? (
                    <img src={branchSettings.logo_url} alt="School logo" className="w-16 h-16 rounded-lg border object-contain bg-white" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed flex items-center justify-center bg-muted/30">
                      <Image className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium">School Logo</p>
                    <p className="text-xs text-muted-foreground">Appears on invoices and receipts. Recommended: 200×200px, PNG or JPG.</p>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <Button variant="outline" size="sm" asChild disabled={uploadingLogo}>
                        <span><Upload className="h-3 w-3 mr-1" />{uploadingLogo ? "Uploading…" : branchSettings?.logo_url ? "Change Logo" : "Upload Logo"}</span>
                      </Button>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>
                  </div>
                </div>

                {editingSettings ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><Label>School Display Name</Label><Input value={settingsForm.school_display_name} onChange={e => setSettingsForm({...settingsForm, school_display_name: e.target.value})} placeholder="e.g. Little Stars Academy" /></div>
                      <div><Label>Business Registration No.</Label><Input value={settingsForm.business_registration_no} onChange={e => setSettingsForm({...settingsForm, business_registration_no: e.target.value})} placeholder="e.g. 202301012345" /></div>
                      <div><Label>Invoice Address</Label><Input value={settingsForm.address_line} onChange={e => setSettingsForm({...settingsForm, address_line: e.target.value})} placeholder="Full address for invoice header" /></div>
                      <div><Label>Invoice Phone</Label><Input value={settingsForm.phone} onChange={e => setSettingsForm({...settingsForm, phone: e.target.value})} /></div>
                      <div><Label>Invoice Email</Label><Input value={settingsForm.email} onChange={e => setSettingsForm({...settingsForm, email: e.target.value})} /></div>
                    </div>
                    <div><Label>Terms & Conditions</Label><Textarea value={settingsForm.invoice_terms} onChange={e => setSettingsForm({...settingsForm, invoice_terms: e.target.value})} placeholder="Payment terms displayed on invoices" rows={3} /></div>
                    <div><Label>Default Invoice Notes</Label><Textarea value={settingsForm.invoice_notes} onChange={e => setSettingsForm({...settingsForm, invoice_notes: e.target.value})} placeholder="Default notes for new invoices" rows={2} /></div>
                    <div><Label>Receipt Footer</Label><Textarea value={settingsForm.receipt_footer} onChange={e => setSettingsForm({...settingsForm, receipt_footer: e.target.value})} placeholder="Custom footer text for receipts" rows={2} /></div>
                    <div className="flex gap-2">
                      <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>{saveSettingsMutation.isPending ? "Saving..." : "Save Settings"}</Button>
                      <Button variant="outline" onClick={() => setEditingSettings(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">School Name:</span> {branchSettings?.school_display_name || <span className="text-muted-foreground italic">Not set</span>}</p>
                    <p><span className="text-muted-foreground">Reg. No:</span> {branchSettings?.business_registration_no || <span className="text-muted-foreground italic">Not set</span>}</p>
                    <p><span className="text-muted-foreground">Address:</span> {branchSettings?.address_line || <span className="text-muted-foreground italic">Not set</span>}</p>
                    {branchSettings?.invoice_terms && <p><span className="text-muted-foreground">Terms:</span> {branchSettings.invoice_terms.substring(0, 100)}{branchSettings.invoice_terms.length > 100 ? "…" : ""}</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Programs Offered */}
            <BranchProgramsCard branchId={id!} branchSettings={branchSettings} />

            {/* Email settings moved to a unified hub */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Email Communication
                  </CardTitle>
                  <CardDescription>
                    Sender name, brand color, footer and notification templates now live in one place.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/email?tab=branch&branch=${id}`)}>
                  Open email settings
                </Button>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {cropImageSrc && (
        <ImageCropDialog
          open={!!cropImageSrc}
          onClose={() => setCropImageSrc(null)}
          imageSrc={cropImageSrc}
          onCropComplete={handleCroppedLogo}
          aspect={1}
          title="Crop School Logo"
        />
      )}

      {/* Add Existing Staff dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Existing Staff to {branch?.name}</DialogTitle>
            <DialogDescription>
              Pick a staff member who already has an account. They keep one login and gain access to this branch.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or email..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {(() => {
              const memberIds = new Set(members.map((m: any) => m.user_id));
              const candidates = (allStaff as any[])
                .filter((s) => !memberIds.has(s.id))
                .filter((s) => {
                  const q = memberSearch.toLowerCase();
                  if (!q) return true;
                  return `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(q);
                });
              if (candidates.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-6">No matching staff. Try "New Staff" instead.</p>;
              }
              return candidates.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email} · {s.role}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addMemberMutation.mutate(s.id)} disabled={addMemberMutation.isPending}>
                    Add
                  </Button>
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMember(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Staff dialog */}
      <Dialog open={showCreateStaff} onOpenChange={setShowCreateStaff}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Staff for {branch?.name}</DialogTitle>
            <DialogDescription>A new login will be created and attached to this branch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name</Label><Input value={createStaffForm.first_name} onChange={(e) => setCreateStaffForm({ ...createStaffForm, first_name: e.target.value })} /></div>
              <div><Label>Last Name</Label><Input value={createStaffForm.last_name} onChange={(e) => setCreateStaffForm({ ...createStaffForm, last_name: e.target.value })} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={createStaffForm.email} onChange={(e) => setCreateStaffForm({ ...createStaffForm, email: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={createStaffForm.role} onValueChange={(v) => setCreateStaffForm({ ...createStaffForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="franchisee">Branch Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateStaff(false)}>Cancel</Button>
            <Button onClick={handleCreateStaff} disabled={creatingStaff || !createStaffForm.email || !createStaffForm.first_name}>
              {creatingStaff ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
