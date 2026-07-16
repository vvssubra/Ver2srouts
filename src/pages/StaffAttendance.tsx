import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, LogIn, LogOut, CalendarIcon, History, Pencil, Plus, Users, CheckCircle2, XCircle, Flag, MapPin, Navigation, FileText, DollarSign, CalendarDays, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import EditAttendanceDialog from "@/components/EditAttendanceDialog";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { eachDayOfInterval, endOfMonth, startOfMonth, getDay } from "date-fns";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import OutsideGeofenceDialog from "@/components/attendance/OutsideGeofenceDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyBranchApprovers } from "@/lib/notify";
import { getBranchAcademicYearIds } from "@/lib/school-holidays-scope";
import { useExpectedStaff } from "@/lib/attendance/use-expected-staff";

// A school_holidays row is a paid staff closure whenever any of the
// following are true. This widens legacy filters that only looked at
// event_type in {"holiday","reward_holiday"}, so Public Holidays created
// via HR Calendar / Yearly Planner / auto-populate are always recognised
// and never counted as Absent.
const STAFF_CLOSURE_EVENT_TYPES = new Set([
  "holiday", "reward_holiday", "public_holiday", "term_holiday",
  "term_break", "semester_break", "mid_term_holiday",
  "school_closure", "closure",
]);
function isStaffPaidClosure(h: any): boolean {
  if (!h) return false;
  if (h.is_public_holiday === true) return true;
  if (h.affects_attendance === true) return true;
  const et = h.event_type || "";
  return STAFF_CLOSURE_EVENT_TYPES.has(et);
}

// Helper: look up shift from work_schedule supporting both numeric ("0"-"6") and named ("sunday"-"saturday") keys
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function getShiftForDay(ws: Record<string, any> | null | undefined, dow: number): any {
  if (!ws) return undefined;
  // Try numeric key first (most common in DB), then named key
  const byNum = ws[String(dow)];
  if (byNum !== undefined) return byNum;
  return ws[DAY_NAMES[dow]];
}

// Helper: compute late threshold time from shift start + grace minutes
function getLateThreshold(ws: any, dow: number, graceMinutes: number): string {
  const shift = getShiftForDay(ws, dow);
  const shiftStart = (shift && typeof shift === "object" && shift.start) ? shift.start : "08:00";
  const [sh, sm] = shiftStart.split(":").map(Number);
  const thresholdDate = new Date(2000, 0, 1, sh, sm + graceMinutes);
  return format(thresholdDate, "HH:mm");
}

