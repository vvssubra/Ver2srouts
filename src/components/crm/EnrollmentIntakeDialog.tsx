import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, GraduationCap, Users, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any | null;
  branchId: string | null | undefined;
  onEnrolled: (studentId: string, enrollmentExtras: EnrollmentExtras) => void;
}

export interface EnrollmentExtras {
  totalFeesPaid: number | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentDate: string | null; // YYYY-MM-DD
}

interface ParentForm {
  enabled: boolean;
  relation: "mother" | "father" | "guardian";
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  ic_number: string;
  occupation: string;
  is_primary: boolean;
  send_invite: boolean;
}

function emptyParent(relation: ParentForm["relation"]): ParentForm {
  return {
    enabled: relation !== "guardian",
    relation,
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    ic_number: "",
    occupation: "",
    is_primary: relation === "mother",
    send_invite: true,
  };
}

export default function EnrollmentIntakeDialog({
  open,
  onOpenChange,
  lead,
  branchId,
  onEnrolled,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  // Child info
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [nationality, setNationality] = useState("");
  const [race, setRace] = useState("");
  const [religion, setReligion] = useState("");
  const [birthCertNo, setBirthCertNo] = useState("");
  const [mykidNo, setMykidNo] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");

  // Parents
  const [mother, setMother] = useState<ParentForm>(emptyParent("mother"));
  const [father, setFather] = useState<ParentForm>(emptyParent("father"));

  // Enrollment fees (attribution / ROI — does NOT replace finance invoices)
  const [totalFeesPaid, setTotalFeesPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const { data: classes = [] } = useQuery({
    queryKey: ["enrollment-intake-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name")
        .eq("branch_id", branchId)
        .order("class_name");
      return data ?? [];
    },
    enabled: !!branchId && open,
  });

  // Pre-fill from lead when opened
  useEffect(() => {
    if (!open || !lead) return;
    const parts = String(lead.child_name ?? "").trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setDob("");
    setGender("");
    setClassId("");
    setNationality("");
    setRace("");
    setReligion("");
    setBirthCertNo("");
    setMykidNo("");
    setHomeAddress(lead.address ?? "");
    setBloodType("");
    setDietaryNotes("");
    setMedicalConditions("");
    setAllergies("");
    setEmergencyName("");
    setEmergencyPhone("");
    setEmergencyRelation("");
    setTotalFeesPaid("");
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentDate(new Date().toISOString().slice(0, 10));

    const motherParts = String(lead.parent_name ?? "").trim().split(/\s+/);
    setMother({
      ...emptyParent("mother"),
      first_name: motherParts[0] ?? "",
      last_name: motherParts.slice(1).join(" "),
      email: lead.email ?? "",
      phone: lead.phone ?? "",
    });
    setFather(emptyParent("father"));
  }, [open, lead]);

  const validate = (): string | null => {
    if (!firstName.trim()) return "Child's first name is required";
    if (!classId) return "Please assign a class";
    const activeParents = [mother, father].filter((p) => p.enabled);
    if (activeParents.length === 0) return "Add at least one parent";
    for (const p of activeParents) {
      if (!p.first_name.trim())
        return `${p.relation === "mother" ? "Mother" : "Father"}: first name required`;
      if (!p.email.trim())
        return `${p.relation === "mother" ? "Mother" : "Father"}: email required`;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
        return `${p.relation === "mother" ? "Mother" : "Father"}: invalid email`;
    }
    // Exactly one primary among enabled parents
    const primaries = activeParents.filter((p) => p.is_primary).length;
    if (primaries === 0) return "Mark one parent as primary contact";
    if (primaries > 1) return "Only one parent can be primary contact";
    const feesNum = Number(totalFeesPaid);
    if (totalFeesPaid.trim() === "" || !Number.isFinite(feesNum) || feesNum <= 0) {
      return "Total fees paid at enrollment is required (must be greater than 0). Go to the Fees tab to enter it.";
    }
    return null;
  };

  const setMotherPrimary = (v: boolean) => {
    setMother((m) => ({ ...m, is_primary: v }));
    if (v) setFather((f) => ({ ...f, is_primary: false }));
  };
  const setFatherPrimary = (v: boolean) => {
    setFather((f) => ({ ...f, is_primary: v }));
    if (v) setMother((m) => ({ ...m, is_primary: false }));
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: "Cannot enroll yet", description: err, variant: "destructive" });
      return;
    }
    if (!branchId) {
      toast({ title: "No branch selected", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const className = classes.find((c: any) => c.id === classId)?.class_name ?? null;

      // Build parent name fields (legacy denormalized columns on students)
      const motherFullName = mother.enabled
        ? `${mother.first_name} ${mother.last_name}`.trim()
        : null;
      const fatherFullName = father.enabled
        ? `${father.first_name} ${father.last_name}`.trim()
        : null;

      const { data: student, error: studentErr } = await supabase
        .from("students")
        .insert({
          branch_id: branchId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dob || null,
          gender: gender || null,
          class_id: classId,
          class_name: className,
          nationality: nationality || null,
          race: race || null,
          religion: religion || null,
          birth_cert_no: birthCertNo || null,
          mykid_no: mykidNo || null,
          home_address: homeAddress || null,
          blood_type: bloodType || null,
          dietary_notes: dietaryNotes || null,
          medical_conditions: medicalConditions || null,
          allergies: allergies || null,
          emergency_contact_name: emergencyName || null,
          emergency_contact_phone: emergencyPhone || null,
          emergency_contact_relation: emergencyRelation || null,
          mother_name: motherFullName,
          mother_ic: mother.enabled ? mother.ic_number || null : null,
          mother_phone: mother.enabled ? mother.phone || null : null,
          mother_occupation: mother.enabled ? mother.occupation || null : null,
          father_name: fatherFullName,
          father_ic: father.enabled ? father.ic_number || null : null,
          father_phone: father.enabled ? father.phone || null : null,
          father_occupation: father.enabled ? father.occupation || null : null,
          enrollment_date: new Date().toISOString().slice(0, 10),
          is_active: true,
        } as any)
        .select("id")
        .single();

      if (studentErr || !student) throw studentErr ?? new Error("Failed to create student");

      // If the lead had a pre-enrollment assessment, copy it onto the new student record
      // so the AI / methodology engine has baseline data from day one.
      const preAssess = lead?.pre_enrollment_assessment as any;
      if (preAssess && typeof preAssess === "object") {
        try {
          // Flatten v2 indicators into checklist_responses so the
          // Enrollment Assessments screen + AI methodology engine
          // see the full comprehensive baseline (not just aggregate scores).
          const indicators = preAssess.indicators ?? {};
          const checklistResponses = Object.entries(indicators).map(([key, score]) => {
            const [category, item] = key.split(".");
            return { category, item, score, passed: (score as number) >= 3 };
          });
          const ctx = preAssess.context ?? {};
          const contextNote = [
            ctx.home_languages && `Home languages: ${ctx.home_languages}`,
            ctx.prior_schooling && `Prior schooling: ${ctx.prior_schooling}`,
            ctx.interests && `Interests: ${ctx.interests}`,
            ctx.favourite_activities && `Favourite activities: ${ctx.favourite_activities}`,
            ctx.dislikes_triggers && `Dislikes / triggers: ${ctx.dislikes_triggers}`,
            ctx.routines && `Routines: ${ctx.routines}`,
            ctx.sleep_nap && `Sleep / nap: ${ctx.sleep_nap}`,
            ctx.diet_allergies && `Diet / allergies: ${ctx.diet_allergies}`,
            ctx.learning_styles?.length && `Learning styles: ${ctx.learning_styles.join(", ")}`,
            ctx.temperament?.length && `Temperament: ${ctx.temperament.join(", ")}`,
            ctx.flags?.length && `Flags: ${ctx.flags.join(", ")}`,
            ctx.parent_goals && `Parent goals: ${ctx.parent_goals}`,
            ctx.teacher_recommendation && `Teacher recommendation: ${ctx.teacher_recommendation}`,
          ].filter(Boolean).join("\n");
          const combinedNotes = [preAssess.teacher_notes, contextNote].filter(Boolean).join("\n\n") || null;
          const { data: assessRow, error: assessErr } = await supabase
            .from("baseline_assessments")
            .insert({
              student_id: student.id,
              branch_id: branchId,
              assessed_by: preAssess.assessed_by ?? null,
              // Legacy aggregate columns are INTEGER — round any computed averages (e.g. 3.6 → 4).
              motor_skills_score: Math.round(Number(preAssess.motor_skills_score ?? 3)),
              language_score: Math.round(Number(preAssess.language_score ?? 3)),
              socio_emotional_score: Math.round(Number(preAssess.socio_emotional_score ?? 3)),
              cognitive_score: Math.round(Number(preAssess.cognitive_score ?? 3)),
              // 7-domain KSPK scores (new format from PreEnrollmentAssessmentDialog v3)
              domain_scores: preAssess.kspk_domain_scores ?? null,
              checklist_responses: checklistResponses.length ? checklistResponses : null,
              teacher_notes: combinedNotes,
              lead_id: lead?.id ?? null,
              source: "pre_enrollment",
            } as any)
            .select("id")
            .single();
          if (assessErr) {
            console.error("baseline_assessments insert failed:", assessErr);
            toast({
              title: "Pre-enrollment assessment not copied",
              description: assessErr.message,
              variant: "destructive",
            });
          }
          if (assessRow?.id) {
            // Fire methodology recommendation (best-effort, non-blocking on failure)
            supabase.functions
              .invoke("assess-methodology", { body: { assessment_id: assessRow.id } })
              .catch((err) => console.warn("assess-methodology failed:", err));
          }

          // Promote parent goals from pre-enrollment context into child_goals
          const parentGoalsText = (ctx.parent_goals ?? "").trim();
          if (parentGoalsText) {
            const goals = parentGoalsText
              .split(/\r?\n|;|\u2022/)
              .map((g: string) => g.trim())
              .filter((g: string) => g.length > 2)
              .slice(0, 8);
            if (goals.length) {
              await supabase.from("child_goals" as any).insert(
                goals.map((title: string) => ({
                  student_id: student.id,
                  branch_id: branchId,
                  scope: "parent",
                  title,
                  description: "Imported from pre-enrollment intake",
                }))
              );
            }
          }
        } catch (err) {
          console.warn("Failed to copy pre-enrollment assessment:", err);
          toast({
            title: "Could not copy pre-enrollment assessment",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        }
      }

      // Provision each parent account (best effort — surface errors but keep going)
      const parentResults: { relation: string; ok: boolean; error?: string }[] = [];
      for (const p of [mother, father]) {
        if (!p.enabled) continue;
        const { data, error } = await supabase.functions.invoke(
          "provision-parent-account",
          {
            body: {
              student_id: student.id,
              branch_id: branchId,
              relation: p.relation,
              email: p.email.trim().toLowerCase(),
              first_name: p.first_name.trim() || undefined,
              last_name: p.last_name.trim() || undefined,
              phone: p.phone.trim() || undefined,
              ic_number: p.ic_number.trim() || undefined,
              occupation: p.occupation.trim() || undefined,
              is_primary: p.is_primary,
              send_email: p.send_invite,
            },
          },
        );
        if (error) {
          parentResults.push({ relation: p.relation, ok: false, error: error.message });
        } else {
          parentResults.push({ relation: p.relation, ok: !!(data as any)?.success });
        }
      }

      const failed = parentResults.filter((r) => !r.ok);
      if (failed.length) {
        toast({
          title: "Student enrolled, parent invites had issues",
          description: failed
            .map((f) => `${f.relation}: ${f.error ?? "unknown error"}`)
            .join("; "),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Enrolled 🎓",
          description: `${firstName} has been enrolled and parent invite${
            parentResults.length > 1 ? "s" : ""
          } sent.`,
        });
      }

      const feesNumber = totalFeesPaid.trim() === "" ? null : Number(totalFeesPaid);
      onEnrolled(student.id, {
        totalFeesPaid: Number.isFinite(feesNumber as number) ? (feesNumber as number) : null,
        paymentMethod: paymentMethod || null,
        paymentReference: paymentReference.trim() || null,
        paymentDate: paymentDate || null,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Enrollment failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Enroll {lead?.child_name ?? "Student"}
          </DialogTitle>
          <DialogDescription>
            Capture the details needed to enrol the child and invite their parents to the app.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="child" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="child"><GraduationCap className="h-4 w-4 mr-1" />Child</TabsTrigger>
            <TabsTrigger value="parents"><Users className="h-4 w-4 mr-1" />Parents</TabsTrigger>
            <TabsTrigger value="fees"><Wallet className="h-4 w-4 mr-1" />Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="child" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name *</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date of birth</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Class *</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder={classes.length ? "Select class" : "No classes — create one first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nationality</Label>
                <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Malaysian" />
              </div>
              <div className="space-y-1.5">
                <Label>Race</Label>
                <Input value={race} onChange={(e) => setRace(e.target.value)} placeholder="e.g. Malay, Chinese" />
              </div>
              <div className="space-y-1.5">
                <Label>Religion</Label>
                <Input value={religion} onChange={(e) => setReligion(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Birth certificate / MyKid no.</Label>
                <Input value={birthCertNo} onChange={(e) => setBirthCertNo(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Home address *</Label>
                <Textarea rows={2} value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Street, city, postcode" />
              </div>
              <div className="space-y-1.5">
                <Label>Blood type</Label>
                <Input value={bloodType} onChange={(e) => setBloodType(e.target.value)} placeholder="e.g. A+" />
              </div>
              <div className="space-y-1.5">
                <Label>Dietary notes</Label>
                <Input value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} placeholder="e.g. Halal, vegetarian" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Allergies / medical notes</Label>
                <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="None" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Medical conditions</Label>
                <Textarea rows={2} value={medicalConditions} onChange={(e) => setMedicalConditions(e.target.value)} placeholder="e.g. Asthma, eczema" />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency contact name</Label>
                <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Emergency contact phone</Label>
                <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+60..." />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Emergency contact relation</Label>
                <Input value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} placeholder="e.g. Grandmother" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="parents" className="space-y-4 pt-4">
            <ParentFieldset
              label="Mother"
              parent={mother}
              setParent={setMother}
              setPrimary={setMotherPrimary}
            />
            <ParentFieldset
              label="Father"
              parent={father}
              setParent={setFather}
              setPrimary={setFatherPrimary}
            />
            <p className="text-xs text-muted-foreground">
              Each enabled parent gets their own login. The primary contact receives priority notifications.
              A welcome email with a temporary password is sent automatically when "Send invite" is on.
            </p>
          </TabsContent>

          <TabsContent value="fees" className="space-y-4 pt-4">
            <div className="rounded-lg border bg-primary-wash/40 p-3 text-xs text-foreground/80">
              These figures are for <strong>admissions attribution and Marketing ROI</strong> only. They do
              not create a finance invoice or replace any official receipt — record the full transaction in
              the Billing module separately.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Total fees paid at enrollment (RM) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={totalFeesPaid}
                  onChange={(e) => setTotalFeesPaid(e.target.value)}
                  placeholder="e.g. 1500.00"
                />
                <p className="text-[11px] text-muted-foreground">
                  Sum of registration, deposit, materials and any first-month fee collected today.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="fpx">FPX / Online Banking</SelectItem>
                    <SelectItem value="card">Credit / Debit Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Receipt / reference no.</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. RCPT-2026-0001"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enrolling…</>
            ) : (
              "Enrol & invite parents"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParentFieldset({
  label,
  parent,
  setParent,
  setPrimary,
}: {
  label: string;
  parent: ParentForm;
  setParent: (updater: (p: ParentForm) => ParentForm) => void;
  setPrimary: (v: boolean) => void;
}) {
  const upd = <K extends keyof ParentForm>(k: K, v: ParentForm[K]) =>
    setParent((p) => ({ ...p, [k]: v }));
  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={parent.enabled} onCheckedChange={(v) => upd("enabled", v)} />
          <span className="font-medium">{label}</span>
        </div>
        {parent.enabled && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={parent.is_primary} onCheckedChange={setPrimary} />
            Primary contact
          </label>
        )}
      </div>
      {parent.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">First name *</Label>
              <Input value={parent.first_name} onChange={(e) => upd("first_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last name</Label>
              <Input value={parent.last_name} onChange={(e) => upd("last_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={parent.email} onChange={(e) => upd("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={parent.phone} onChange={(e) => upd("phone", e.target.value)} placeholder="+60..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">IC / NRIC no.</Label>
              <Input value={parent.ic_number} onChange={(e) => upd("ic_number", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Occupation</Label>
              <Input value={parent.occupation} onChange={(e) => upd("occupation", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={parent.send_invite} onCheckedChange={(v) => upd("send_invite", v)} />
            Send welcome email with temporary password
          </label>
        </>
      )}
    </div>
  );
}