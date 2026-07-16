import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, CheckCircle2, Circle, Target } from "lucide-react";

interface SmartGoalHelperProps {
  smart_specific: string;
  smart_measurable: string;
  smart_achievable: string;
  smart_relevant: string;
  smart_timebound: string;
  onChange: (field: string, value: string) => void;
  readOnly?: boolean;
}

const SMART_FIELDS = [
  { key: "smart_specific", label: "Specific", hint: "What exactly will the child do?", placeholder: "e.g. Name and identify primary colours" },
  { key: "smart_measurable", label: "Measurable", hint: "How will you know they achieved it?", placeholder: "e.g. Correctly identifies 4 out of 5 colours" },
  { key: "smart_achievable", label: "Achievable", hint: "Is this realistic for the age group?", placeholder: "e.g. With guided practice and visual aids" },
  { key: "smart_relevant", label: "Relevant", hint: "Which domain/outcome does this support?", placeholder: "e.g. Supports early numeracy and sorting skills" },
  { key: "smart_timebound", label: "Time-bound", hint: "By when should this be achieved?", placeholder: "e.g. By end of Term 2" },
];

export function SmartGoalHelper({ smart_specific, smart_measurable, smart_achievable, smart_relevant, smart_timebound, onChange, readOnly }: SmartGoalHelperProps) {
  const values: Record<string, string> = { smart_specific, smart_measurable, smart_achievable, smart_relevant, smart_timebound };
  const filledCount = Object.values(values).filter(v => v && v.trim().length > 0).length;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto" type="button">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">SMART Goal Helper</span>
            <SmartBadge score={filledCount} />
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2 px-1">
        {SMART_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="flex items-center gap-1.5">
              {values[field.key]?.trim() ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <Label className="text-xs font-semibold">{field.label}</Label>
              <span className="text-xs text-muted-foreground">— {field.hint}</span>
            </div>
            <Input
              value={values[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={readOnly}
              className="text-sm"
            />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SmartBadge({ score }: { score: number }) {
  if (score === 0) return null;
  const color = score >= 5 ? "default" : score >= 3 ? "secondary" : "outline";
  return (
    <Badge variant={color} className="text-[10px] px-1.5 py-0">
      SMART {score}/5
    </Badge>
  );
}
