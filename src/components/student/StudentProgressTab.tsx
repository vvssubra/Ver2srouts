import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, TrendingUp, ClipboardCheck } from "lucide-react";
import StudentAcademicTab from "./StudentAcademicTab";
import StudentGrowthTab from "./StudentGrowthTab";
import StudentAssessmentsTab from "./StudentAssessmentsTab";
import { NewUpdateSheet } from "@/components/daily-updates/NewUpdateSheet";

/**
 * Child 360 Progress hub — consolidates the legacy Academic, Growth and
 * Assessments tabs into one surface with three sub-views.
 *
 * - Snapshot: top-of-funnel stats + recent observations + class plans (was Academic).
 * - Growth:   trends, radar, goals, 90-day observation rollup.
 * - Assessments: KSPK baseline + checklist history with deltas.
 *
 * Also owns the single "Record Observation" affordance — opens the Learning
 * Journey NewUpdateSheet pre-scoped to this child so observations always
 * flow through ONE funnel.
 */
type View = "snapshot" | "growth" | "assessments";

interface Props {
  studentId: string;
  classId?: string | null;
  branchId: string;
  /** Optional controlled view — lets the parent (ChildHeroBar) deep-link. */
  view?: View;
  onViewChange?: (v: View) => void;
}

const VIEWS: { id: View; label: string; icon: typeof Sparkles }[] = [
  { id: "snapshot",    label: "Snapshot",    icon: Sparkles },
  { id: "growth",      label: "Growth",      icon: TrendingUp },
  { id: "assessments", label: "Assessments", icon: ClipboardCheck },
];

export default function StudentProgressTab({ studentId, classId, branchId, view: controlledView, onViewChange }: Props) {
  const [internalView, setInternalView] = useState<View>("snapshot");
  const view = controlledView ?? internalView;
  const setView = (v: View) => {
    setInternalView(v);
    onViewChange?.(v);
  };
  const [obsOpen, setObsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Sub-view segmented control (actions live in the ChildHeroBar above) */}
      <Card className="sticky top-2 z-10 backdrop-blur-sm bg-card/85 border-border/60">
        <CardContent className="p-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {v.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {view === "snapshot" && (
        <StudentAcademicTab
          studentId={studentId}
          classId={classId ?? undefined}
          branchId={branchId}
          onRecordObservation={() => setObsOpen(true)}
        />
      )}
      {view === "growth" && (
        <StudentGrowthTab studentId={studentId} branchId={branchId} />
      )}
      {view === "assessments" && (
        <StudentAssessmentsTab studentId={studentId} branchId={branchId} />
      )}

      <NewUpdateSheet
        open={obsOpen}
        onOpenChange={setObsOpen}
        initialStudentId={studentId}
        initialClassId={classId ?? null}
      />
    </div>
  );
}