// ─── Monthly Summary Component ──────────────────────────
function MonthlyAttendanceSummary({ branchId, branchStaffList }: { branchId: string; branchStaffList: any[] }) {
  const [summaryMonth, setSummaryMonth] = useState(new Date());
  const mStart = format(startOfMonth(summaryMonth), "yyyy-MM-dd");
  const mEnd = format(endOfMonth(summaryMonth), "yyyy-MM-dd");
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(summaryMonth), end: endOfMonth(summaryMonth) });

  const { data: monthAttendance = [] } = useQuery({
    queryKey: ["monthly-att-summary", branchId, mStart],
    queryFn: async () => {
      const { data } = await supabase.from("staff_attendance").select("user_id, date, clock_in, clock_out, is_outside_geofence").eq("branch_id", branchId).gte("date", mStart).lte("date", mEnd);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: monthLeaves = [] } = useQuery({
    queryKey: ["monthly-leaves-summary", branchId, mStart],
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests").select("user_id, start_date, end_date, leave_type, status").eq("status", "approved").lte("start_date", mEnd).gte("end_date", mStart);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: monthHolidaysMeta = [] } = useQuery({
    queryKey: ["monthly-holidays-summary", branchId, mStart],
    queryFn: async () => {
      const results: { date: string; type: string; isPaid: boolean }[] = [];
      // Branch events
      const { data: be } = await supabase.from("branch_events").select("event_date, end_date, affects_attendance, event_type, is_paid").eq("branch_id", branchId).eq("affects_attendance", true).lte("event_date", mEnd).gte("event_date", mStart);
      (be ?? []).forEach((e: any) => {
        const dates = e.end_date
          ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd"))
          : [e.event_date];
        dates.forEach(ds => results.push({ date: ds, type: e.event_type || "public_holiday", isPaid: e.is_paid !== false }));
      });
      // School holidays — only holiday/reward_holiday count as staff holidays
      const yearIds = await getBranchAcademicYearIds(branchId);
      const { data: sh } = await supabase.from("school_holidays").select("event_date, end_date, event_type, affects_attendance, is_public_holiday").in("academic_year_id", yearIds).lte("event_date", mEnd).gte("event_date", mStart);
      (sh ?? []).filter(isStaffPaidClosure).forEach((h: any) => {
        const dates = h.end_date
          ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd"))
          : [h.event_date];
        dates.forEach(ds => {
          if (!results.some(r => r.date === ds)) results.push({ date: ds, type: h.event_type || "public_holiday", isPaid: true });
        });
      });
      return results;
    },
    enabled: !!branchId,
  });

  const holidayMap = useMemo(() => {
    const map = new Map<string, { type: string; isPaid: boolean }>();
    monthHolidaysMeta.forEach(h => map.set(h.date, { type: h.type, isPaid: h.isPaid }));
    return map;
  }, [monthHolidaysMeta]);

  const attMap = useMemo(() => {
    const map = new Map<string, Map<string, any>>();
    monthAttendance.forEach((a: any) => {
      if (!map.has(a.user_id)) map.set(a.user_id, new Map());
      map.get(a.user_id)!.set(a.date, a);
    });
    return map;
  }, [monthAttendance]);

  const leaveMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    monthLeaves.forEach((l: any) => {
      if (!map.has(l.user_id)) map.set(l.user_id, new Map());
      const s = parseISO(l.start_date);
      const e = parseISO(l.end_date);
      eachDayOfInterval({ start: s, end: e }).forEach(d => {
        const ds = format(d, "yyyy-MM-dd");
        if (ds >= mStart && ds <= mEnd) map.get(l.user_id)!.set(ds, l.leave_type);
      });
    });
    return map;
  }, [monthLeaves, mStart, mEnd]);

  // Load staff work schedules for Saturday half-day logic
  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["monthly-staff-profiles", branchId],
    queryFn: async () => {
      const ids = branchStaffList.map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("staff_profiles").select("user_id, work_schedule").in("user_id", ids);
      return data ?? [];
    },
    enabled: branchStaffList.length > 0,
  });

  const staffScheduleMap = useMemo(() => {
    const map = new Map<string, any>();
    staffProfiles.forEach((p: any) => map.set(p.user_id, p.work_schedule));
    return map;
  }, [staffProfiles]);

  const getCellStatus = (userId: string, dateStr: string, dayOfWeek: number) => {
    const hol = holidayMap.get(dateStr);
    if (hol) return hol.type === "reward_holiday" ? "reward_holiday" : "holiday";
    // Check work schedule for off days
    const ws = staffScheduleMap.get(userId);
    if (ws) {
      const shift = getShiftForDay(ws, dayOfWeek);
      if (shift === null || shift === false) return "off";
      if (shift === undefined) {
        if (dayOfWeek === 0 || dayOfWeek === 6) return "off";
      }
    } else {
      if (dayOfWeek === 0 || dayOfWeek === 6) return "off";
    }
    const att = attMap.get(userId)?.get(dateStr);
    if (att) {
      if (att.clock_in) {
        const clockInTime = format(new Date(att.clock_in), "HH:mm");
        const lateThreshold = getLateThreshold(ws, dayOfWeek, 5);
        if (clockInTime > lateThreshold) return "late";
      }
      return "present";
    }
    if (leaveMap.get(userId)?.has(dateStr)) return leaveMap.get(userId)!.get(dateStr)!;
    if (parseISO(dateStr) > new Date()) return "future";
    return "absent";
  };

  // Get day fraction for a staff member (Saturday half-day = 0.5)
  const getDayFraction = (userId: string, dayOfWeek: number): number => {
    const ws = staffScheduleMap.get(userId);
    if (dayOfWeek === 6 && ws) {
      const shift = getShiftForDay(ws, 6);
      if (shift && typeof shift === "object" && shift.end && shift.end <= "13:00") return 0.5;
      if (shift === null || shift === false || shift === undefined) return 0; // off day
    }
    return 1;
  };

  const getCellColor = (status: string) => {
    switch (status) {
      case "present": return "bg-success/100/20 text-success";
      case "late": return "bg-warning/100/20 text-warning";
      case "holiday": return "bg-warning/100/20 text-warning";
      case "reward_holiday": return "bg-info/100/20 text-info";
      case "off": return "bg-muted text-muted-foreground";
      case "absent": return "bg-destructive/15 text-destructive";
      case "annual": return "bg-info/100/20 text-info";
      case "medical": return "bg-muted/100/20 text-muted";
      case "future": return "bg-background text-muted-foreground/30";
      default: return "bg-warning/100/20 text-warning";
    }
  };

  const getCellLabel = (status: string) => {
    switch (status) {
      case "present": return "P";
      case "late": return "LT";
      case "holiday": return "H";
      case "reward_holiday": return "RH";
      case "off": return "—";
      case "absent": return "A";
      case "annual": return "AL";
      case "medical": return "MC";
      case "unpaid": return "UL";
      case "future": return "";
      default: return "L";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Monthly Attendance Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSummaryMonth(new Date(summaryMonth.getFullYear(), summaryMonth.getMonth() - 1))}>←</Button>
            <span className="text-sm font-medium min-w-[130px] text-center">{format(summaryMonth, "MMMM yyyy")}</span>
            <Button variant="outline" size="sm" onClick={() => setSummaryMonth(new Date(summaryMonth.getFullYear(), summaryMonth.getMonth() + 1))}>→</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {[{ label: "Present", color: "bg-success/100/20" }, { label: "Late", color: "bg-warning/100/20" }, { label: "Absent", color: "bg-destructive/15" }, { label: "Holiday", color: "bg-warning/100/20" }, { label: "Reward Holiday", color: "bg-info/100/20" }, { label: "Leave", color: "bg-info/100/20" }, { label: "Off Day", color: "bg-muted" }, { label: "Out of Zone", color: "bg-destructive/100" }].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${color}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <ScrollArea className="w-full">
          <div className="min-w-[800px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">Staff</TableHead>
                  {daysInMonth.map(d => (
                    <TableHead key={format(d, "dd")} className="text-center px-1 min-w-[28px] text-[10px]">
                      <div>{format(d, "dd")}</div>
                      <div className="text-muted-foreground">{format(d, "EEE").charAt(0)}</div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center px-2 min-w-[40px] text-[10px]">P</TableHead>
                  <TableHead className="text-center px-2 min-w-[40px] text-[10px]">LT</TableHead>
                  <TableHead className="text-center px-2 min-w-[40px] text-[10px]">H</TableHead>
                  <TableHead className="text-center px-2 min-w-[40px] text-[10px]">A</TableHead>
                  <TableHead className="text-center px-2 min-w-[40px] text-[10px]">L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchStaffList.map((staff: any) => {
                  let presentCount = 0, lateCount = 0, holidayCount = 0, absentCount = 0, leaveCount = 0;
                  return (
                    <TableRow key={staff.id}>
                      <TableCell className="sticky left-0 bg-background z-10 text-xs font-medium whitespace-nowrap">
                        {staff.first_name} {staff.last_name}
                      </TableCell>
                      {daysInMonth.map(d => {
                        const ds = format(d, "yyyy-MM-dd");
                        const dow = getDay(d);
                        const status = getCellStatus(staff.id, ds, dow);
                        const fraction = getDayFraction(staff.id, dow);
                        if (status === "present") presentCount += fraction;
                        else if (status === "late") { presentCount += fraction; lateCount++; }
                        else if (status === "holiday" || status === "reward_holiday") holidayCount += fraction;
                        else if (status === "absent") absentCount += fraction;
                        else if (!["off", "future"].includes(status)) leaveCount++;
                        const isOutsideGeo = attMap.get(staff.id)?.get(ds)?.is_outside_geofence === true;
                        return (
                          <TableCell key={ds} className="p-0 text-center relative">
                            <div className={`w-6 h-6 mx-auto rounded text-[9px] font-medium flex items-center justify-center ${getCellColor(status)}`}>
                              {getCellLabel(status)}
                            </div>
                            {isOutsideGeo && <div className="absolute top-0 right-0.5 w-2 h-2 rounded-full bg-destructive/100 border border-background" title="Outside geofence" />}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-xs font-semibold text-success">{presentCount % 1 === 0 ? presentCount : presentCount.toFixed(1)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-warning">{lateCount}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-warning">{holidayCount % 1 === 0 ? holidayCount : holidayCount.toFixed(1)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-destructive">{absentCount % 1 === 0 ? absentCount : absentCount.toFixed(1)}</TableCell>
                      <TableCell className="text-center text-xs font-semibold text-info">{leaveCount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Hours Audit Component ──────────────────────────
function HoursAuditTab({ branchId, branchStaffList }: { branchId: string; branchStaffList: any[] }) {
  const [auditMonth, setAuditMonth] = useState(new Date());
  const aStart = format(startOfMonth(auditMonth), "yyyy-MM-dd");
  const aEnd = format(endOfMonth(auditMonth), "yyyy-MM-dd");

  const { data: auditAttendance = [] } = useQuery({
    queryKey: ["audit-attendance", branchId, aStart],
    queryFn: async () => {
      const { data } = await supabase.from("staff_attendance").select("user_id, date, clock_in, clock_out").eq("branch_id", branchId).gte("date", aStart).lte("date", aEnd);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: auditHolidays = [] } = useQuery({
    queryKey: ["audit-holidays", branchId, aStart],
    queryFn: async () => {
      const results: string[] = [];
      const yearIds = await getBranchAcademicYearIds(branchId);
      const { data: sh } = await supabase.from("school_holidays").select("event_date, end_date, event_type, is_public_holiday, affects_attendance").in("academic_year_id", yearIds).lte("event_date", aEnd).gte("event_date", aStart);
      (sh ?? []).filter(isStaffPaidClosure).forEach((h: any) => {
        if (h.end_date) eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).forEach(d => results.push(format(d, "yyyy-MM-dd")));
        else results.push(h.event_date);
      });
      const { data: be } = await supabase.from("branch_events").select("event_date, end_date, affects_attendance").eq("branch_id", branchId).eq("affects_attendance", true).lte("event_date", aEnd).gte("event_date", aStart);
      (be ?? []).forEach((e: any) => {
        if (e.end_date) eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).forEach(d => { const ds = format(d, "yyyy-MM-dd"); if (!results.includes(ds)) results.push(ds); });
        else if (!results.includes(e.event_date)) results.push(e.event_date);
      });
      return results;
    },
    enabled: !!branchId,
  });

  const { data: auditProfiles = [] } = useQuery({
    queryKey: ["audit-profiles", branchId],
    queryFn: async () => {
      const ids = branchStaffList.map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("staff_profiles").select("user_id, work_schedule").in("user_id", ids);
      return data ?? [];
    },
    enabled: branchStaffList.length > 0,
  });

  const auditData = useMemo(() => {
    const allDays = eachDayOfInterval({ start: startOfMonth(auditMonth), end: endOfMonth(auditMonth) });
    const holidaySet = new Set(auditHolidays);
    const scheduleMap = new Map<string, any>();
    auditProfiles.forEach((p: any) => scheduleMap.set(p.user_id, p.work_schedule));
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    return branchStaffList.map((staff: any) => {
      const ws = scheduleMap.get(staff.id);
      const records = auditAttendance.filter((a: any) => a.user_id === staff.id);
      const attMap = new Map<string, any>();
      records.forEach((r: any) => attMap.set(r.date, r));

      let daysPresent = 0, daysLate = 0, daysHoliday = 0, daysAbsent = 0, totalMinutes = 0, expectedMinutes = 0;

      allDays.forEach(d => {
        if (d > new Date()) return;
        const ds = format(d, "yyyy-MM-dd");
        const dow = getDay(d);
        let fraction = 1;
        let dailyExpectedHrs = 8;

        if (ws) {
          const shift = getShiftForDay(ws, dow);
          // Explicitly off: null or false
          if (shift === null || shift === false) return;
          // Undefined = use default: weekends off
          if (shift === undefined) {
            if (dow === 0 || dow === 6) return;
          }
          if (dow === 6 && typeof shift === "object" && shift.end && shift.end <= "13:00") {
            fraction = 0.5;
            dailyExpectedHrs = 4;
          }
        } else {
          if (dow === 0 || dow === 6) return;
        }

        if (holidaySet.has(ds)) { daysHoliday += fraction; return; }

        const att = attMap.get(ds);
        expectedMinutes += dailyExpectedHrs * 60;
        if (att) {
          daysPresent += fraction;
          if (att.clock_in) {
            const t = format(new Date(att.clock_in), "HH:mm");
            const shift2 = getShiftForDay(ws, dow);
            const lateThreshold2 = getLateThreshold(ws, dow, 5);
            if (t > lateThreshold2) daysLate++;
          }
          if (att.clock_in && att.clock_out) {
            totalMinutes += (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 60000;
          }
        } else {
          daysAbsent += fraction;
        }
      });

      return {
        id: staff.id,
        name: `${staff.first_name || ""} ${staff.last_name || ""}`.trim(),
        daysPresent, daysLate, daysHoliday, daysAbsent,
        totalPaid: daysPresent + daysHoliday,
        hoursWorked: Math.round((totalMinutes / 60) * 100) / 100,
        expectedHours: Math.round((expectedMinutes / 60) * 100) / 100,
        variance: Math.round(((totalMinutes / 60) - (expectedMinutes / 60)) * 100) / 100,
      };
    });
  }, [branchStaffList, auditAttendance, auditHolidays, auditProfiles, auditMonth]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Attendance & Hours Audit
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAuditMonth(new Date(auditMonth.getFullYear(), auditMonth.getMonth() - 1))}>←</Button>
            <span className="text-sm font-medium min-w-[130px] text-center">{format(auditMonth, "MMMM yyyy")}</span>
            <Button variant="outline" size="sm" onClick={() => setAuditMonth(new Date(auditMonth.getFullYear(), auditMonth.getMonth() + 1))}>→</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead className="text-center">Present</TableHead>
              <TableHead className="text-center">Late</TableHead>
              <TableHead className="text-center">Holiday</TableHead>
              <TableHead className="text-center">Absent</TableHead>
              <TableHead className="text-center">Total Paid</TableHead>
              <TableHead className="text-center">Hours Worked</TableHead>
              <TableHead className="text-center">Expected</TableHead>
              <TableHead className="text-center">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditData.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-sm">{row.name}</TableCell>
                <TableCell className="text-center text-sm text-success font-semibold">{row.daysPresent % 1 === 0 ? row.daysPresent : row.daysPresent.toFixed(1)}</TableCell>
                <TableCell className="text-center text-sm text-warning font-semibold">{row.daysLate}</TableCell>
                <TableCell className="text-center text-sm text-warning font-semibold">{row.daysHoliday % 1 === 0 ? row.daysHoliday : row.daysHoliday.toFixed(1)}</TableCell>
                <TableCell className="text-center text-sm text-destructive font-semibold">{row.daysAbsent % 1 === 0 ? row.daysAbsent : row.daysAbsent.toFixed(1)}</TableCell>
                <TableCell className="text-center text-sm font-bold">{row.totalPaid % 1 === 0 ? row.totalPaid : row.totalPaid.toFixed(1)}</TableCell>
                <TableCell className="text-center text-sm font-semibold">{row.hoursWorked}h</TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">{row.expectedHours}h</TableCell>
                <TableCell className={cn("text-center text-sm font-semibold", row.variance >= 0 ? "text-success" : "text-destructive")}>
                  {row.variance >= 0 ? "+" : ""}{row.variance}h
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Individual Month View Component ──────────────────────────
function IndividualMonthView({ staffId, staffName, month, branchId, canEdit, onEditRecord }: { staffId: string; staffName: string; month: Date; branchId: string; canEdit?: boolean; onEditRecord?: (record: any, mode: "edit" | "add") => void }) {
  const mStart = format(startOfMonth(month), "yyyy-MM-dd");
  const mEnd = format(endOfMonth(month), "yyyy-MM-dd");
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });

  const { data: attendance = [] } = useQuery({
    queryKey: ["individual-att", staffId, branchId, mStart],
    queryFn: async () => {
      const { data } = await supabase.from("staff_attendance").select("id, user_id, branch_id, date, clock_in, clock_out, notes, created_at, updated_at, is_outside_geofence, selfie_url, geofence_note").eq("user_id", staffId).eq("branch_id", branchId).gte("date", mStart).lte("date", mEnd).order("date");
      return data ?? [];
    },
    enabled: !!staffId && !!branchId,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["individual-holidays", branchId, mStart],
    queryFn: async () => {
      const results: { date: string; type: string; name: string; isPaid: boolean }[] = [];
      const { data: be } = await supabase.from("branch_events").select("event_date, end_date, event_name, event_type, is_paid, affects_attendance").eq("branch_id", branchId).eq("affects_attendance", true).lte("event_date", mEnd).gte("event_date", mStart);
      (be ?? []).forEach((e: any) => {
        const dates = e.end_date ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [e.event_date];
        dates.forEach(ds => results.push({ date: ds, type: e.event_type || "public_holiday", name: e.event_name, isPaid: e.is_paid !== false }));
      });
      const yearIds = await getBranchAcademicYearIds(branchId);
      const { data: sh } = await supabase.from("school_holidays").select("event_date, end_date, event_name, event_type, is_public_holiday, affects_attendance").in("academic_year_id", yearIds).lte("event_date", mEnd).gte("event_date", mStart);
      (sh ?? []).filter(isStaffPaidClosure).forEach((h: any) => {
        const dates = h.end_date ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [h.event_date];
        dates.forEach(ds => { if (!results.some(r => r.date === ds)) results.push({ date: ds, type: h.event_type || "public_holiday", name: h.event_name, isPaid: true }); });
      });
      return results;
    },
    enabled: !!branchId,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["individual-leaves", staffId, mStart],
    queryFn: async () => {
      const { data } = await supabase.from("leave_requests").select("start_date, end_date, leave_type, status").eq("user_id", staffId).eq("status", "approved").lte("start_date", mEnd).gte("end_date", mStart);
      return data ?? [];
    },
    enabled: !!staffId,
  });

  const { data: staffProfile } = useQuery({
    queryKey: ["individual-profile", staffId],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("work_schedule").eq("user_id", staffId).maybeSingle();
      return data;
    },
    enabled: !!staffId,
  });

  const ws = staffProfile?.work_schedule as Record<string, any> | null;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const holidayMap = useMemo(() => {
    const map = new Map<string, { type: string; name: string; isPaid: boolean }>();
    holidays.forEach(h => map.set(h.date, h));
    return map;
  }, [holidays]);

  const attMap = useMemo(() => {
    const map = new Map<string, any>();
    attendance.forEach((a: any) => map.set(a.date, a));
    return map;
  }, [attendance]);

  const leaveSet = useMemo(() => {
    const map = new Map<string, string>();
    leaves.forEach((l: any) => {
      eachDayOfInterval({ start: parseISO(l.start_date), end: parseISO(l.end_date) }).forEach(d => {
        const ds = format(d, "yyyy-MM-dd");
        if (ds >= mStart && ds <= mEnd) map.set(ds, l.leave_type);
      });
    });
    return map;
  }, [leaves, mStart, mEnd]);

  // Match MonthlyAttendanceSummary's getDayFraction logic exactly
  const getDayFraction = (dow: number): number => {
    if (dow === 6 && ws) {
      const shift = getShiftForDay(ws, 6);
      if (shift && typeof shift === "object" && shift.end && shift.end <= "13:00") return 0.5;
      if (shift === null || shift === false || shift === undefined) return 0; // off day
    }
    if (dow === 6 && !ws) return 0; // no schedule = weekends off
    if (dow === 0) return 0; // Sunday always off
    return 1;
  };

  const isOffDay = (dow: number): boolean => {
    if (ws) {
      const shift = getShiftForDay(ws, dow);
      if (shift === null || shift === false) return true;
      if (shift === undefined && (dow === 0 || dow === 6)) return true;
    } else {
      if (dow === 0 || dow === 6) return true;
    }
    return false;
  };

  type RowData = { date: Date; dateStr: string; clockIn: string | null; clockOut: string | null; hours: string; status: string; statusLabel: string; fraction: number; isShaded: boolean; record: any | null };

  const rows: RowData[] = useMemo(() => {
    return daysInMonth.map(d => {
      const ds = format(d, "yyyy-MM-dd");
      const dow = getDay(d);
      const isFuture = d > new Date();
      const hol = holidayMap.get(ds);
      const att = attMap.get(ds);
      const leave = leaveSet.get(ds);
      const off = isOffDay(dow);
      const fraction = getDayFraction(dow);

      let status = "future";
      let clockIn: string | null = null;
      let clockOut: string | null = null;
      let hours = "—";

      if (isFuture) {
        status = "future";
      } else if (hol) {
        status = hol.type === "reward_holiday" ? "reward_holiday" : "holiday";
      } else if (off) {
        status = "off";
      } else if (leave) {
        status = leave;
      } else if (att) {
        clockIn = att.clock_in;
        clockOut = att.clock_out;
        if (clockIn && clockOut) {
          const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          hours = `${h}h ${m}m`;
        }
        if (clockIn) {
          const t = format(new Date(clockIn), "HH:mm");
          const lateThreshold3 = getLateThreshold(ws, getDay(d), 5);
          status = t > lateThreshold3 ? "late" : "present";
        } else {
          status = "present";
        }
      } else {
        status = "absent";
      }

      const statusLabels: Record<string, string> = { present: "P", late: "LT", holiday: "H", reward_holiday: "RH", off: "Off", absent: "A", annual: "AL", medical: "MC", unpaid: "UL", future: "—" };

      return {
        date: d,
        dateStr: ds,
        clockIn,
        clockOut,
        hours,
        status,
        statusLabel: statusLabels[status] || "L",
        fraction,
        isShaded: off || status === "holiday" || status === "reward_holiday",
        record: att || null,
      };
    });
  }, [daysInMonth, holidayMap, attMap, leaveSet, ws]);

  // Totals — use fraction for all countable statuses (matching Monthly Summary)
  const totals = useMemo(() => {
    let present = 0, late = 0, holiday = 0, rewardHoliday = 0, absent = 0, leave = 0, totalMinutes = 0, outsideGeo = 0;
    rows.forEach(r => {
      if (r.status === "future" || r.status === "off") return;
      const fr = Math.max(r.fraction, 0);
      if (r.status === "present") present += fr || 1;
      else if (r.status === "late") { present += fr || 1; late++; }
      else if (r.status === "holiday") holiday += fr || 1;
      else if (r.status === "reward_holiday") rewardHoliday += fr || 1;
      else if (r.status === "absent") absent += fr || 1;
      else leave++;
      if (r.clockIn && r.clockOut) {
        totalMinutes += (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 60000;
      }
      if (r.record?.is_outside_geofence) outsideGeo++;
    });
    return { present, late, holiday, rewardHoliday, absent, leave, totalHours: Math.round((totalMinutes / 60) * 100) / 100, outsideGeo };
  }, [rows]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present": return "bg-success/100/20 text-success";
      case "late": return "bg-warning/100/20 text-warning";
      case "holiday": return "bg-warning/100/20 text-warning";
      case "reward_holiday": return "bg-info/100/20 text-info";
      case "off": return "bg-muted text-muted-foreground";
      case "absent": return "bg-destructive/15 text-destructive";
      case "annual": return "bg-info/100/20 text-info";
      case "medical": return "bg-muted/100/20 text-muted";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const fmtTime = (ts: string | null) => ts ? format(new Date(ts), "hh:mm a") : "—";
  const fmtNum = (n: number) => n % 1 === 0 ? n.toString() : n.toFixed(1);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-success">{fmtNum(totals.present)}</p>
          <p className="text-[10px] text-muted-foreground">Present</p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-warning">{totals.late}</p>
          <p className="text-[10px] text-muted-foreground">Late</p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-warning">{fmtNum(totals.holiday)}</p>
          <p className="text-[10px] text-muted-foreground">Holiday</p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-info">{fmtNum(totals.rewardHoliday)}</p>
          <p className="text-[10px] text-muted-foreground">Reward Hol.</p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-destructive">{fmtNum(totals.absent)}</p>
          <p className="text-[10px] text-muted-foreground">Absent</p>
        </div>
        <div className="rounded-lg border p-2 text-center">
          <p className="text-lg font-bold text-info">{totals.leave}</p>
          <p className="text-[10px] text-muted-foreground">Leave</p>
        </div>
        {totals.outsideGeo > 0 && (
          <div className="rounded-lg border p-2 text-center border-destructive/30">
            <p className="text-lg font-bold text-destructive">{totals.outsideGeo}</p>
            <p className="text-[10px] text-muted-foreground">Out of Zone</p>
          </div>
        )}
      </div>

      {/* Total hours */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Total Hours Worked:</span>
        <span className="font-bold">{totals.totalHours}h</span>
        <span className="text-muted-foreground ml-4">Total Paid Days:</span>
        <span className="font-bold">{fmtNum(totals.present + totals.holiday + totals.rewardHoliday)}</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Date</TableHead>
            <TableHead>Clock In</TableHead>
            <TableHead>Clock Out</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Day</TableHead>
            <TableHead className="w-[80px]">Status</TableHead>
            <TableHead className="w-[40px]">Zone</TableHead>
            {canEdit && <TableHead className="w-16"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.dateStr} className={r.isShaded ? "bg-muted/30" : ""}>
              <TableCell className="font-medium text-sm">{format(r.date, "EEE, dd MMM")}</TableCell>
              <TableCell className="text-sm">{fmtTime(r.clockIn)}</TableCell>
              <TableCell className="text-sm">{fmtTime(r.clockOut)}</TableCell>
              <TableCell className="text-sm">{r.hours}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.status === "off" || r.status === "future" ? "—" : r.fraction === 0.5 ? "0.5" : r.fraction === 0 ? "—" : "1"}
              </TableCell>
              <TableCell>
                <Badge className={cn("text-[10px] px-1.5 py-0.5", getStatusColor(r.status))}>
                  {r.statusLabel}
                </Badge>
              </TableCell>
              <TableCell>
                {r.record?.is_outside_geofence && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-4 w-4 text-destructive0" />
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs max-w-[200px]">{r.record.geofence_note || "Clocked in outside geofence"}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </TableCell>
              {canEdit && (
                <TableCell>
                  {(r.status !== "future" && r.status !== "off" && r.status !== "holiday" && r.status !== "reward_holiday") && (
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (r.record && onEditRecord) {
                        onEditRecord(r.record, "edit");
                      } else if (onEditRecord) {
                        // Add new record for this date
                        onEditRecord({ user_id: staffId, branch_id: branchId, date: r.dateStr }, "add");
                      }
                    }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
export default function StaffAttendance() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const [historyMonth, setHistoryMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [individualMonth, setIndividualMonth] = useState(new Date());
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [outsideGeoData, setOutsideGeoData] = useState<{ dist: number; name: string; lat: number; lng: number; action: "in" | "out" } | null>(null);

  // Edit permission: super_admin OR access group includes /staff-attendance
  const canEdit = role === "super_admin" || (allowedRoutes.length > 0 && allowedRoutes.some(r => r.includes("/staff-attendance")));

  const { data: branches = [] } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data, error } = await supabase.from("branches").select("id, name").order("name");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data.map((m: any) => m.branches).filter(Boolean);
    },
    enabled: !!user,
  });

  const branchId = selectedBranch;

  // Compute manager flags early so queries can use them
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/staff-attendance");
  const isManager = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;

  // Today's record for current user
  const { data: todayRecord } = useQuery({
    queryKey: ["staff-attendance-today", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("*")
        .eq("user_id", user!.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Branch attendance for selected date (manager view)
  const { data: branchAttendance = [] } = useQuery({
    queryKey: ["branch-staff-attendance", branchId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("id, user_id, branch_id, date, clock_in, clock_out, notes, created_at, updated_at, is_outside_geofence, selfie_url, geofence_note")
        .eq("branch_id", branchId)
        .eq("date", dateStr)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!branchId && isManager,
    refetchInterval: 30000,
  });

  // Realtime
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`staff-attendance-rt-${branchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_attendance", filter: `branch_id=eq.${branchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-attendance-today"] });
          queryClient.invalidateQueries({ queryKey: ["branch-staff-attendance"] });
          queryClient.invalidateQueries({ queryKey: ["dash-staff-attendance"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, queryClient]);

  // My history
  const historyStart = format(new Date(historyMonth.getFullYear(), historyMonth.getMonth(), 1), "yyyy-MM-dd");
  const historyEnd = format(new Date(historyMonth.getFullYear(), historyMonth.getMonth() + 1, 0), "yyyy-MM-dd");

  const { data: history = [] } = useQuery({
    queryKey: ["staff-attendance-history", user?.id, historyStart, historyEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", historyStart)
        .lte("date", historyEnd)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Geofence locations & attendance settings
  const { data: geofenceLocations = [] } = useQuery({
    queryKey: ["geofence-locs", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("geofence_locations").select("*").eq("branch_id", branchId).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Employee-specific geofence assignments (joined with locations for coordinates)
  const { data: employeeGeofences = [] } = useQuery({
    queryKey: ["employee-geofences", user?.id, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_geofence_assignments")
        .select("id, geofence_location_id, geofence_locations(id, name, latitude, longitude, radius_meters)")
        .eq("user_id", user!.id)
        .eq("branch_id", branchId!);
      // Flatten: extract geofence_locations fields to top level for compatibility
      return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.geofence_locations?.name,
        latitude: row.geofence_locations?.latitude,
        longitude: row.geofence_locations?.longitude,
        radius_meters: row.geofence_locations?.radius_meters,
      })).filter((r: any) => r.latitude != null);
    },
    enabled: !!user && !!branchId,
  });

  const { data: attendanceSettings } = useQuery({
    queryKey: ["attendance-settings", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("hr_policies").select("policy_data").eq("branch_id", branchId).eq("policy_type", "attendance_settings").maybeSingle();
      return data?.policy_data as any ?? { late_threshold_minutes: 5, enforce_geofence: false };
    },
    enabled: !!branchId,
  });

  const enforceGeofence = attendanceSettings?.enforce_geofence ?? false;

  // Haversine distance calculation
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Determine which geofence locations to check: employee overrides take priority
  const activeGeofenceLocs = employeeGeofences.length > 0 ? employeeGeofences : geofenceLocations;

  const checkGeofence = (action: "in" | "out"): Promise<{ lat: number; lng: number; outside: boolean } | null> => {
    return new Promise((resolve) => {
      if (!enforceGeofence || activeGeofenceLocs.length === 0) { resolve(null); return; }
      if (!navigator.geolocation) { toast({ title: "Geolocation not supported", description: "Please use a modern browser with GPS enabled.", variant: "destructive" }); resolve(null); return; }
      setGeoStatus("Checking location...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const withinAny = activeGeofenceLocs.some((loc: any) => haversineDistance(latitude, longitude, loc.latitude, loc.longitude) <= loc.radius_meters);
          if (withinAny) { setGeoStatus(null); resolve({ lat: latitude, lng: longitude, outside: false }); }
          else {
            const nearest = activeGeofenceLocs.reduce((best: any, loc: any) => {
              const d = haversineDistance(latitude, longitude, loc.latitude, loc.longitude);
              return d < best.dist ? { dist: d, name: loc.name } : best;
            }, { dist: Infinity, name: "" });
            setGeoStatus(null);
            // Show outside-geofence dialog instead of blocking
            setOutsideGeoData({ dist: nearest.dist, name: nearest.name, lat: latitude, lng: longitude, action });
            resolve(null); // Don't proceed yet — dialog will handle it
          }
        },
        (err) => { setGeoStatus(null); toast({ title: "Location access denied", description: "Please enable location services to clock in.", variant: "destructive" }); resolve(null); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Check if current user is excluded from payroll
  const { data: currentUserExcluded } = useQuery({
    queryKey: ["current-user-excluded", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("exclude_from_payroll").eq("user_id", user!.id).maybeSingle();
      return data?.exclude_from_payroll === true;
    },
    enabled: !!user,
  });
  const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)}m`;
  };


  // Handle outside-geofence clock-in with selfie
  const handleOutsideGeofenceConfirm = async (selfieUrl: string | null, note: string) => {
    if (!outsideGeoData || !branchId) return;
    try {
      if (outsideGeoData.action === "in") {
        const insertData: any = {
          user_id: user!.id, branch_id: branchId, date: today,
          clock_in: new Date().toISOString(),
          clock_in_latitude: outsideGeoData.lat, clock_in_longitude: outsideGeoData.lng,
          is_outside_geofence: true, selfie_url: selfieUrl, geofence_note: note,
        };
        const { error } = await supabase.from("staff_attendance").insert(insertData);
        if (error) throw error;
        toast({ title: "Clocked in successfully", description: "Note: You clocked in from outside the work zone." });
      } else {
        if (!todayRecord) throw new Error("No clock-in record");
        const updateData: any = {
          clock_out: new Date().toISOString(),
          clock_out_latitude: outsideGeoData.lat, clock_out_longitude: outsideGeoData.lng,
          is_outside_geofence: true, selfie_url: selfieUrl, geofence_note: note,
        };
        const { error } = await supabase.from("staff_attendance").update(updateData).eq("id", todayRecord.id);
        if (error) throw error;
        toast({ title: "Clocked out successfully", description: "Note: You clocked out from outside the work zone." });
      }
      // Notify resolved approvers (override -> reports_to -> branch managers)
      const { notifyAndEmailWorkflowApprovers } = await import("@/lib/notify");
      const reqName = (user!.user_metadata as any)?.first_name
        ? `${(user!.user_metadata as any).first_name} ${(user!.user_metadata as any).last_name ?? ""}`.trim()
        : (user!.email ?? "Staff");
      notifyAndEmailWorkflowApprovers({
        submitterUserId: user!.id,
        branchId,
        workflow: "attendance",
        title: "Out-of-Zone Clock " + (outsideGeoData.action === "in" ? "In" : "Out"),
        message: `Staff member clocked ${outsideGeoData.action === "in" ? "in" : "out"} from ${formatDistance(outsideGeoData.dist)} outside ${outsideGeoData.name}.`,
        type: "attendance_alert",
        actionUrl: "/staff-attendance",
        groupKey: `attendance-out-${branchId}`,
        priority: "high",
        requesterName: reqName,
        requestType: "Attendance alert",
        summary: `Clock ${outsideGeoData.action === "in" ? "in" : "out"} • ${formatDistance(outsideGeoData.dist)} outside ${outsideGeoData.name}`,
        details: [
          { label: "Action", value: outsideGeoData.action === "in" ? "Clock in" : "Clock out" },
          { label: "Distance", value: `${formatDistance(outsideGeoData.dist)} outside ${outsideGeoData.name}` },
          ...(note ? [{ label: "Note", value: note }] : []),
        ],
        emailIdempotencyKey: `attendance-out-${branchId}-${Date.now()}`,
      });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["branch-staff-attendance"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setOutsideGeoData(null);
  };

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      const geo = await checkGeofence("in");
      if (enforceGeofence && activeGeofenceLocs.length > 0 && !geo) return;
      const insertData: any = { user_id: user!.id, branch_id: branchId, date: today, clock_in: new Date().toISOString() };
      if (geo) { insertData.clock_in_latitude = geo.lat; insertData.clock_in_longitude = geo.lng; }
      const { error } = await supabase.from("staff_attendance").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["branch-staff-attendance"] });
      toast({ title: "Clocked in successfully" });
    },
    onError: (e) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!todayRecord) throw new Error("No clock-in record");
      const geo = await checkGeofence("out");
      if (enforceGeofence && activeGeofenceLocs.length > 0 && !geo) return;
      const updateData: any = { clock_out: new Date().toISOString() };
      if (geo) { updateData.clock_out_latitude = geo.lat; updateData.clock_out_longitude = geo.lng; }
      const { error } = await supabase.from("staff_attendance").update(updateData).eq("id", todayRecord.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-attendance-today"] });
      queryClient.invalidateQueries({ queryKey: ["branch-staff-attendance"] });
      toast({ title: "Clocked out successfully" });
    },
    onError: (e) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  // clockOutMutation moved above with geofence support

  const formatTime = (ts: string | null) => {
    if (!ts) return "—";
    return format(new Date(ts), "hh:mm a");
  };

  const calcHours = (clockIn: string | null, clockOut: string | null) => {
    if (!clockIn || !clockOut) return "—";
    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  // isManager and isRestrictedAdmin are now computed above (before queries)

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editMode, setEditMode] = useState<"edit" | "add">("edit");

  const { data: branchStaffList = [] } = useQuery({
    queryKey: ["branch-staff-list", branchId],
    queryFn: async () => {
      const { data: memberships, error: membershipsError } = await supabase
        .from("branch_memberships")
        .select("user_id")
        .eq("branch_id", branchId);
      if (membershipsError) throw membershipsError;
      const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
      if (userIds.length === 0) return [];
      // Filter out parent-only users
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      });
      const staffUserIds = userIds.filter(uid => {
        const userRoles = roleMap.get(uid) || [];
        return userRoles.length === 0 || !userRoles.every(r => r === "parent");
      });
      if (staffUserIds.length === 0) return [];
      // Filter out excluded staff (owners/directors)
      const { data: spData } = await supabase.from("staff_profiles").select("user_id, exclude_from_payroll").in("user_id", staffUserIds);
      const excludeSet = new Set((spData ?? []).filter((sp: any) => sp.exclude_from_payroll === true).map((sp: any) => sp.user_id));
      const finalIds = staffUserIds.filter(uid => !excludeSet.has(uid));
      if (finalIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", finalIds);
      if (profilesError) throw profilesError;
      return (profiles ?? []).sort((a: any, b: any) => `${a.first_name ?? ""} ${a.last_name ?? ""}`.localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`));
    },
    enabled: !!branchId && isManager,
  });

  const staffDirectory = useMemo(() => {
    const map = new Map<string, any>();
    branchStaffList.forEach((staff: any) => map.set(staff.id, staff));
    return map;
  }, [branchStaffList]);

  // Check if selected date is a holiday/event that affects attendance (supports date ranges)
  const { data: dateHolidays = [] } = useQuery({
    queryKey: ["date-holidays", branchId, dateStr],
    queryFn: async () => {
      const results: { name: string; source: string }[] = [];
      const yearIds = await getBranchAcademicYearIds(branchId);
      // Check school_holidays — only holiday/reward_holiday are staff holidays
      const { data: sh } = await supabase
        .from("school_holidays")
        .select("event_name, end_date, event_type, is_public_holiday, affects_attendance")
        .in("academic_year_id", yearIds)
        .lte("event_date", dateStr)
        .or(`end_date.gte.${dateStr},end_date.is.null`);
      (sh ?? []).forEach((h: any) => {
        if (!isStaffPaidClosure(h)) return;
        if (h.end_date) {
          results.push({ name: h.event_name, source: "public" });
        }
      });
      // Also check exact single-date matches
      const { data: shExact } = await supabase
        .from("school_holidays")
        .select("event_name, event_type, is_public_holiday, affects_attendance")
        .in("academic_year_id", yearIds)
        .eq("event_date", dateStr)
        .is("end_date", null);
      (shExact ?? []).forEach((h: any) => {
        if (!isStaffPaidClosure(h)) return;
        if (!results.some(r => r.name === h.event_name)) {
          results.push({ name: h.event_name, source: "public" });
        }
      });
      // Check branch_events (date range support)
      if (branchId) {
        const { data: be } = await supabase
          .from("branch_events")
          .select("event_name, end_date, affects_attendance")
          .eq("branch_id", branchId)
          .eq("affects_attendance", true)
          .lte("event_date", dateStr)
          .or(`end_date.gte.${dateStr},end_date.is.null`);
        (be ?? []).forEach((e: any) => {
          if (!e.end_date) {
            // Single-date event — only match if event_date == dateStr (handled by exact query below)
          } else {
            results.push({ name: e.event_name, source: "branch" });
          }
        });
        // Exact single-date branch events
        const { data: beExact } = await supabase
          .from("branch_events")
          .select("event_name, affects_attendance")
          .eq("branch_id", branchId)
          .eq("affects_attendance", true)
          .eq("event_date", dateStr)
          .is("end_date", null);
        (beExact ?? []).forEach((e: any) => {
          if (!results.some(r => r.name === e.event_name)) {
            results.push({ name: e.event_name, source: "branch" });
          }
        });
      }
      return results;
    },
    enabled: !!dateStr,
  });

  const isHolidayDate = dateHolidays.length > 0;

  // KPI calculations for branch attendance
  // Use the shared "expected staff" resolver so the KPI cards reflect who was
  // actually expected to work — excluding resigned/terminated staff, future hires,
  // weekly off-days, public holidays and approved leave. This keeps Attendance
  // aligned with Payroll and prevents the "Not Clocked In" number from ballooning.
  const { data: expectedData } = useExpectedStaff(branchId, dateStr);
  const expectedSummary = expectedData?.summary;
  const present = expectedSummary?.clockedIn ?? branchAttendance.length;
  const completed = expectedSummary?.completed ?? branchAttendance.filter((a: any) => a.clock_out).length;
  const working = expectedSummary?.stillWorking ?? (present - completed);
  const absent = expectedSummary?.notClockedIn
    ?? (isHolidayDate ? 0 : Math.max(0, branchStaffList.length - branchAttendance.length));
  const expectedTotal = expectedSummary?.expected ?? branchStaffList.length;
  const excusedTotal = (expectedSummary?.onLeave ?? 0)
    + (expectedSummary?.publicHoliday ?? 0)
    + (expectedSummary?.offDay ?? 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff Attendance</h1>
            <p className="text-sm text-muted-foreground mt-1">Clock in/out and view attendance history</p>
          </div>
        </div>

        <Tabs defaultValue={currentUserExcluded ? (isManager ? "branch" : "history") : "clockin"}>
          <TabsList>
            {!currentUserExcluded && <TabsTrigger value="clockin">Clock In</TabsTrigger>}
            {isManager && <TabsTrigger value="branch">Daily View</TabsTrigger>}
            {isManager && <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>}
            {isManager && <TabsTrigger value="audit">Hours Audit</TabsTrigger>}
            <TabsTrigger value="history">My History</TabsTrigger>
          </TabsList>

          {/* ─── Clock In Tab ─── */}
          {!currentUserExcluded && (
            <TabsContent value="clockin" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-primary" />
                    Today — {format(new Date(), "EEEE, dd MMM yyyy")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-muted-foreground">Clock In</p>
                      <p className="text-lg font-semibold text-foreground">{formatTime(todayRecord?.clock_in ?? null)}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-muted-foreground">Clock Out</p>
                      <p className="text-lg font-semibold text-foreground">{formatTime(todayRecord?.clock_out ?? null)}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm text-muted-foreground">Hours</p>
                      <p className="text-lg font-semibold text-foreground">{calcHours(todayRecord?.clock_in ?? null, todayRecord?.clock_out ?? null)}</p>
                    </div>
                    <div className="flex gap-2">
                      {!todayRecord ? (
                        <Button onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending || !branchId}>
                          <LogIn className="h-4 w-4 mr-2" />
                          {geoStatus || (clockInMutation.isPending ? "Clocking in..." : "Clock In")}
                        </Button>
                      ) : !todayRecord.clock_out ? (
                        <Button variant="destructive" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending}>
                          <LogOut className="h-4 w-4 mr-2" />
                          {geoStatus || (clockOutMutation.isPending ? "Clocking out..." : "Clock Out")}
                        </Button>
                      ) : (
                        <Badge className="bg-accent text-accent-foreground">Completed</Badge>
                      )}
                    </div>
                  </div>
                  {enforceGeofence && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        Geofence enabled — {employeeGeofences.length > 0 ? "using your assigned work location" : "location will be verified on clock in/out"}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => navigate("/leave", { state: { from: "/staff-attendance" } })}>
                      <CalendarDays className="h-5 w-5 text-info" />
                      <span className="text-xs">Request Leave</span>
                    </Button>
                    <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => navigate("/claims", { state: { from: "/staff-attendance" } })}>
                      <FileText className="h-5 w-5 text-success" />
                      <span className="text-xs">Submit Claim</span>
                    </Button>
                    <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => navigate("/overtime", { state: { from: "/staff-attendance" } })}>
                      <Clock className="h-5 w-5 text-warning" />
                      <span className="text-xs">Request OT</span>
                    </Button>
                    <Button variant="outline" className="h-auto py-3 flex-col gap-1.5" onClick={() => navigate("/my-payslips", { state: { from: "/staff-attendance" } })}>
                      <DollarSign className="h-5 w-5 text-primary" />
                      <span className="text-xs">View Payslips</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Merged Branch Attendance View */}
          {isManager && (
            <TabsContent value="branch">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" /> Branch Attendance
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      {/* Staff filter dropdown */}
                      <Select value={selectedStaffId ?? "__all__"} onValueChange={(v) => setSelectedStaffId(v === "__all__" ? null : v)}>
                        <SelectTrigger className="w-[180px] h-8 text-sm">
                          <SelectValue placeholder="All Staff" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Staff</SelectItem>
                          {branchStaffList.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedStaffId ? (
                        /* Month navigation for individual view */
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setIndividualMonth(new Date(individualMonth.getFullYear(), individualMonth.getMonth() - 1))}>←</Button>
                          <span className="text-sm font-medium min-w-[130px] text-center">{format(individualMonth, "MMMM yyyy")}</span>
                          <Button variant="outline" size="sm" onClick={() => setIndividualMonth(new Date(individualMonth.getFullYear(), individualMonth.getMonth() + 1))}>→</Button>
                        </div>
                      ) : (
                        /* Date navigation for all-staff daily view */
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => { setEditMode("add"); setEditRecord(null); setEditDialogOpen(true); }}>
                              <Plus className="h-4 w-4 mr-1" /> Add Record
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 86400000))}>←</Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 min-w-[160px]">
                                <CalendarIcon className="h-3.5 w-3.5" />
                                {format(selectedDate, "EEE, dd MMM yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(d) => d && setSelectedDate(d)}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 86400000))}>→</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedStaffId ? (
                    <IndividualMonthView
                      staffId={selectedStaffId}
                      staffName={`${staffDirectory.get(selectedStaffId)?.first_name || ""} ${staffDirectory.get(selectedStaffId)?.last_name || ""}`.trim()}
                      month={individualMonth}
                      branchId={branchId}
                      canEdit={canEdit}
                      onEditRecord={(record, mode) => { setEditMode(mode); setEditRecord(record); setEditDialogOpen(true); }}
                    />
                  ) : (
                    <>
                      {/* KPI Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                          <Users className="h-4 w-4 mx-auto text-primary mb-1" />
                          <p className="text-lg font-bold">{present}</p>
                          <p className="text-xs text-muted-foreground">Clocked In</p>
                          <p className="text-[10px] text-muted-foreground">of {expectedTotal} expected</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <Clock className="h-4 w-4 mx-auto text-warning0 mb-1" />
                          <p className="text-lg font-bold">{working}</p>
                          <p className="text-xs text-muted-foreground">Still Working</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <CheckCircle2 className="h-4 w-4 mx-auto text-success0 mb-1" />
                          <p className="text-lg font-bold">{completed}</p>
                          <p className="text-xs text-muted-foreground">Completed</p>
                        </div>
                        <div className="rounded-lg border p-3 text-center">
                          <XCircle className="h-4 w-4 mx-auto text-destructive mb-1" />
                          <p className="text-lg font-bold">{absent}</p>
                          <p className="text-xs text-muted-foreground">Not Clocked In</p>
                          {excusedTotal > 0 && (
                            <p className="text-[10px] text-muted-foreground">{excusedTotal} excused (leave/holiday/off)</p>
                          )}
                        </div>
                      </div>
                      {/* Holiday Banner */}
                      {isHolidayDate && (
                        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-center gap-2">
                          <Flag className="h-4 w-4 text-warning" />
                          <p className="text-sm font-medium text-warning">
                            {dateHolidays.map(h => h.name).join(", ")} — No clock-in required
                          </p>
                        </div>
                      )}

                      {branchAttendance.length === 0 && !isHolidayDate ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">No attendance records for this date</div>
                      ) : (
                        <Table>
                          <TableHeader>
                             <TableRow>
                              <TableHead>Staff</TableHead>
                              <TableHead>Clock In</TableHead>
                              <TableHead>Clock Out</TableHead>
                              <TableHead>Hours</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-10"></TableHead>
                              {canEdit && <TableHead className="w-16"></TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {branchAttendance.map((a: any) => (
                              <TableRow key={a.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-foreground">{staffDirectory.get(a.user_id)?.first_name} {staffDirectory.get(a.user_id)?.last_name}</p>
                                    <p className="text-xs text-muted-foreground">{staffDirectory.get(a.user_id)?.email}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{formatTime(a.clock_in)}</TableCell>
                                <TableCell>{formatTime(a.clock_out)}</TableCell>
                                <TableCell>{calcHours(a.clock_in, a.clock_out)}</TableCell>
                                <TableCell>
                                  {a.clock_out ? (
                                    <Badge className="bg-accent/10 text-accent text-xs">Completed</Badge>
                                  ) : (
                                    <Badge className="bg-primary/10 text-primary text-xs">Working</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {a.is_outside_geofence && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <AlertTriangle className="h-4 w-4 text-warning0" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          <p className="text-xs font-medium">Out of Zone</p>
                                          <p className="text-xs text-muted-foreground">{a.geofence_note}</p>
                                          {a.selfie_url && (
                                            <a href={a.selfie_url} target="_blank" rel="noopener" className="text-xs text-primary underline">View selfie</a>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </TableCell>
                                {canEdit && (
                                  <TableCell>
                                    <Button size="icon" variant="ghost" onClick={() => { setEditMode("edit"); setEditRecord(a); setEditDialogOpen(true); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Monthly Summary */}
          {isManager && (
            <TabsContent value="monthly">
              <MonthlyAttendanceSummary branchId={branchId} branchStaffList={branchStaffList} />
            </TabsContent>
          )}

          {/* Hours Audit */}
          {isManager && (
            <TabsContent value="audit">
              <HoursAuditTab branchId={branchId} branchStaffList={branchStaffList} />
            </TabsContent>
          )}

          {/* My History */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" /> Attendance History
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setHistoryMonth(new Date(historyMonth.getFullYear(), historyMonth.getMonth() - 1))}>
                      ←
                    </Button>
                    <span className="text-sm font-medium min-w-[120px] text-center">{format(historyMonth, "MMMM yyyy")}</span>
                    <Button variant="outline" size="sm" onClick={() => setHistoryMonth(new Date(historyMonth.getFullYear(), historyMonth.getMonth() + 1))}>
                      →
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No records for this month</div>
                ) : (
                  <Table>
                     <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead className="w-[40px]">Zone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((a: any) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{format(parseISO(a.date), "EEE, dd MMM")}</TableCell>
                          <TableCell>{formatTime(a.clock_in)}</TableCell>
                          <TableCell>{formatTime(a.clock_out)}</TableCell>
                          <TableCell>{calcHours(a.clock_in, a.clock_out)}</TableCell>
                          <TableCell>
                            {a.is_outside_geofence && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-destructive0" />
                                  </TooltipTrigger>
                                  <TooltipContent><p className="text-xs max-w-[200px]">{a.geofence_note || "Outside geofence"}</p></TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <EditAttendanceDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          record={editRecord}
          branchId={branchId}
          branchStaff={branchStaffList}
          mode={editMode}
        />

        {outsideGeoData && (
          <OutsideGeofenceDialog
            open={!!outsideGeoData}
            onOpenChange={(open) => { if (!open) setOutsideGeoData(null); }}
            distanceMeters={outsideGeoData.dist}
            nearestLocationName={outsideGeoData.name}
            userLat={outsideGeoData.lat}
            userLng={outsideGeoData.lng}
            userId={user!.id}
            onConfirm={handleOutsideGeofenceConfirm}
            isPending={false}
            action={outsideGeoData.action}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
