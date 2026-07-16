import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useChangePassword } from "@/hooks/use-change-password";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  User,
  FileText,
  BookOpen,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STEPS = [
  { key: "password", title: "Password", longTitle: "Change password", icon: KeyRound },
  { key: "profile", title: "Profile", longTitle: "Confirm profile", icon: User },
  { key: "tnc", title: "Terms", longTitle: "Terms & Conditions", icon: FileText },
  { key: "handbook", title: "Handbook", longTitle: "School Handbook", icon: BookOpen },
] as const;

export default function ParentFirstRunOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { changePassword, loading: pwLoading } = useChangePassword();

  // Load profile + branch + onboarding state + active T&C + handbook
  const { data: profile } = useQuery({
    queryKey: ["my-profile-onboarding", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, must_change_password, password_changed_at, onboarding_completed_at")
        .eq("id", user!.id)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: branchId } = useQuery({
    queryKey: ["my-parent-branch", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_students")
        .select("students!inner(branch_id)")
        .eq("parent_id", user!.id)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      return (data as any)?.students?.branch_id ?? null;
    },
  });

  const { data: state, refetch: refetchState, isLoading: stateLoading } = useQuery({
    queryKey: ["parent-onboarding-state", user?.id, branchId],
    enabled: !!user?.id && !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_onboarding_state")
        .select("*")
        .eq("parent_id", user!.id)
        .eq("branch_id", branchId!)
        .maybeSingle();
      return data as any;
    },
  });

  const onboardingComplete = !!profile?.onboarding_completed_at || !!state?.completed_at;

  const { data: tnc } = useQuery({
    queryKey: ["active-tnc", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tnc_versions")
        .select("*")
        .eq("is_active", true)
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: handbook } = useQuery({
    queryKey: ["active-handbook", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("school_documents")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("category", "handbook")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  // Derive current step
  const completedFlags = useMemo(() => {
    return {
      password: (!!state?.password_changed_at || !!profile?.password_changed_at) && !profile?.must_change_password,
      profile: !!state?.profile_completed_at,
      tnc: !!state?.tnc_accepted_at,
      handbook: !!state?.handbook_accepted_at,
    };
  }, [state, profile]);

  const firstIncomplete = STEPS.findIndex((s) => !(completedFlags as any)[s.key]);
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    if (firstIncomplete >= 0) setStepIdx(firstIncomplete);
  }, [firstIncomplete]);

  // Redirect when complete
  useEffect(() => {
    if (onboardingComplete) {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      navigate("/child", { replace: true });
    }
  }, [onboardingComplete, navigate, qc]);

  const progress = useMemo(() => {
    const done = Object.values(completedFlags).filter(Boolean).length;
    return Math.round((done / STEPS.length) * 100);
  }, [completedFlags]);

  const upsertState = async (patch: Record<string, any>) => {
    if (!user?.id || !branchId) return;
    const update = await supabase
      .from("parent_onboarding_state")
      .update(patch as any)
      .eq("parent_id", user.id)
      .eq("branch_id", branchId);
    if (update.error) throw update.error;

    const { data: existing } = await supabase
      .from("parent_onboarding_state")
      .select("id")
      .eq("parent_id", user.id)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase
      .from("parent_onboarding_state")
      .upsert(
        { parent_id: user.id, branch_id: branchId, ...patch },
        { onConflict: "parent_id,branch_id" }
      );
      if (error) throw error;
    }
    await refetchState();
  };

  useEffect(() => {
    if (
      profile?.password_changed_at &&
      !profile?.must_change_password &&
      state &&
      !state.password_changed_at
    ) {
      upsertState({ password_changed_at: profile.password_changed_at }).catch((error) => {
        console.error("sync parent onboarding password step", error);
      });
    }
  }, [profile?.password_changed_at, profile?.must_change_password, state?.id, state?.password_changed_at]);

  if (!user) return null;
  if (branchId === undefined || profile === undefined || stateLoading || onboardingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!branchId)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">
        Your account isn't linked to a school yet. Please contact the school admin.
      </div>
    );

  const step = STEPS[stepIdx];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-primary/5 to-background py-6 px-4 sm:py-10">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            <Sparkles className="h-3 w-3" /> First-time setup
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome to Sprouts 🌱</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Four quick steps and you'll be inside your child's daily journal.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Step {Math.min(stepIdx + 1, STEPS.length)} of {STEPS.length}</span>
            <span>{progress}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between gap-1.5 pt-1">
            {STEPS.map((s, i) => {
              const Done = (completedFlags as any)[s.key];
              const Icon = s.icon;
              const active = i === stepIdx;
              return (
                <button
                  type="button"
                  key={s.key}
                  onClick={() => Done || i <= firstIncomplete ? setStepIdx(i) : null}
                  className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 rounded-lg p-2 border text-[11px] transition-colors ${
                    Done
                      ? "border-green-200 bg-green-50 text-green-800"
                      : active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {Done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate font-medium">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="shadow-sm border-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="h-4 w-4" />
              </span>
              {step.longTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step.key === "password" && (
              <PasswordStep
                profile={profile}
                onDone={async () => {
                  await upsertState({ password_changed_at: new Date().toISOString() });
                  setStepIdx(1);
                }}
                changePassword={changePassword}
                pwLoading={pwLoading}
                already={completedFlags.password}
              />
            )}
            {step.key === "profile" && (
              <ProfileStep
                profile={profile}
                userId={user.id}
                onDone={async () => {
                  await upsertState({ profile_completed_at: new Date().toISOString() });
                  qc.invalidateQueries({ queryKey: ["my-profile-onboarding", user.id] });
                  setStepIdx(2);
                }}
              />
            )}
            {step.key === "tnc" && (
              <TncStep
                tnc={tnc}
                onDone={async () => {
                  await upsertState({
                    tnc_accepted_at: new Date().toISOString(),
                    tnc_version: tnc?.version ?? "default-v1",
                  });
                  setStepIdx(3);
                }}
              />
            )}
            {step.key === "handbook" && (
              <HandbookStep
                handbook={handbook}
                onDone={async () => {
                  await upsertState({
                    handbook_accepted_at: new Date().toISOString(),
                    handbook_document_id: handbook?.id ?? null,
                    handbook_version: handbook?.version ?? "default-v1",
                  });
                  // Completion handled by trigger; effect above will navigate
                }}
              />
            )}
          </CardContent>
        </Card>

        {stepIdx > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setStepIdx((s) => Math.max(0, s - 1))}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
        )}
      </div>
    </div>
  );
}

function PasswordStep({
  profile,
  onDone,
  changePassword,
  pwLoading,
  already,
}: {
  profile: any;
  onDone: () => Promise<void>;
  changePassword: (cur: string, nw: string) => Promise<boolean>;
  pwLoading: boolean;
  already: boolean;
}) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");

  if (already) {
    return (
      <div className="space-y-4">
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Password already set
        </Badge>
        <Button onClick={onDone} className="w-full">
          Continue <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set a personal password. The temporary one you received in the welcome email won't work after this.
      </p>
      <div>
        <Label>Temporary password (from welcome email)</Label>
        <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <Label>New password</Label>
        <Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
        <p className="text-[11px] text-muted-foreground mt-1">At least 8 characters.</p>
      </div>
      <div>
        <Label>Confirm new password</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <Button
        className="w-full"
        disabled={pwLoading || !cur || !nw || nw !== confirm}
        onClick={async () => {
          if (nw !== confirm) {
            toast({ title: "Passwords don't match", variant: "destructive" });
            return;
          }
          const ok = await changePassword(cur, nw);
          if (ok) await onDone();
        }}
      >
        {pwLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
        Set password & continue
      </Button>
    </div>
  );
}

function ProfileStep({
  profile,
  userId,
  onDone,
}: {
  profile: any;
  userId: string;
  onDone: () => Promise<void>;
}) {
  const addr = profile?.address || {};
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [street, setStreet] = useState(addr.street ?? "");
  const [city, setCity] = useState(addr.city ?? "");
  const [state, setState] = useState(addr.state ?? "");
  const [postcode, setPostcode] = useState(addr.postcode ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!firstName.trim() || !phone.trim() || !street.trim() || !city.trim()) {
      toast({ title: "Please complete name, phone, and address", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim(),
          address: { street, city, state, postcode },
        } as any)
        .eq("id", userId);
      if (error) throw error;
      await onDone();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Confirm your contact details so the school can reach you quickly.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First name *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
        <div><Label>Last name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
      </div>
      <div><Label>Email</Label><Input value={profile?.email ?? ""} disabled /></div>
      <div><Label>Phone *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" /></div>
      <div><Label>Street address *</Label><Input value={street} onChange={(e) => setStreet(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>City *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
        <div><Label>Postcode</Label><Input value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>
      </div>
      <Button className="w-full" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
        Save & continue <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

const DEFAULT_TNC = `## Terms & Conditions

By using the Sprouts parent app you agree to:
- Receive school updates, learning stories, photos and announcements about your child.
- Allow the school to use AI to summarise classroom observations into learning stories.
- Keep your login credentials private and contact the school if you suspect unauthorised access.
- Settle fees through the in-app billing module by their due date.

Your data is encrypted and never sold or shared with third parties.`;

function TncStep({ tnc, onDone }: { tnc: any; onDone: () => Promise<void> }) {
  const [scrolled, setScrolled] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const content = tnc?.content_md || DEFAULT_TNC;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Version {tnc?.version ?? "default-v1"} · Scroll to the end to enable accept.
      </p>
      <div
        className="h-64 overflow-y-auto rounded-md border p-4 text-sm whitespace-pre-wrap bg-muted/20"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setScrolled(true);
        }}
      >
        {content}
      </div>
      <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/20">
        <Checkbox
          checked={agreed}
          disabled={!scrolled}
          onCheckedChange={(v) => setAgreed(!!v)}
          id="tnc-agree"
        />
        <Label htmlFor="tnc-agree" className="text-sm font-normal leading-snug">
          I have read and agree to the Terms & Conditions.
          {!scrolled && (
            <span className="block text-[11px] text-warning mt-1">Scroll to the bottom to enable.</span>
          )}
        </Label>
      </div>
      <Button
        className="w-full"
        disabled={!agreed || saving}
        onClick={async () => {
          setSaving(true);
          try { await onDone(); } finally { setSaving(false); }
        }}
      >
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
        Accept & continue <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function HandbookStep({ handbook, onDone }: { handbook: any; onDone: () => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-3">
      {handbook ? (
        <>
          <p className="text-sm">
            <strong>{handbook.title}</strong>{" "}
            <Badge variant="outline" className="ml-1 text-[10px]">v{handbook.version}</Badge>
          </p>
          <div className="rounded-md border overflow-hidden">
            <iframe
              src={handbook.file_url}
              title="School Handbook"
              className="w-full h-72 bg-background"
            />
          </div>
          <a
            href={handbook.file_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline"
          >
            Open in new tab / download
          </a>
        </>
      ) : (
        <div className="rounded-md border p-4 text-sm bg-muted/20">
          Your school hasn't uploaded a handbook yet. You can still confirm you've discussed the
          school policies with the admin.
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/20">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} id="hb-agree" />
        <Label htmlFor="hb-agree" className="text-sm font-normal leading-snug">
          I have read and agree to the School Handbook and code of conduct.
        </Label>
      </div>
      <div>
        <Label>Signature (type your full name)</Label>
        <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Full name" />
      </div>
      <Button
        className="w-full"
        disabled={!agreed || !signature.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onDone();
            toast({ title: "All set! 🌱", description: "Welcome to Sprouts." });
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
        Complete onboarding
      </Button>
    </div>
  );
}