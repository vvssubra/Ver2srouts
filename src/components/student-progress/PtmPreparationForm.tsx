import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { PreparationDraft } from "@/lib/ptm/preparation";

const FIELDS: Array<{ key: keyof PreparationDraft; label: string; placeholder: string; required?: boolean }> = [
  { key: "strengths", label: "Student Strengths", placeholder: "What has this child shown they do well this term?", required: true },
  { key: "areas_for_development", label: "Areas for Development", placeholder: "Where does the child need more support?", required: true },
  { key: "next_learning_goals", label: "Next Learning Goals", placeholder: "Specific goals for the upcoming term.", required: true },
  { key: "home_activities", label: "Home Activities", placeholder: "Suggested activities parents can try at home.", required: true },
  { key: "discussion_notes", label: "PTM Discussion Notes", placeholder: "Key points you want to raise with parents during the meeting.", required: true },
  { key: "action_plan", label: "Action Plan", placeholder: "Agreed next steps, owners and timelines.", required: true },
];

export function PtmPreparationForm({
  value,
  onChange,
  disabled,
}: {
  value: PreparationDraft;
  onChange: (next: PreparationDraft) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`prep-${f.key}`} className="text-xs font-medium">
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </Label>
          <Textarea
            id={`prep-${f.key}`}
            value={value[f.key]}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className="min-h-[90px] text-sm"
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

export default PtmPreparationForm;