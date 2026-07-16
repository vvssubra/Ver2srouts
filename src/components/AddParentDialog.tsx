import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Relation = "mother" | "father" | "guardian" | "other";

export type AddParentPrefill = {
  relation?: Relation;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  ic_number?: string;
  occupation?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  branchId: string;
  studentName?: string;
  prefill?: AddParentPrefill | null;
}

export default function AddParentDialog({ open, onOpenChange, studentId, branchId, studentName, prefill }: Props) {
  const qc = useQueryClient();
  const [relation, setRelation] = useState<Relation>("mother");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [occupation, setOccupation] = useState("");
  const [isPrimary, setIsPrimary] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRelation("mother");
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setIcNumber(""); setOccupation("");
    setIsPrimary(true); setSendEmail(true);
  };

  // Pre-fill the form when the dialog is opened with a prefill payload.
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      if (prefill.relation) setRelation(prefill.relation);
      if (prefill.first_name !== undefined) setFirstName(prefill.first_name ?? "");
      if (prefill.last_name !== undefined) setLastName(prefill.last_name ?? "");
      if (prefill.email !== undefined) setEmail(prefill.email ?? "");
      if (prefill.phone !== undefined) setPhone(prefill.phone ?? "");
      if (prefill.ic_number !== undefined) setIcNumber(prefill.ic_number ?? "");
      if (prefill.occupation !== undefined) setOccupation(prefill.occupation ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!email.trim() || !firstName.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-parent-account", {
        body: {
          student_id: studentId,
          branch_id: branchId,
          relation,
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          ic_number: icNumber.trim() || null,
          occupation: occupation.trim() || null,
          is_primary: isPrimary,
          send_email: sendEmail,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      qc.invalidateQueries({ queryKey: ["student-parents", studentId] });
      toast({
        title: "Parent account created ✅",
        description: sendEmail
          ? "Welcome kit with temporary password sent."
          : "Parent linked. No email sent.",
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not create parent", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add parent</DialogTitle>
          <DialogDescription>
            {studentName ? `Create a parent account linked to ${studentName}.` : "Create and link a parent account."}
            {" "}A temporary password will be emailed if enabled.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label>Relation</Label>
            <Select value={relation} onValueChange={(v) => setRelation(v as Relation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mother">Mother</SelectItem>
                <SelectItem value="father">Father</SelectItem>
                <SelectItem value="guardian">Guardian</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>IC / NRIC no.</Label>
              <Input value={icNumber} onChange={(e) => setIcNumber(e.target.value)} />
            </div>
            <div>
              <Label>Occupation</Label>
              <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div>
              <p className="text-sm font-medium">Primary contact</p>
              <p className="text-xs text-muted-foreground">School will call this parent first.</p>
            </div>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div>
              <p className="text-sm font-medium">Send welcome email</p>
              <p className="text-xs text-muted-foreground">Includes temporary password & login link.</p>
            </div>
            <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : "Create parent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}