import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDown, ArrowUp, Star, ImageIcon } from "lucide-react";
import type { HighlightItem } from "@/lib/ptm/highlights";

interface Props {
  items: HighlightItem[];
  includedKeys: Set<string>;
  order: string[];
  onToggle: (key: string, included: boolean) => void;
  onMove: (key: string, direction: "up" | "down") => void;
  onToggleAll: (checked: boolean) => void;
}

export default function HighlightsReviewTable({
  items, includedKeys, order, onToggle, onMove, onToggleAll,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No approved milestones or learning photos are available for the selected PTM period.
        Mark moments as <strong>Milestone</strong> or <strong>Portfolio</strong> in Daily Updates to include them here.
      </div>
    );
  }

  const byKey = new Map(items.map((i) => [i.key, i]));
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean) as HighlightItem[];
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
          Reorder with the arrows — this is the order printed in the booklet.
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
                aria-label={`Include ${item.caption}`}
                className="mt-1"
              />
              {item.photo_url ? (
                <img
                  src={item.photo_url}
                  alt=""
                  className="h-14 w-14 rounded object-cover border shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded border bg-muted flex items-center justify-center shrink-0">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {new Date(item.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  {item.milestone && (
                    <Badge variant="outline" className="text-[10px] gap-1 bg-amber-50 text-amber-800 border-amber-200">
                      <Star className="h-3 w-3" />Milestone
                    </Badge>
                  )}
                  {item.portfolio && !item.milestone && (
                    <Badge variant="outline" className="text-[10px]">Portfolio</Badge>
                  )}
                  {item.domain && (
                    <span className="text-[11px] text-muted-foreground">· {item.domain}</span>
                  )}
                  {item.extra_photos.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">+{item.extra_photos.length} more photo{item.extra_photos.length === 1 ? "" : "s"}</span>
                  )}
                </div>
                {item.caption && (
                  <p className="mt-1 text-sm text-foreground line-clamp-2 whitespace-pre-wrap">{item.caption}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => onMove(item.key, "up")} disabled={idx === 0} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => onMove(item.key, "down")} disabled={idx === ordered.length - 1} aria-label="Move down">
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