import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import StaffDocumentUpload from "@/components/StaffDocumentUpload";
import CustomOnboardingFields from "@/components/CustomOnboardingFields";
import { ArrowRight, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

const BANKS = ["Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Rakyat", "Bank Islam", "Affin Bank", "Alliance Bank", "OCBC Bank", "HSBC Bank", "Standard Chartered", "UOB", "Bank Muamalat", "BSN"];
const STEPS = ["Personal Details", "Emergency Contact", "Bank & Statutory", "Documents", "Review & Submit"];
const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "probation", label: "Probation" },
];

export default function StaffOnboardingWizard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Get user's branch for custom fields
  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id).limit(1).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const branchId = membership?.branch_id;

  // Load existing custom responses
  const { data: existingResponses } = useQuery({
    queryKey: ["onboarding-responses", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("onboarding_form_responses").select("field_id, value").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (existingResponses && existingResponses.length > 0) {
      const vals: Record<string, string> = {};
      existingResponses.forEach((r: any) => { vals[r.field_id] = r.value ?? ""; });
      setCustomValues((prev) => ({ ...vals, ...prev }));
    }
  }, [existingResponses]);

  const { data: staffProfile } = useQuery({
    queryKey: ["onboarding-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (staffProfile) setForm((prev: any) => ({ ...staffProfile, ...prev }));
  }, [staffProfile]);

  const saveMutation = useMutation({
    mutationFn: async (complete: boolean) => {
      const payload: any = {
        user_id: user!.id,
        ic_number: form.ic_number || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        nationality: form.nationality || null,
        marital_status: form.marital_status || null,
        address: form.address || null,
        phone: form.phone || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        epf_number: form.epf_number || null,
        socso_number: form.socso_number || null,
        eis_number: form.eis_number || null,
        tax_number: form.tax_number || null,
      };
      if (complete) payload.onboarding_complete = true;
      const { error } = await supabase.from("staff_profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;

      // Save custom field responses
      const entries = Object.entries(customValues).filter(([_, v]) => v !== "");
      if (entries.length > 0) {
        const rows = entries.map(([field_id, value]) => ({ user_id: user!.id, field_id, value }));
        const { error: respError } = await supabase.from("onboarding_form_responses").upsert(rows as any, { onConflict: "user_id,field_id" });
        if (respError) throw respError;
      }
    },
    onSuccess: (_, complete) => {
      if (complete) {
        toast({ title: "Onboarding complete! 🎉", description: "Your profile has been saved." });
        queryClient.invalidateQueries({ queryKey: ["onboarding-profile"] });
        queryClient.invalidateQueries({ queryKey: ["onboarding-lock"] });
      }
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const set = (key: string, value: any) => setForm((p: any) => ({ ...p, [key]: value }));
  const setCustom = (fieldId: string, value: string) => setCustomValues((p) => ({ ...p, [fieldId]: value }));
  const progress = ((step + 1) / STEPS.length) * 100;

  const next = () => {
    // Auto-save on step change
    saveMutation.mutate(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Welcome! Let's complete your profile</CardTitle>
        <CardDescription>Step {step + 1} of {STEPS.length}: {STEPS[step]}</CardDescription>
        <Progress value={progress} className="mt-2" />
      </CardHeader>
      <CardContent className="min-h-[300px]">
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>IC Number *</Label><Input value={form.ic_number ?? ""} onChange={(e) => set("ic_number", e.target.value)} /></div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender ?? ""} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nationality</Label><Input value={form.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} /></div>
            <div>
              <Label>Marital Status</Label>
              <Select value={form.marital_status ?? ""} onValueChange={(v) => set("marital_status", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
             <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
            {branchId && <div className="sm:col-span-2"><CustomOnboardingFields branchId={branchId} formType="staff" stepLabel="Personal Details" values={customValues} onChange={setCustom} /></div>}
           </div>
        )}

         {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Emergency Contact Name *</Label><Input value={form.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} /></div>
            <div><Label>Emergency Contact Phone *</Label><Input value={form.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></div>
            {branchId && <div className="sm:col-span-2"><CustomOnboardingFields branchId={branchId} formType="staff" stepLabel="Emergency Contact" values={customValues} onChange={setCustom} /></div>}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Bank</Label>
              <Select value={form.bank_name ?? ""} onValueChange={(v) => set("bank_name", v)}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Bank Account Number</Label><Input value={form.bank_account ?? ""} onChange={(e) => set("bank_account", e.target.value)} /></div>
            <div><Label>EPF Number</Label><Input value={form.epf_number ?? ""} onChange={(e) => set("epf_number", e.target.value)} /></div>
            <div><Label>SOCSO Number</Label><Input value={form.socso_number ?? ""} onChange={(e) => set("socso_number", e.target.value)} /></div>
            <div><Label>EIS Number</Label><Input value={form.eis_number ?? ""} onChange={(e) => set("eis_number", e.target.value)} /></div>
            <div><Label>Tax Number</Label><Input value={form.tax_number ?? ""} onChange={(e) => set("tax_number", e.target.value)} /></div>
            {branchId && <div className="sm:col-span-2"><CustomOnboardingFields branchId={branchId} formType="staff" stepLabel="Bank & Statutory" values={customValues} onChange={setCustom} /></div>}
          </div>
        )}

        {step === 3 && user && (
          <StaffDocumentUpload staffUserId={user.id} />
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Review your information</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">IC:</span> {form.ic_number || "—"}</div>
              <div><span className="text-muted-foreground">DOB:</span> {form.date_of_birth || "—"}</div>
              <div><span className="text-muted-foreground">Gender:</span> {form.gender || "—"}</div>
              <div><span className="text-muted-foreground">Phone:</span> {form.phone || "—"}</div>
              <div><span className="text-muted-foreground">Nationality:</span> {form.nationality || "—"}</div>
              <div><span className="text-muted-foreground">Bank:</span> {form.bank_name || "—"}</div>
              <div><span className="text-muted-foreground">Emergency:</span> {form.emergency_contact_name || "—"}</div>
              <div><span className="text-muted-foreground">EPF:</span> {form.epf_number || "—"}</div>
            </div>
            <p className="text-sm text-muted-foreground">Click "Complete Onboarding" to finalize your profile.</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={prev} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Complete Onboarding
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
