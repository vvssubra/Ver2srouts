import { useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Eye, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToursCalendarViewProps {
  tours: any[];
  onTourClick: (tour: any) => void;
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8 AM – 6 PM

export default function ToursCalendarView({ tours, onTourClick }: ToursCalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const toursByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));
    tours.forEach((t) => {
      const date = new Date(t.scheduled_date);
      const key = format(date, "yyyy-MM-dd");
      if (map.has(key)) map.get(key)!.push(t);
    });
    return map;
  }, [tours, days]);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Week of {format(weekStart, "MMM d, yyyy")}
            </p>
            <p className="text-xs text-muted-foreground">Click a visit to open the lead</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Today
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Header row */}
            <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1">
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className={cn(
                  "text-center py-1.5 rounded-md text-xs font-medium",
                  isSameDay(d, new Date()) ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}>
                  <div>{format(d, "EEE")}</div>
                  <div className="text-sm font-bold text-foreground">{format(d, "d")}</div>
                </div>
              ))}
            </div>

            {/* Hour rows */}
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 border-t border-border">
                <div className="text-[10px] text-muted-foreground py-2 pr-2 text-right">
                  {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "PM" : "AM"}
                </div>
                {days.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const dayTours = (toursByDay.get(key) || []).filter((t) => {
                    const h = new Date(t.scheduled_date).getHours();
                    return h === hour;
                  });
                  return (
                    <div key={key + hour} className="min-h-[44px] py-1 space-y-1">
                      {dayTours.map((t: any) => {
                        const tourType = t.type || "tour";
                        const Icon = tourType === "trial" ? FlaskConical : Eye;
                        return (
                          <button
                            key={t.id}
                            onClick={() => onTourClick(t)}
                            className={cn(
                              "w-full text-left px-1.5 py-1 rounded text-[10px] font-medium border hover:opacity-80 transition-opacity",
                              tourType === "trial"
                                ? "bg-[hsl(var(--role-franchisee))]/15 text-[hsl(var(--role-franchisee))] border-[hsl(var(--role-franchisee))]/30"
                                : "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
                              t.status === "cancelled" && "line-through opacity-50"
                            )}
                          >
                            <div className="flex items-center gap-1">
                              <Icon className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{t.lead?.child_name || "Lead"}</span>
                            </div>
                            <div className="text-[9px] opacity-75">{format(new Date(t.scheduled_date), "h:mm a")}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border">
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded bg-[hsl(var(--role-teacher))]/30" />
            <span>Tour</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-2.5 rounded bg-[hsl(var(--role-franchisee))]/30" />
            <span>Trial</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}