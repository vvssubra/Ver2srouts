import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Plus } from "lucide-react";

export interface InterventionGroup {
  group_name: string;
  students: string[];
  shared_gaps: string[];
  shared_standard_codes: string[];
  suggested_group_activity: string;
}

interface InterventionGroupsCardProps {
  groups: InterventionGroup[];
  onAddToPlan?: (activity: { name: string; description: string; standards: string[]; students: string[] }) => void;
}

export default function InterventionGroupsCard({ groups, onAddToPlan }: InterventionGroupsCardProps) {
  if (!groups || groups.length === 0) return null;

  return (
    <Card className="border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-purple-800 dark:text-purple-300">
          <Users className="h-4 w-4" />
          Suggested Small Groups — Intervention Clusters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((group, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-purple-200 dark:border-purple-800/40 bg-background p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-semibold border-purple-300 text-purple-700 dark:text-purple-300">
                {group.group_name}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{group.students.length} students</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {group.students.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{name}</Badge>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Shared Gaps</p>
              <p className="text-xs text-foreground/80">{group.shared_gaps.join("; ")}</p>
            </div>
            {group.shared_standard_codes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {group.shared_standard_codes.map((code, i) => (
                  <Badge key={i} variant="default" className="text-[10px] px-1.5 py-0">{code}</Badge>
                ))}
              </div>
            )}
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded p-2">
              <p className="text-[10px] font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wide">Suggested Group Activity</p>
              <p className="text-xs text-foreground/80">{group.suggested_group_activity}</p>
            </div>
            {onAddToPlan && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs border-purple-300 text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-950/50"
                onClick={() => onAddToPlan({
                  name: `${group.group_name} — Intervention`,
                  description: group.suggested_group_activity,
                  standards: group.shared_standard_codes,
                  students: group.students,
                })}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add to Today's Plan
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
