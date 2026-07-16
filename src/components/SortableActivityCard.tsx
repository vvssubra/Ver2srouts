import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, GripVertical, Pencil, Trash2 } from "lucide-react";

export type GapIntervention = {
  student_name: string;
  gap: string;
  suggested_activity: string;
};

export type Activity = {
  name: string;
  name_ms: string;
  duration_minutes: number;
  learning_area: string;
  standards_addressed: string[];
  description: string;
  materials: string[];
  teacher_notes: string;
  expected_outcomes: string;
  differentiation_strategies?: {
    support_needed: string;
    advanced_challenge: string;
  };
  provocation_questions?: string[];
  observation_cues?: string;
  learning_objective?: string;
  procedure?: {
    introduction: string;
    activity: string;
    conclusion: string;
  };
  book_page?: string;
  teacher_reflection?: string;
  gap_interventions?: GapIntervention[];
};

interface SortableActivityCardProps {
  id: string;
  activity: Activity;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SortableActivityCard({
  id,
  activity: act,
  canEdit,
  onEdit,
  onDelete,
}: SortableActivityCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Card ref={setNodeRef} style={style} className={isDragging ? "shadow-lg ring-2 ring-primary/20" : ""}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            {canEdit && (
              <button
                {...attributes}
                {...listeners}
                className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div>
              <h4 className="font-semibold text-sm">{act.name}</h4>
              <p className="text-xs text-muted-foreground">{act.name_ms}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{act.duration_minutes} min</Badge>
            <Badge variant="secondary" className="text-xs">{act.learning_area}</Badge>
            {act.book_page && (
              <Badge variant="outline" className="text-xs">📖 {act.book_page}</Badge>
            )}
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Learning Objective */}
        {act.learning_objective && (
          <div className="rounded-lg p-3 bg-primary/5 border border-primary/20">
            <p className="text-xs font-semibold text-primary mb-1">🎯 Learning Objective</p>
            <p className="text-xs text-foreground/80">{act.learning_objective}</p>
          </div>
        )}

        <p className="text-sm text-foreground/80">{act.description}</p>

        {/* Structured Procedure */}
        {act.procedure && (act.procedure.introduction || act.procedure.activity || act.procedure.conclusion) && (
          <div className="rounded-lg border border-border overflow-hidden">
            {act.procedure.introduction && (
              <div className="p-2.5 bg-sky-50 dark:bg-sky-950/20 border-b border-border">
                <p className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wide mb-0.5">Introduction (~5 min)</p>
                <p className="text-xs text-foreground/80">{act.procedure.introduction}</p>
              </div>
            )}
            {act.procedure.activity && (
              <div className="p-2.5 bg-background border-b border-border">
                <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide mb-0.5">Main Activity (~20 min)</p>
                <p className="text-xs text-foreground/80">{act.procedure.activity}</p>
              </div>
            )}
            {act.procedure.conclusion && (
              <div className="p-2.5 bg-violet-50 dark:bg-violet-950/20">
                <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-0.5">Conclusion (~5 min)</p>
                <p className="text-xs text-foreground/80">{act.procedure.conclusion}</p>
              </div>
            )}
          </div>
        )}

        {act.standards_addressed?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {act.standards_addressed.map((code) => (
              <Badge key={code} variant="default" className="text-[10px] px-1.5 py-0">{code}</Badge>
            ))}
          </div>
        )}
        {act.materials?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Bahan / Materials:</p>
            <p className="text-xs text-foreground/70">{act.materials.join(", ")}</p>
          </div>
        )}
        {act.teacher_notes && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">📝 Nota Guru / Teacher Notes:</p>
            <p className="text-xs text-foreground/70">{act.teacher_notes}</p>
          </div>
        )}
        {act.expected_outcomes && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/70">{act.expected_outcomes}</p>
          </div>
        )}

        {/* Pedagogical Enhancement Cards */}
        {act.provocation_questions && act.provocation_questions.length > 0 && (
          <div className="rounded-lg p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
              🎯 Provocation Questions
            </p>
            <ul className="space-y-1">
              {act.provocation_questions.map((q, i) => (
                <li key={i} className="text-xs text-amber-900/80 dark:text-amber-200/80 flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span className="italic">{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {act.differentiation_strategies && (act.differentiation_strategies.support_needed || act.differentiation_strategies.advanced_challenge) && (
          <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5 flex items-center gap-1.5">
              🪜 Differentiation
            </p>
            {act.differentiation_strategies.support_needed && (
              <div className="mb-1.5">
                <p className="text-[10px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Support Needed</p>
                <p className="text-xs text-blue-900/80 dark:text-blue-200/80">{act.differentiation_strategies.support_needed}</p>
              </div>
            )}
            {act.differentiation_strategies.advanced_challenge && (
              <div>
                <p className="text-[10px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Advanced Challenge</p>
                <p className="text-xs text-blue-900/80 dark:text-blue-200/80">{act.differentiation_strategies.advanced_challenge}</p>
              </div>
            )}
          </div>
        )}

        {act.observation_cues && (
          <div className="rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
              👁️ Observation Cue
            </p>
            <p className="text-xs text-emerald-900/80 dark:text-emerald-200/80">{act.observation_cues}</p>
          </div>
        )}

        {/* Teacher Reflection */}
        {act.teacher_reflection && (
          <div className="rounded-lg p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50">
            <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-1 flex items-center gap-1.5">
              📝 Teacher Reflection
            </p>
            <p className="text-xs text-orange-900/80 dark:text-orange-200/80 italic">{act.teacher_reflection}</p>
          </div>
        )}

        {/* Gap Interventions */}
        {act.gap_interventions && act.gap_interventions.length > 0 && (
          <div className="rounded-lg p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
            <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 mb-1.5 flex items-center gap-1.5">
              🎯 Gap Remediation — Targeted Interventions
            </p>
            <div className="space-y-2">
              {act.gap_interventions.map((gi, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] shrink-0 border-rose-300 text-rose-700 dark:text-rose-300">
                    {gi.student_name}
                  </Badge>
                  <div>
                    <p className="text-rose-900/70 dark:text-rose-200/70"><span className="font-medium">Gap:</span> {gi.gap}</p>
                    <p className="text-rose-900/80 dark:text-rose-200/80"><span className="font-medium">Activity:</span> {gi.suggested_activity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
