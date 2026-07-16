import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

const PE_SUBJECTS = ["Physical Education", "Outdoor Adventure & Nature"];
const NON_TEACHING = ["Assembly", "Break"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MIN_WEEKLY_MINUTES = 1200;
const MIN_PE_DAILY_MINUTES = 30;

// Map sub-subjects to their parent for compliance aggregation
const SUB_SUBJECT_PARENT: Record<string, string> = {
  "English - Spelling": "English",
  "English - Reading": "English",
  "Bahasa Melayu - Ejaan": "Bahasa Melayu",
  "Bahasa Melayu - Bacaan": "Bahasa Melayu",
};

function resolveParentSubject(name: string): string {
  return SUB_SUBJECT_PARENT[name] || name;
}

interface Slot {
  day_of_week: number;
  subject_name: string;
}

interface ComplianceTrackerProps {
  slots: Slot[];
}

export default function ComplianceTracker({ slots }: ComplianceTrackerProps) {
  // Total teaching minutes (exclude Assembly/Break)
  const teachingSlots = slots.filter(s => !NON_TEACHING.includes(s.subject_name));
  const totalMinutes = teachingSlots.length * 30;
  const minutesCompliant = totalMinutes >= MIN_WEEKLY_MINUTES;

  // PE/Outdoor per day
  const peByDay: Record<number, number> = {};
  for (let d = 1; d <= 5; d++) peByDay[d] = 0;
  for (const s of slots) {
    if (PE_SUBJECTS.includes(s.subject_name) && s.day_of_week >= 1 && s.day_of_week <= 5) {
      peByDay[s.day_of_week] = (peByDay[s.day_of_week] || 0) + 30;
    }
  }
  const peIssues = Object.entries(peByDay)
    .filter(([_, mins]) => mins < MIN_PE_DAILY_MINUTES)
    .map(([day]) => DAYS[Number(day) - 1]);

  const allCompliant = minutesCompliant && peIssues.length === 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          KP2026 Compliance Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Total Weekly Minutes */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Weekly Teaching</span>
          <div className="flex items-center gap-1.5">
            <Badge variant={minutesCompliant ? "default" : "destructive"} className="text-xs">
              {totalMinutes} / {MIN_WEEKLY_MINUTES} min
            </Badge>
            {minutesCompliant ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
        </div>

        {!minutesCompliant && (
          <Alert variant="destructive" className="py-2 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs">Insufficient Teaching Minutes</AlertTitle>
            <AlertDescription className="text-xs">
              Minimum 1,200 min/week required. Currently {MIN_WEEKLY_MINUTES - totalMinutes} min short.
            </AlertDescription>
          </Alert>
        )}

        {/* PE/Outdoor Daily Check */}
        <div>
          <span className="text-xs text-muted-foreground block mb-1.5">PE / Outdoor Daily (≥30 min)</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(d => {
              const ok = peByDay[d] >= MIN_PE_DAILY_MINUTES;
              return (
                <div key={d} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{DAYS[d - 1]}</span>
                  <Badge variant={ok ? "default" : "destructive"} className="text-[10px] px-1.5">
                    {peByDay[d]}m
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        {peIssues.length > 0 && (
          <Alert variant="destructive" className="py-2 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            <AlertTitle className="text-xs">PE/Outdoor Below Minimum</AlertTitle>
            <AlertDescription className="text-xs">
              {peIssues.join(", ")} — need ≥30 min of Physical Education or Outdoor Adventure & Nature.
            </AlertDescription>
          </Alert>
        )}

        {allCompliant && (
          <div className="flex items-center gap-2 text-accent text-xs font-medium">
            <CheckCircle2 className="h-4 w-4" />
            All KP2026 requirements met ✓
          </div>
        )}
      </CardContent>
    </Card>
  );
}
