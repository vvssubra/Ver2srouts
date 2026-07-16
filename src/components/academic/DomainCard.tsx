import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DOMAIN_COLORS: Record<string, string> = {
  CL: "bg-blue-100 text-blue-800 border-blue-200",
  EL: "bg-purple-100 text-purple-800 border-purple-200",
  NT: "bg-amber-100 text-amber-800 border-amber-200",
  PM: "bg-green-100 text-green-800 border-green-200",
  SE: "bg-pink-100 text-pink-800 border-pink-200",
  CD: "bg-orange-100 text-orange-800 border-orange-200",
  VC: "bg-teal-100 text-teal-800 border-teal-200",
};

const DOMAIN_ACCENT: Record<string, string> = {
  CL: "border-l-blue-500",
  EL: "border-l-purple-500",
  NT: "border-l-amber-500",
  PM: "border-l-green-500",
  SE: "border-l-pink-500",
  CD: "border-l-orange-500",
  VC: "border-l-teal-500",
};

interface Outcome {
  id: string;
  outcome_code: string;
  outcome_title: string;
  outcome_description?: string;
  indicators?: { id: string; indicator_text: string; evidence_type?: string }[];
}

interface DomainCardProps {
  domain: { id: string; code: string; name: string; description?: string };
  outcomes: Outcome[];
  ageLabel?: string;
}

export default function DomainCard({ domain, outcomes, ageLabel }: DomainCardProps) {
  const [open, setOpen] = useState(false);
  const colorClass = DOMAIN_COLORS[domain.code] || "bg-muted text-muted-foreground";
  const accentClass = DOMAIN_ACCENT[domain.code] || "border-l-primary";

  return (
    <Card className={`border-l-4 ${accentClass} transition-shadow hover:shadow-md`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={colorClass}>{domain.code}</Badge>
                <CardTitle className="text-base">{domain.name}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{outcomes.length} outcomes</Badge>
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
            {domain.description && <p className="text-sm text-muted-foreground mt-1">{domain.description}</p>}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {outcomes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No outcomes defined yet{ageLabel ? ` for Age ${ageLabel}` : ""}.</p>
            ) : (
              outcomes.map((o) => (
                <OutcomeItem key={o.id} outcome={o} />
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function OutcomeItem({ outcome }: { outcome: Outcome }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div
        className="flex items-start gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <Target className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{outcome.outcome_code}</span>
            <span className="text-sm font-medium">{outcome.outcome_title}</span>
          </div>
        </div>
        {outcome.indicators && outcome.indicators.length > 0 && (
          <Badge variant="outline" className="text-xs shrink-0">{outcome.indicators.length} indicators</Badge>
        )}
      </div>
      {expanded && outcome.indicators && outcome.indicators.length > 0 && (
        <div className="mt-2 ml-6 space-y-1">
          {outcome.indicators.map((ind) => (
            <div key={ind.id} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-1">•</span>
              <span>{ind.indicator_text}</span>
              {ind.evidence_type && (
                <Badge variant="outline" className="text-[10px] shrink-0">{ind.evidence_type}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
