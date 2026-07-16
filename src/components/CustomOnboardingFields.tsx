import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomOnboardingFieldsProps {
  branchId: string;
  formType: "staff" | "parent";
  stepLabel: string;
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}

export default function CustomOnboardingFields({ branchId, formType, stepLabel, values, onChange }: CustomOnboardingFieldsProps) {
  const { data: fields = [] } = useQuery({
    queryKey: ["onboarding-fields", branchId, formType, stepLabel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_form_fields")
        .select("*")
        .eq("branch_id", branchId)
        .eq("form_type", formType)
        .eq("step_label", stepLabel)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  if (fields.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-border mt-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Questions</p>
      {fields.map((field: any) => {
        const val = values[field.id] ?? "";
        const options: string[] = Array.isArray(field.options) ? field.options : [];

        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="text-sm">
              {field.field_label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.field_type === "text" && (
              <Input value={val} onChange={(e) => onChange(field.id, e.target.value)} />
            )}

            {field.field_type === "textarea" && (
              <Textarea value={val} onChange={(e) => onChange(field.id, e.target.value)} rows={3} />
            )}

            {field.field_type === "date" && (
              <Input type="date" value={val} onChange={(e) => onChange(field.id, e.target.value)} />
            )}

            {field.field_type === "select" && (
              <Select value={val} onValueChange={(v) => onChange(field.id, v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
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
                  onCheckedChange={(checked) => onChange(field.id, String(!!checked))}
                />
                <span className="text-sm text-muted-foreground">Yes</span>
              </div>
            )}

            {field.field_type === "file" && (
              <Input type="file" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange(field.id, file.name);
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
