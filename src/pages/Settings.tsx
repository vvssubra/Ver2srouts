import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Save, Loader2, User, Briefcase, Moon, Globe, Bell, AlertTriangle, ShieldCheck, Lock, KeyRound, Palette, Image as ImageIcon, Wallet, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import StaffProfileForm from "@/components/StaffProfileForm";
import DataManagementTab from "@/components/DataManagementTab";
import ApprovalSettingsCard from "@/components/ApprovalSettingsCard";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useChangePassword } from "@/hooks/use-change-password";

function BrandingTab() {
  const queryClient = useQueryClient();
  const parentInputRef = useRef<HTMLInputElement>(null);
  const teacherInputRef = useRef<HTMLInputElement>(null);
  const generalInputRef = useRef<HTMLInputElement>(null);
  const [uploadingParent, setUploadingParent] = useState(false);
  const [uploadingTeacher, setUploadingTeacher] = useState(false);
  const [uploadingGeneral, setUploadingGeneral] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["first-organization"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name").order("created_at", { ascending: true }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: branding } = useQuery({
    queryKey: ["organization-branding", org?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("organization_branding")
        .select("*")
        .eq("organization_id", org!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!org?.id,
  });

  const upsertBranding = async (patch: Record<string, any>) => {
    if (!org?.id) return;
    if (branding?.id) {
      const { error } = await (supabase as any)
        .from("organization_branding")
        .update(patch)
        .eq("id", branding.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("organization_branding")
        .insert({ organization_id: org.id, ...patch });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ["organization-branding"] });
  };

  const handleUpload = async (variant: "parent" | "teacher" | "general", file: File) => {
    if (!org?.id) return;
    const setLoading =
      variant === "parent"
        ? setUploadingParent
        : variant === "teacher"
        ? setUploadingTeacher
        : setUploadingGeneral;
    setLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${org.id}/${variant}-app-icon-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("branding").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const patch =
        variant === "parent"
          ? { parent_icon_url: publicUrl }
          : variant === "teacher"
          ? { teacher_icon_url: publicUrl }
          : { general_icon_url: publicUrl };
      await upsertBranding(patch);
      // Refresh the public branding cache so login/sidebar update instantly.
      queryClient.invalidateQueries({ queryKey: ["organization-branding-public"] });
      toast({
        title: "Icon uploaded",
        description:
          variant === "general"
            ? "Updated everywhere inside the app immediately. Installed home-screen shortcuts still need a reinstall."
            : "New installs of the app will use this icon. Existing installs need to be removed and re-installed to see the change.",
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const parentIcon = (branding as any)?.parent_icon_url ?? "/icon-parents-512.png";
  const teacherIcon = (branding as any)?.teacher_icon_url ?? "/icon-teachers-512.png";
  const generalIcon = (branding as any)?.general_icon_url ?? "/logo.png";

  return (
    <TabsContent value="branding" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> App Branding
          </CardTitle>
          <CardDescription>
            Customize the icon and name of the installed Sprouts apps. Recommended: a 512×512 PNG with transparent or solid background.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <strong>Note:</strong> iOS and Android pin the home-screen icon at install time. After uploading, ask users to remove and re-install the app to see the new icon.
          </div>

          {/* General app (admin / web / login / favicon) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4" /> General App Icon
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Used on the login screen, sidebar, browser favicon, and the admin/staff app surfaces.
            </p>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-muted border flex items-center justify-center">
                <img src={generalIcon} alt="General app icon" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-2">
                <Button onClick={() => generalInputRef.current?.click()} disabled={uploadingGeneral} variant="outline" size="sm">
                  {uploadingGeneral ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  Upload icon
                </Button>
                <input
                  ref={generalInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload("general", e.target.files[0])}
                />
                <p className="text-xs text-muted-foreground">PNG / JPG, square, ≥512×512.</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Parent app */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4" /> Parent App
            </div>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-muted border flex items-center justify-center">
                <img src={parentIcon} alt="Parent app icon" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-2">
                <Button onClick={() => parentInputRef.current?.click()} disabled={uploadingParent} variant="outline" size="sm">
                  {uploadingParent ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  Upload icon
                </Button>
                <input
                  ref={parentInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload("parent", e.target.files[0])}
                />
                <p className="text-xs text-muted-foreground">PNG / JPG, square, ≥512×512.</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Teacher app */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4" /> Teacher App
            </div>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-muted border flex items-center justify-center">
                <img src={teacherIcon} alt="Teacher app icon" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-2">
                <Button onClick={() => teacherInputRef.current?.click()} disabled={uploadingTeacher} variant="outline" size="sm">
                  {uploadingTeacher ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  Upload icon
                </Button>
                <input
                  ref={teacherInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload("teacher", e.target.files[0])}
                />
                <p className="text-xs text-muted-foreground">PNG / JPG, square, ≥512×512.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { changePassword, loading } = useChangePassword();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    const ok = await changePassword(current, next);
    if (ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  };

  return (
    <TabsContent value="security" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Change Password</CardTitle>
          <CardDescription>Update the password you use to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              {confirm && next !== confirm && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>
            <Button type="submit" disabled={loading || !current || !next || next !== confirm}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

const PHILOSOPHY_TYPES = [
  { value: "balanced", label: "Balanced Preschool" },
  { value: "academic", label: "Academic-Focused" },
  { value: "play-based", label: "Play-Based" },
  { value: "montessori", label: "Montessori-Inspired" },
  { value: "reggio", label: "Reggio-Inspired" },
  { value: "bilingual", label: "Bilingual Emphasis" },
  { value: "islamic", label: "Islamic / Values Emphasis" },
  { value: "project-based", label: "Project-Based Emphasis" },
];

function PhilosophySettingsTab() {
  const queryClient = useQueryClient();
  const { branches } = useGlobalBranch();
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id || "");
  const [philosophy, setPhilosophy] = useState("balanced");
  const [notes, setNotes] = useState("");
  const [initDone, setInitDone] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["school-philosophy", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_philosophy_settings")
        .select("*")
        .eq("branch_id", selectedBranch)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedBranch,
  });

  if (existing && !initDone) {
    setPhilosophy((existing as any).philosophy_type || "balanced");
    setNotes((existing as any).custom_notes || "");
    setInitDone(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { branch_id: selectedBranch, philosophy_type: philosophy, custom_notes: notes || null };
      if (existing) {
        const { error } = await supabase.from("school_philosophy_settings").update(payload as any).eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("school_philosophy_settings").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-philosophy"] });
      toast({ title: "Philosophy saved!" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <TabsContent value="philosophy" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> School Philosophy</CardTitle>
          <CardDescription>Set your school's teaching philosophy. This influences AI-generated curriculum and lesson plans.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {branches.length > 1 && (
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={selectedBranch} onValueChange={(v) => { setSelectedBranch(v); setInitDone(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Philosophy Type</Label>
                <Select value={philosophy} onValueChange={setPhilosophy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PHILOSOPHY_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Custom Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special teaching approach or emphasis..." rows={3} />
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Saving..." : "Save Philosophy"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "zh", label: "中文 (Mandarin)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
];

const PARENT_NOTIF_CATEGORIES = [
  { key: "chat", label: "Chat Messages" },
  { key: "billing", label: "Fees & Invoices" },
  { key: "announcement", label: "Announcements" },
  { key: "newsletter", label: "Newsletters" },
  { key: "learning_journey", label: "Daily Updates & Observations" },
  { key: "attendance", label: "Attendance & Check-in" },
  { key: "ptm", label: "Parent–Teacher Meetings" },
  { key: "general", label: "General" },
];

const STAFF_NOTIF_CATEGORIES = [
  { key: "chat", label: "Chat Messages" },
  { key: "leave", label: "Leave Management" },
  { key: "claim", label: "Claims" },
  { key: "payroll", label: "Payroll" },
  { key: "performance", label: "Performance Reviews" },
  { key: "announcement", label: "Announcements" },
  { key: "lesson_plan", label: "Lesson Plans" },
  { key: "general", label: "General" },
];

const ADMIN_NOTIF_CATEGORIES = [
  { key: "chat", label: "Chat Messages" },
  { key: "billing", label: "Billing & Invoices" },
  { key: "leave", label: "Leave Management" },
  { key: "claim", label: "Claims" },
  { key: "payroll", label: "Payroll" },
  { key: "performance", label: "Performance Reviews" },
  { key: "announcement", label: "Announcements" },
  { key: "enrollment", label: "Enrollments" },
  { key: "user_registration", label: "User Registrations" },
  { key: "escalation", label: "Escalations" },
  { key: "general", label: "General" },
];

function categoriesForRole(role: string | null | undefined) {
  if (role === "parent") return PARENT_NOTIF_CATEGORIES;
  if (role === "teacher" || role === "staff") return STAFF_NOTIF_CATEGORIES;
  return ADMIN_NOTIF_CATEGORIES;
}

function NotificationPreferencesTab({ userId, role }: { userId?: string; role?: string | null }) {
  const queryClient = useQueryClient();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const categories = categoriesForRole(role);

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("notification_preferences").select("*").eq("user_id", userId!);
      return data ?? [];
    },
    enabled: !!userId,
  });

  const prefsMap = new Map((prefs as any[]).map((p: any) => [p.category, p]));

  const togglePref = async (category: string, channel: "in_app" | "push" | "email", current: boolean) => {
    const existing = prefsMap.get(category);
    if (existing) {
      await (supabase as any).from("notification_preferences").update({ [channel]: !current }).eq("id", existing.id);
    } else {
      await (supabase as any).from("notification_preferences").insert({
        user_id: userId!, category, in_app: true, push: true, email: false, [channel]: !current,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
  };

  const getPref = (category: string, channel: "in_app" | "push" | "email") => {
    const p = prefsMap.get(category);
    if (!p) {
      // Teachers/staff default ALL channels (including email) ON so they don't
      // miss parent likes/comments, announcements, payroll, etc.
      if (role === "teacher" || role === "staff") return true;
      return channel !== "email"; // others: in_app & push true, email off
    }
    return (p as any)[channel];
  };

  return (
    <TabsContent value="notifications" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Push Notifications</CardTitle>
          <CardDescription>Enable browser push notifications for real-time alerts</CardDescription>
        </CardHeader>
        <CardContent>
          {permission === "unsupported" ? (
            <p className="text-sm text-muted-foreground">Push notifications are not supported in this browser.</p>
          ) : permission === "denied" ? (
            <p className="text-sm text-muted-foreground">Push notifications are blocked. Please enable them in your browser settings.</p>
          ) : isSubscribed ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary">✅ Push notifications enabled</p>
                <p className="text-xs text-muted-foreground">You'll receive alerts even when the app is closed</p>
              </div>
              <Button variant="outline" size="sm" onClick={unsubscribe}>Disable</Button>
            </div>
          ) : (
            <Button onClick={() => subscribe()} disabled={pushLoading}>
              <Bell className="h-4 w-4 mr-2" />{pushLoading ? "Enabling..." : "Enable Push Notifications"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose which notifications you want to receive and how</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 pr-4 font-medium">Category</th>
                    <th className="text-center py-3 px-4 font-medium">In-App</th>
                    <th className="text-center py-3 px-4 font-medium">Push</th>
                    <th className="text-center py-3 px-4 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.key} className="border-b last:border-0">
                      <td className="py-3 pr-4">{cat.label}</td>
                      <td className="text-center py-3 px-4">
                        <Switch checked={getPref(cat.key, "in_app")} onCheckedChange={() => togglePref(cat.key, "in_app", getPref(cat.key, "in_app"))} />
                      </td>
                      <td className="text-center py-3 px-4">
                        <Switch checked={getPref(cat.key, "push")} onCheckedChange={() => togglePref(cat.key, "push", getPref(cat.key, "push"))} />
                      </td>
                      <td className="text-center py-3 px-4">
                        <Switch checked={getPref(cat.key, "email")} onCheckedChange={() => togglePref(cat.key, "email", getPref(cat.key, "email"))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default function Settings() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("18:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const isStaff = role === "super_admin" || role === "franchisee" || role === "teacher";
  const isManager = role === "super_admin" || role === "franchisee" || role === "admin";
  const isSuperAdmin = role === "super_admin";

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  if (profile && !initialized) {
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setPhone((profile as any).phone ?? "");
    setPreferredLanguage((profile as any).preferred_language ?? "en");
    setQuietHoursEnabled((profile as any).is_quiet_hours_enabled ?? false);
    setQuietHoursStart((profile as any).quiet_hours_start ?? "18:00");
    setQuietHoursEnd((profile as any).quiet_hours_end ?? "08:00");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async ({ first_name, last_name, phone: ph }: { first_name: string; last_name: string; phone: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name, last_name, phone: ph || null } as any)
        .eq("id", user!.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { first_name, last_name } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Profile updated", description: "Your name has been saved." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateLanguageMutation = useMutation({
    mutationFn: async (lang: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_language: lang } as any)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Language updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateQuietHoursMutation = useMutation({
    mutationFn: async (vals: { is_quiet_hours_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_quiet_hours_enabled: vals.is_quiet_hours_enabled,
          quiet_hours_start: vals.quiet_hours_start,
          quiet_hours_end: vals.quiet_hours_end,
        } as any)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Quiet hours updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 5MB.", variant: "destructive" });
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      if (updateError) throw updateError;
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Avatar updated", description: "Your profile picture has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  const initials = (profile?.first_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your profile and account</p>
        </div>

        <Tabs defaultValue="profile">
          <div className="-mx-4 px-4 overflow-x-auto">
            <TabsList className="inline-flex w-auto whitespace-nowrap">
              <TabsTrigger value="profile"><User className="h-4 w-4 mr-1" />Profile</TabsTrigger>
              <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1" />My Notifications</TabsTrigger>
              {isStaff && <TabsTrigger value="hr"><Briefcase className="h-4 w-4 mr-1" />HR Details</TabsTrigger>}
              {/* Digital Wellbeing tab removed */}
              {isSuperAdmin && <TabsTrigger value="data-management"><AlertTriangle className="h-4 w-4 mr-1" />Data Management</TabsTrigger>}
              {isSuperAdmin && <TabsTrigger value="approvals"><ShieldCheck className="h-4 w-4 mr-1" />Approvals</TabsTrigger>}
              {isSuperAdmin && <TabsTrigger value="branding"><Palette className="h-4 w-4 mr-1" />Branding</TabsTrigger>}
              {isManager && <TabsTrigger value="philosophy"><Globe className="h-4 w-4 mr-1" />Philosophy</TabsTrigger>}
              <TabsTrigger value="security"><Lock className="h-4 w-4 mr-1" />Security</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className="space-y-6">
            {/* Avatar */}
            <Card>
              <CardHeader>
                <CardTitle>Profile Picture</CardTitle>
                <CardDescription>Click the avatar to upload a new photo</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    {avatarUploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div>
                  <p className="font-medium">{profile?.first_name} {profile?.last_name}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </CardContent>
            </Card>

            {/* Name */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your name</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ first_name: firstName, last_name: lastName, phone }); }} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={profile?.email ?? ""} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                  <Separator />
                  <Button type="submit" disabled={updateMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Preferred Language */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" /> Preferred Language
                </CardTitle>
                <CardDescription>Messages will be translated to your preferred language</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={preferredLanguage}
                  onValueChange={(val) => {
                    setPreferredLanguage(val);
                    updateLanguageMutation.mutate(val);
                  }}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </TabsContent>

          <NotificationPreferencesTab userId={user?.id} role={role} />

          {isStaff && (
            <TabsContent value="hr">
              <StaffProfileForm />
            </TabsContent>
          )}

          {/* Digital Wellbeing section removed per product decision */}

          {isSuperAdmin && <DataManagementTab />}

          {isSuperAdmin && (
            <TabsContent value="approvals" className="space-y-6">
              <ApprovalSettingsCard />
            </TabsContent>
          )}

          {isSuperAdmin && <BrandingTab />}

          {isManager && (
            <PhilosophySettingsTab />
          )}

          <SecurityTab />

        </Tabs>
      </div>
    </DashboardLayout>
  );
}
