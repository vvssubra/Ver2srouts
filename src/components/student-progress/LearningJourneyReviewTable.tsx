import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, BookOpen } from "lucide-react";
import type { JourneyTimelineItem } from "@/lib/ptm/learning-journey";

interface Props {
  items: JourneyTimelineItem[];
  includedKeys: Set<string>;
  order: string[];
  onToggle: (key: string, included: boolean) => void;
  onMove: (key: string, direction: "up" | "down") => void;
  onToggleAll: (checked: boolean) => void;
}

export default function LearningJourneyReviewTable({
  items, includedKeys, order, onToggle, onMove, onToggleAll,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No Learning Journey records are available for the selected PTM period.
      </div>
    );
  }

  const byKey = new Map(items.map((i) => [i.key, i]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean) as JourneyTimelineItem[];
  const allSelected = ordered.every((i) => includedKeys.has(i.key));

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/40">
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => onToggleAll(!!v)}
            aria-label="Include all"
          />
          Include all ({includedKeys.size}/{ordered.length})
        </label>
        <span className="text-xs text-muted-foreground">
          Reorder with the arrows — the order below is the order printed in the booklet.
        </span>
      </div>
      <ul className="divide-y">
        {ordered.map((item, idx) => {
          const included = includedKeys.has(item.key);
          return (
            <li key={item.key} className={`flex items-start gap-3 px-3 py-3 ${!included ? "opacity-60" : ""}`}>
              <Checkbox
                checked={included}
                onCheckedChange={(v) => onToggle(item.key, !!v)}
                aria-label={`Include ${item.title}`}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {new Date(item.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  {item.source === "observation" ? (
                    <Badge variant="outline" className="text-[10px]">Curriculum</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1"><BookOpen className="h-3 w-3" />Journey</Badge>
                  )}
                  {item.tpLevel && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
                      {item.tpLevel}
                    </Badge>
                  )}
                  {item.domain && (
                    <span className="text-[11px] text-muted-foreground">· {item.domain}</span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">{item.title}</div>
                {item.teacherNote && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{item.teacherNote}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onMove(item.key, "up")}
                  disabled={idx === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onMove(item.key, "down")}
                  disabled={idx === ordered.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}