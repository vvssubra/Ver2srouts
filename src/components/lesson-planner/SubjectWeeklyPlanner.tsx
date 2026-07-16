import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Target } from "lucide-react";
import type { LearningArea } from "./types";

interface DevelopmentDomain {
  id: string;
  domain_name: string;
  description?: string;
}

interface SubjectWeeklyPlannerProps {
  selectedSubject: string;
  onSubjectChange: (v: string) => void;
  domainFocus: string;
  onDomainFocusChange: (v: string) => void;
  autoTunjang: string;
  subjectMap: any[];
  learningAreas: LearningArea[];
  developmentDomains?: DevelopmentDomain[];
  availableSubjects?: string[];
}

export default function SubjectWeeklyPlanner({
  selectedSubject,
  onSubjectChange,
  domainFocus,
  onDomainFocusChange,
  autoTunjang,
  subjectMap,
  learningAreas,
  developmentDomains = [],
  availableSubjects,
}: SubjectWeeklyPlannerProps) {
  // If availableSubjects is provided, filter to only those subjects
  const subjectsToShow = availableSubjects && availableSubjects.length > 0
    ? availableSubjects.map((name) => ({ subject_name: name }))
    : subjectMap;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Subject
        </Label>
        <Select value={selectedSubject} onValueChange={(v) => { onSubjectChange(v); onDomainFocusChange(""); }}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Choose a subject" />
          </SelectTrigger>
          <SelectContent>
            {(() => {
              const parents = subjectsToShow.filter((s: any) => !s.parent_subject);
              const children = subjectsToShow.filter((s: any) => !!s.parent_subject);
              const items: React.ReactNode[] = [];
              for (const p of parents) {
                items.push(
                  <SelectItem key={p.subject_name} value={p.subject_name}>{p.subject_name}</SelectItem>
                );
                const subs = children.filter((c: any) => c.parent_subject === p.subject_name);
                for (const sub of subs) {
                  items.push(
                    <SelectItem key={sub.subject_name} value={sub.subject_name}>
                      &nbsp;&nbsp;├ {sub.subject_name}
                    </SelectItem>
                  );
                }
              }
              return items;
            })()}
          </SelectContent>
        </Select>
        {autoTunjang && (
          <p className="text-[10px] text-muted-foreground mt-0.5">KSPK: {autoTunjang}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Domain Focus <span className="text-[10px] font-normal normal-case">(optional)</span>
        </Label>
        <Select value={domainFocus || "auto"} onValueChange={(v) => onDomainFocusChange(v === "auto" ? "" : v)}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder={autoTunjang || "Auto-detect"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect from subject</SelectItem>
            {developmentDomains.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1">School Domains</div>
                {developmentDomains.map((d) => (
                  <SelectItem key={`dom-${d.id}`} value={`domain:${d.domain_name}`}>
                    🏫 {d.domain_name}
                  </SelectItem>
                ))}
              </>
            )}
            <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1">KSPK Learning Areas</div>
            {learningAreas.map((la) => (
              <SelectItem key={la.id} value={la.name_en || la.name_ms}>
                {la.code}: {la.name_en || la.name_ms}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
