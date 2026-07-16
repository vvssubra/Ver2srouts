import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useExpectedStaff } from "@/lib/attendance/use-expected-staff";

interface StaffAttendanceWidgetProps {
  branchId: string | null;
}

export default function StaffAttendanceWidget({ branchId }: StaffAttendanceWidgetProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data } = useExpectedStaff(branchId, today);
  const s = data?.summary ?? {
    expected: 0, clockedIn: 0, stillWorking: 0, completed: 0, notClockedIn: 0,
  } as any;
  const excusedTotal =
    (data?.summary.onLeave ?? 0) +
    (data?.summary.publicHoliday ?? 0) +
    (data?.summary.offDay ?? 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Clocked In</p>
              <p className="text-2xl font-bold">{s.clockedIn}</p>
              <p className="text-[10px] text-muted-foreground">of {s.expected} expected</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Still Working</p>
              <p className="text-2xl font-bold">{s.stillWorking}</p>
            </div>
            <div className="rounded-lg bg-warning/100/10 p-2">
              <Clock className="h-4 w-4 text-warning0" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{s.completed}</p>
            </div>
            <div className="rounded-lg bg-success/100/10 p-2">
              <CheckCircle2 className="h-4 w-4 text-success0" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-[var(--shadow-card)] border-border/50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Not Clocked In</p>
              <p className="text-2xl font-bold">{s.notClockedIn}</p>
              <p className="text-[10px] text-muted-foreground">{excusedTotal} excused</p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-2">
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
