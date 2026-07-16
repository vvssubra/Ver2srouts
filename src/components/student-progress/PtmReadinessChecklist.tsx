import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { ReadinessItem } from "@/lib/ptm/preparation";
import { Badge } from "@/components/ui/badge";

export function PtmReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  const total = items.filter((i) => i.required).length;
  const done = items.filter((i) => i.required && i.ok).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Required sections: {done}/{total} complete</div>
        <Badge variant="outline" className={pct === 100 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
          {pct}% ready
        </Badge>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="divide-y rounded-lg border">
        {items.map((it) => (
          <li key={it.key} className="flex items-start gap-3 px-3 py-2">
            {it.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            ) : it.required ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {it.label}{" "}
                {!it.required && <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>}
              </p>
              {!it.ok && it.hint && <p className="text-xs text-muted-foreground">{it.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PtmReadinessChecklist;