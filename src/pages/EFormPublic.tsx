import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2, FileText } from "lucide-react";

const DEFAULT_FIELDS: Record<string, Array<{ id: string; label: string; type: string; required: boolean; options?: string[] }>> = {
  interest: [
    { id: "parent_name", label: "Parent Name", type: "text", required: true },
    { id: "email", label: "Email Address", type: "text", required: true },
    { id: "phone", label: "Phone Number", type: "text", required: true },
    { id: "child_name", label: "Child's Name", type: "text", required: true },
    { id: "child_age", label: "Child's Age", type: "text", required: true },
    { id: "interest_notes", label: "What are you interested in?", type: "textarea", required: false },
  ],
  registration: [
    { id: "parent_name", label: "Parent/Guardian Name", type: "text", required: true },
    { id: "parent_ic", label: "Parent IC/Passport No", type: "text", required: true },
    { id: "email", label: "Email Address", type: "text", required: true },
    { id: "phone", label: "Phone Number", type: "text", required: true },
    { id: "address", label: "Home Address", type: "textarea", required: true },
    { id: "child_name", label: "Child's Full Name", type: "text", required: true },
    { id: "child_dob", label: "Child's Date of Birth", type: "date", required: true },
    { id: "child_gender", label: "Child's Gender", type: "select", required: true, options: ["Male", "Female"] },
    { id: "allergies", label: "Allergies / Medical Conditions", type: "textarea", required: false },
    { id: "emergency_contact", label: "Emergency Contact Name", type: "text", required: true },
    { id: "emergency_phone", label: "Emergency Contact Phone", type: "text", required: true },
  ],
  parent_onboarding: [
    { id: "parent_name", label: "Parent/Guardian Name", type: "text", required: true },
    { id: "email", label: "Email Address", type: "text", required: true },
    { id: "phone", label: "Phone Number", type: "text", required: true },
    { id: "child_name", label: "Child's Full Name", type: "text", required: true },
    { id: "child_dob", label: "Child's Date of Birth", type: "date", required: true },
  ],
  staff_onboarding: [
    { id: "full_name", label: "Full Name (as per IC)", type: "text", required: true },
    { id: "ic_number", label: "IC Number", type: "text", required: true },
    { id: "email", label: "Email Address", type: "text", required: true },
    { id: "phone", label: "Phone Number", type: "text", required: true },
    { id: "address", label: "Home Address", type: "textarea", required: true },
    { id: "bank_name", label: "Bank Name", type: "text", required: true },
    { id: "bank_account", label: "Bank Account Number", type: "text", required: true },
  ],
};

export default function EFormPublic() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<any>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadForm = async () => {
      if (!token) return;
      const { data: eformRows, error } = await (supabase as any)
        .rpc("get_eform_by_token", { p_token: token });
      const eform: any = Array.isArray(eformRows) ? eformRows[0] : eformRows;

      if (error || !eform) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setForm(eform);

      // Load custom fields
      const formTypeMap: Record<string, string> = {
        interest: "parent",
        registration: "parent",
        parent_onboarding: "parent",
        staff_onboarding: "staff",
      };
      const { data: fields } = await supabase
        .from("onboarding_form_fields")
        .select("*")
        .eq("branch_id", eform.branch_id)
        .eq("form_type", formTypeMap[eform.form_type] || "parent")
        .eq("is_active", true)
        .order("sort_order");

      setCustomFields(fields ?? []);
      setLoading(false);
    };
    loadForm();
  }, [token]);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form) return;
    setSubmitting(true);
    try {
      // Submit via token-validated RPC (server verifies share_token + active form)
      const { error } = await supabase.rpc("submit_eform", {
        p_share_token: token as string,
        p_recipient_name: values.parent_name || values.full_name || "",
        p_recipient_email: values.email || "",
        p_recipient_phone: values.phone || null,
        p_child_name: values.child_name || null,
        p_child_level: null,
        p_submitted_data: values,
      });

      if (error) throw error;

      // If interest form, auto-create lead
      if (form.form_type === "interest") {
        await supabase.from("leads").insert({
          branch_id: form.branch_id,
          parent_name: values.parent_name || "",
          child_name: values.child_name || "",
          child_age: values.child_age ? parseInt(values.child_age) : null,
          phone: values.phone || null,
          email: values.email || null,
          notes: values.interest_notes || null,
          created_by: form.created_by,
          status: "new",
        });
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Form Not Found</h1>
        <p className="text-muted-foreground">This form link is invalid or no longer active.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <div className="rounded-full bg-accent/10 p-6 mb-6">
          <CheckCircle2 className="h-16 w-16 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Thank You!</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your form has been submitted successfully. We will review your information and get back to you shortly.
        </p>
      </div>
    );
  }

  const defaults = DEFAULT_FIELDS[form.form_type] || [];

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center border-b">
            <CardTitle className="text-xl">{form.name}</CardTitle>
            {form.description && (
              <CardDescription>{form.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Default fields */}
            {defaults.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === "text" && (
                  <Input
                    value={values[field.id] || ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                  />
                )}
                {field.type === "textarea" && (
                  <Textarea
                    value={values[field.id] || ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    rows={3}
                  />
                )}
                {field.type === "date" && (
                  <Input
                    type="date"
                    value={values[field.id] || ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                  />
                )}
                {field.type === "select" && field.options && (
                  <Select
                    value={values[field.id] || ""}
                    onValueChange={(v) => handleChange(field.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}

            {/* Custom fields */}
            {customFields.length > 0 && (
              <>
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
                    Additional Questions
                  </p>
                </div>
                {customFields.map((field: any) => {
                  const val = values[`custom_${field.id}`] || "";
                  const options: string[] = Array.isArray(field.options) ? field.options : [];
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label className="text-sm">
                        {field.field_label}
                        {field.is_required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      {field.field_type === "text" && (
                        <Input
                          value={val}
                          onChange={(e) => handleChange(`custom_${field.id}`, e.target.value)}
                        />
                      )}
                      {field.field_type === "textarea" && (
                        <Textarea
                          value={val}
                          onChange={(e) => handleChange(`custom_${field.id}`, e.target.value)}
                          rows={3}
                        />
                      )}
                      {field.field_type === "date" && (
                        <Input
                          type="date"
                          value={val}
                          onChange={(e) => handleChange(`custom_${field.id}`, e.target.value)}
                        />
                      )}
                      {field.field_type === "select" && (
                        <Select value={val} onValueChange={(v) => handleChange(`custom_${field.id}`, v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {field.field_type === "checkbox" && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={val === "true"}
                            onCheckedChange={(c) => handleChange(`custom_${field.id}`, String(!!c))}
                          />
                          <span className="text-sm text-muted-foreground">Yes</span>
                        </div>
                      )}
                      {field.field_type === "file" && (
                        <Input type="file" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleChange(`custom_${field.id}`, file.name);
                        }} />
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Form"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
