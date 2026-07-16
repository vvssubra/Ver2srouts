import { Badge } from "@/components/ui/badge";
import type { AssessmentSummary, DomainComparisonRow, ProgressStatus } from "@/lib/ptm/assessment-comparison";
import { statusLabel } from "@/lib/ptm/assessment-comparison";
import { ArrowDown, ArrowUp, Minus, HelpCircle } from "lucide-react";

function StatusPill({ status }: { status: ProgressStatus }) {
  const map: Record<ProgressStatus, { cls: string; icon: React.ReactNode }> = {
    improved:      { cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300", icon: <ArrowUp className="h-3 w-3" /> },
    maintained:    { cls: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300", icon: <Minus className="h-3 w-3" /> },
    needs_support: { cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300", icon: <ArrowDown className="h-3 w-3" /> },
    no_data:       { cls: "bg-muted text-muted-foreground border-transparent", icon: <HelpCircle className="h-3 w-3" /> },
  };
  const { cls, icon } = map[status];
  return (
    <Badge variant="outline" className={`gap-1 ${cls}`}>
      {icon}
      {statusLabel(status)}
    </Badge>
  );
}

export function AssessmentComparisonTable({ summary }: { summary: AssessmentSummary }) {
  const { rows, baseline, current } = summary;
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/40 border-b text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Baseline:</span>{" "}
          {baseline ? new Date(baseline.date_evaluated).toLocaleDateString() : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Current:</span>{" "}
          {current ? new Date(current.date_evaluated).toLocaleDateString() : "—"}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-background">
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-4 py-2 font-medium">Domain</th>
            <th className="text-center px-3 py-2 font-medium">Baseline</th>
            <th className="text-center px-3 py-2 font-medium">Current</th>
            <th className="text-center px-3 py-2 font-medium">Δ</th>
            <th className="text-center px-3 py-2 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: DomainComparisonRow) => (
            <tr key={r.code} className="border-t">
              <td className="px-4 py-2">
                <div className="font-medium text-foreground">{r.code}</div>
                <div className="text-xs text-muted-foreground">{r.name}</div>
              </td>
              <td className="px-3 py-2 text-center tabular-nums">{r.baseline ?? "—"}</td>
              <td className="px-3 py-2 text-center tabular-nums font-medium">{r.current ?? "—"}</td>
              <td className={`px-3 py-2 text-center tabular-nums ${r.delta === null ? "text-muted-foreground" : r.delta > 0 ? "text-emerald-600" : r.delta < 0 ? "text-amber-600" : ""}`}>
                {r.delta === null ? "—" : (r.delta > 0 ? `+${r.delta}` : r.delta)}
              </td>
              <td className="px-3 py-2 text-center">
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AssessmentComparisonTable;