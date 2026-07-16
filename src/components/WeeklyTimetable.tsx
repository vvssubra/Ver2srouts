import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CalendarDays } from "lucide-react";

type Activity = {
  name: string;
  name_ms: string;
  duration_minutes: number;
  learning_area: string;
  standards_addressed: string[];
  description: string;
  materials: string[];
  teacher_notes: string;
  expected_outcomes: string;
};

type DayPlan = {
  day: number;
  theme_focus: string;
  activities: Activity[];
};

interface WeeklyTimetableProps {
  days: DayPlan[];
  onSelectActivity?: (dayIndex: number, actIndex: number) => void;
}

const AREA_COLORS: Record<string, string> = {
  "KK": "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300",
  "FK": "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300",
  "SE": "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300",
  "BM": "bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300",
  "KG": "bg-rose-100 border-rose-300 text-rose-800 dark:bg-rose-900/30 dark:border-rose-700 dark:text-rose-300",
  "KE": "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300",
};

function getAreaColor(area: string) {
  const code = area?.split(" ")[0]?.toUpperCase() || "";
  return AREA_COLORS[code] || "bg-muted border-border text-foreground";
}

export default function WeeklyTimetable({ days, onSelectActivity }: WeeklyTimetableProps) {
  if (!days || days.length === 0) return null;

  const maxActivities = Math.max(...days.map((d) => d.activities.length));
  // Build time slots based on max activities
  const slots = Array.from({ length: maxActivities }, (_, i) => i);

  // Compute cumulative start times per day for display
  const dayTimelines = days.map((day) => {
    let cumulative = 0;
    return day.activities.map((act) => {
      const start = cumulative;
      cumulative += act.duration_minutes;
      return { start, end: cumulative };
    });
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Jadual Mingguan / Weekly Timetable
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        <ScrollArea className="w-full">
          <div className="min-w-[600px] px-4">
            {/* Header row */}
            <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)` }}>
              <div className="text-xs font-medium text-muted-foreground py-2">Slot</div>
              {days.map((day) => (
                <div key={day.day} className="text-xs font-semibold text-center py-2 bg-muted/50 rounded-t-md">
                  <div>Hari {day.day}</div>
                  <div className="text-[10px] font-normal text-muted-foreground truncate px-1">{day.theme_focus}</div>
                </div>
              ))}
            </div>

            {/* Activity rows */}
            {slots.map((slotIdx) => (
              <div
                key={slotIdx}
                className="grid gap-2 border-t border-border/50"
                style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)` }}
              >
                <div className="text-[10px] text-muted-foreground py-2 flex items-start justify-center pt-3">
                  #{slotIdx + 1}
                </div>
                {days.map((day, dayIdx) => {
                  const act = day.activities[slotIdx];
                  const timeline = dayTimelines[dayIdx]?.[slotIdx];
                  if (!act) {
                    return <div key={dayIdx} className="py-2" />;
                  }
                  return (
                    <div
                      key={dayIdx}
                      className={`py-2 px-2 rounded-md border cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${getAreaColor(act.learning_area)}`}
                      onClick={() => onSelectActivity?.(dayIdx, slotIdx)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold truncate flex-1">{act.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 shrink-0 border-current/30">
                          {act.duration_minutes}m
                        </Badge>
                      </div>
                      <p className="text-[9px] opacity-70 truncate">{act.name_ms}</p>
                      {timeline && (
                        <p className="text-[9px] opacity-50 mt-0.5">
                          {formatTime(timeline.start)}–{formatTime(timeline.end)}
                        </p>
                      )}
                      {act.standards_addressed?.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {act.standards_addressed.slice(0, 2).map((code) => (
                            <span key={code} className="text-[8px] bg-background/50 rounded px-1">{code}</span>
                          ))}
                          {act.standards_addressed.length > 2 && (
                            <span className="text-[8px] opacity-50">+{act.standards_addressed.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Summary row */}
            <div
              className="grid gap-2 border-t-2 border-border mt-1 pt-2"
              style={{ gridTemplateColumns: `80px repeat(${days.length}, 1fr)` }}
            >
              <div className="text-[10px] font-medium text-muted-foreground text-center">Total</div>
              {days.map((day, i) => {
                const total = day.activities.reduce((s, a) => s + a.duration_minutes, 0);
                return (
                  <div key={i} className="text-center">
                    <Badge variant="secondary" className="text-[10px]">
                      {total} min ({day.activities.length} aktiviti)
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}
