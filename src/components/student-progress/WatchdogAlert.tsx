import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AreaSummary {
  area: { id: string; code: string; name_ms: string };
  avgScore: number;
  oldestTp1Date: string | null;
  tp1Count: number;
}

interface Props {
  areaSummary: AreaSummary[];
}

export default function WatchdogAlert({ areaSummary }: Props) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const flaggedAreas = areaSummary.filter(
    (a) => a.tp1Count > 0 && a.oldestTp1Date && new Date(a.oldestTp1Date) < thirtyDaysAgo
  );

  if (flaggedAreas.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">AI Progress Watchdog — Targeted Intervention Needed</AlertTitle>
      <AlertDescription className="mt-1 space-y-1">
        {flaggedAreas.map((a) => (
          <p key={a.area.id} className="text-sm">
            <strong>{a.area.code} ({a.area.name_ms})</strong>: {a.tp1Count} standard{a.tp1Count > 1 ? "s" : ""} stuck at
            TP1 for over 30 days. Consider one-on-one activities or differentiated instruction for this area.
          </p>
        ))}
      </AlertDescription>
    </Alert>
  );
}
