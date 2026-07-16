import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Camera, Save, Loader2, Globe, Bell, KeyRound, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useChangePassword } from "@/hooks/use-change-password";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

/* -------------------- Profile block -------------------- */

export function ParentProfileBlock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  if (profile && !initialized) {
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setPhone((profile as any).phone ?? "");
    setPreferredLanguage((profile as any).preferred_language ?? "en");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName, last_name: lastName, phone: phone || null } as any)
        .eq("id", user!.id);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Profile updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateLanguage = useMutation({
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image.", variant: "destructive" });
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
      const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      if (updErr) throw updErr;
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast({ title: "Avatar updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setAvatarUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (profile?.first_name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Picture</CardTitle>
          <CardDescription>Tap the avatar to upload a new photo</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt="Avatar" />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              {avatarUploading ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Camera className="h-4 w-4 text-white" />}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{profile?.first_name} {profile?.last_name}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}
            className="space-y-4"
          >
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Preferred Language</CardTitle>
          <CardDescription>Messages will be translated to your preferred language</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={preferredLanguage}
            onValueChange={(val) => { setPreferredLanguage(val); updateLanguage.mutate(val); }}
          >
            <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Notifications block -------------------- */

export function ParentNotificationsBlock() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { permission, isSubscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("notification_preferences").select("*").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const prefsMap = new Map((prefs as any[]).map((p: any) => [p.category, p]));

  const togglePref = async (category: string, channel: "in_app" | "push" | "email", current: boolean) => {
    const existing = prefsMap.get(category);
    if (existing) {
      await (supabase as any).from("notification_preferences").update({ [channel]: !current }).eq("id", existing.id);
    } else {
      await (supabase as any).from("notification_preferences").insert({
        user_id: user!.id, category, in_app: true, push: true, email: true, [channel]: !current,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
  };

  const getPref = (category: string, channel: "in_app" | "push" | "email") => {
    const p = prefsMap.get(category);
    if (!p) return true;
    return (p as any)[channel];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Push Notifications</CardTitle>
          <CardDescription>Get alerts even when the app is closed</CardDescription>
        </CardHeader>
        <CardContent>
          {permission === "unsupported" ? (
            <p className="text-sm text-muted-foreground">Push notifications are not supported in this browser.</p>
          ) : permission === "denied" ? (
            <p className="text-sm text-muted-foreground">Push notifications are blocked. Please enable them in your browser settings.</p>
          ) : isSubscribed ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-primary">✅ Push notifications enabled</p>
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
          <CardTitle className="text-base">Notification Preferences</CardTitle>
          <CardDescription>Choose which alerts you want to receive and how</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-2 font-medium">Category</th>
                    <th className="text-center py-2 px-2 font-medium">In-App</th>
                    <th className="text-center py-2 px-2 font-medium">Push</th>
                    <th className="text-center py-2 px-2 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {PARENT_NOTIF_CATEGORIES.map((cat) => (
                    <tr key={cat.key} className="border-b last:border-0">
                      <td className="py-2.5 pr-2 text-foreground/90">{cat.label}</td>
                      {(["in_app", "push", "email"] as const).map((ch) => (
                        <td key={ch} className="text-center py-2 px-2">
                          <Switch
                            checked={getPref(cat.key, ch)}
                            onCheckedChange={() => togglePref(cat.key, ch, getPref(cat.key, ch))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------- Security block -------------------- */

export function ParentSecurityBlock() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { changePassword, loading } = useChangePassword();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    const ok = await changePassword(current, next);
    if (ok) { setCurrent(""); setNext(""); setConfirm(""); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change Password</CardTitle>
        <CardDescription>Update the password you use to sign in</CardDescription>
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
  );
}