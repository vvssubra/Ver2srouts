import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Eye, FlaskConical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TIME_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const min = i % 2 === 0 ? "00" : "30";
  const label = `${hour > 12 ? hour - 12 : hour}:${min} ${hour >= 12 ? "PM" : "AM"}`;
  return { value: `${String(hour).padStart(2, "0")}:${min}`, label };
});

export type VisitType = "tour" | "trial";

interface ScheduleVisitFormProps {
  defaultType?: VisitType;
  defaultDate?: Date;
  isPending?: boolean;
  onSubmit: (params: { type: VisitType; date: Date; time: string; notes: string }) => void;
}

export default function ScheduleVisitForm({
  defaultType = "tour",
  defaultDate,
  isPending,
  onSubmit,
}: ScheduleVisitFormProps) {
  const [type, setType] = useState<VisitType>(defaultType);
  const [date, setDate] = useState<Date | undefined>(defaultDate);
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!date) return;
    onSubmit({ type, date, time, notes: notes.trim() });
    setNotes("");
  };

  return (
    <div className="space-y-3">
      {/* Type toggle */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Visit Type</Label>
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setType("tour")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-colors",
              type === "tour" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" /> Tour
          </button>
          <button
            type="button"
            onClick={() => setType("trial")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-sm font-medium transition-colors",
              type === "trial" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <FlaskConical className="h-3.5 w-3.5" /> Trial
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start h-9 font-normal">
                <CalendarDays className="mr-2 h-3.5 w-3.5" />
                <span className="truncate">{date ? format(date, "PP") : "Pick"}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={setDate} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Time</Label>
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Textarea
        placeholder={`${type === "trial" ? "Trial" : "Tour"} notes (optional)...`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />

      <Button className="w-full" disabled={!date || isPending} onClick={handleSubmit}>
        {isPending ? "Scheduling..." : `Schedule ${type === "trial" ? "Trial" : "Tour"}`}
      </Button>
    </div>
  );
}