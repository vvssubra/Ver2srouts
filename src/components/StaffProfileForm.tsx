import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Briefcase, CreditCard, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank",
  "AmBank", "Bank Rakyat", "Bank Islam", "Affin Bank", "Alliance Bank",
  "HSBC", "OCBC", "Standard Chartered", "UOB", "BSN", "Other",
];

export default function StaffProfileForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [initialized, setInitialized] = useState(false);

  const [icNumber, setIcNumber] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [epfNumber, setEpfNumber] = useState("");
  const [socsoNumber, setSocsoNumber] = useState("");
  const [eisNumber, setEisNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const { data: staffProfile, isLoading } = useQuery({
    queryKey: ["staff-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (staffProfile && !initialized) {
    setIcNumber(staffProfile.ic_number ?? "");
    setTaxNumber(staffProfile.tax_number ?? "");
    setEpfNumber(staffProfile.epf_number ?? "");
    setSocsoNumber(staffProfile.socso_number ?? "");
    setEisNumber(staffProfile.eis_number ?? "");
    setBankName(staffProfile.bank_name ?? "");
    setBankAccount(staffProfile.bank_account ?? "");
    setEmploymentType(staffProfile.employment_type ?? "full_time");
    setEmergencyName(staffProfile.emergency_contact_name ?? "");
    setEmergencyPhone(staffProfile.emergency_contact_phone ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        ic_number: icNumber || null,
        tax_number: taxNumber || null,
        epf_number: epfNumber || null,
        socso_number: socsoNumber || null,
        eis_number: eisNumber || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        employment_type: employmentType,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
      };
      const { error } = await supabase.from("staff_profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-profile"] });
      toast({ title: "Saved", description: "Staff profile updated successfully." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6">
      {/* Identity & Statutory */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> Identity & Statutory Numbers</CardTitle>
          <CardDescription>IC, EPF, SOCSO, EIS and tax reference numbers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>IC Number (MyKad)</Label>
              <Input placeholder="e.g. 900101-14-5678" value={icNumber} onChange={(e) => setIcNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tax Number (TIN)</Label>
              <Input placeholder="e.g. SG12345678100" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>EPF Number</Label>
              <Input placeholder="e.g. 12345678" value={epfNumber} onChange={(e) => setEpfNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>SOCSO Number</Label>
              <Input placeholder="e.g. S1234567890" value={socsoNumber} onChange={(e) => setSocsoNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>EIS Number</Label>
              <Input placeholder="e.g. E1234567890" value={eisNumber} onChange={(e) => setEisNumber(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Bank Details</CardTitle>
          <CardDescription>For salary payment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Select value={bankName} onValueChange={setBankName}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input placeholder="e.g. 1234567890" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employment & Emergency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Briefcase className="h-4 w-4" /> Employment & Emergency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Employment Type</Label>
            <Select value={employmentType} onValueChange={setEmploymentType}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
                <SelectItem value="probation">Probation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Emergency Contact Name</Label>
              <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Emergency Contact Phone</Label>
              <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
        <Save className="h-4 w-4" />
        {saveMutation.isPending ? "Saving…" : "Save Staff Profile"}
      </Button>
    </form>
  );
}
