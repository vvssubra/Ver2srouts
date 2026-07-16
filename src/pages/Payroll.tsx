import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useApprovalSettings } from "@/hooks/use-approval-settings";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, DollarSign, Users, FileText, CalendarDays, Receipt, Printer, CheckCircle2, Banknote, BarChart3, Clock, Loader2, AlertCircle, Trash2, RotateCcw, Plus, X, TrendingUp, TrendingDown, Building2, ChevronDown, ChevronUp, Zap, Send, ThumbsUp, ThumbsDown, CalendarIcon, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, endOfMonth, differenceInBusinessDays, eachDayOfInterval, getDay, isSameDay, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import PayslipPrintView, { type PayslipData } from "@/components/PayslipPrintView";
import { getBranchAcademicYearIds } from "@/lib/school-holidays-scope";
import { notifyBranchApprovers, notifyUsers, notifyAndEmailWorkflowApprovers, notifyAndEmailSubmitterDecision } from "@/lib/notify";
import { calcEPFStatutory, calcSOCSOStatutory, calcEISStatutory } from "@/lib/payroll/statutory-tables";

// Any HR-calendar row that means "school is closed and staff are paid".
// Widened to accept legacy/alternate event_type values so a Public Holiday
// created via any pathway (HR Calendar, Yearly Planner, auto-populate) is
// always recognised — never treated as absent.
const PAID_CLOSURE_EVENT_TYPES = new Set([
  "holiday", "reward_holiday", "public_holiday", "term_holiday",
  "term_break", "semester_break", "mid_term_holiday",
  "school_closure", "closure",
]);
function isPaidClosure(h: any): boolean {
  if (!h) return false;
  if (h.is_public_holiday === true) return true;
  if (h.affects_attendance === true) return true;
  const et = h.event_type || (h.is_public_holiday ? "holiday" : "");
  return PAID_CLOSURE_EVENT_TYPES.has(et);
}

// Include active/on-notice staff always. For separated staff (resigned/
// terminated), still show them for payroll runs of any month whose start
// is on/before their last working day — so their final payslip can be
// processed after they leave.
function isEligibleForPayrollMonth(sp: any, periodStart: Date): boolean {
  if (!sp) return true;
  const status = sp.employment_status;
  if (status === "active" || status === "on_notice") return true;
  if (status === "resigned" || status === "terminated") {
    const lwd = sp.last_working_date || sp.resignation_date;
    if (!lwd) return true; // no cutoff recorded — keep visible
    const last = new Date(lwd);
    return periodStart.getTime() <= last.getTime();
  }
  return false;
}

// ─── Malaysian Statutory Rates (2024/2025) ───────────────────────────
const EPF_EMPLOYEE_RATE = 0.11;
const EPF_EMPLOYER_RATE_LOW = 0.13;
const EPF_EMPLOYER_RATE_HIGH = 0.12;
const EPF_EMPLOYER_THRESHOLD = 5000;
const SOCSO_WAGE_CEILING = 6000;
const SOCSO_EMPLOYEE_RATE = 0.005;
const SOCSO_EMPLOYER_RATE = 0.0175;
const EIS_WAGE_CEILING = 6000;
const EIS_RATE = 0.002;

const TAX_BRACKETS = [
  { min: 0, max: 5000, rate: 0 },
  { min: 5000, max: 20000, rate: 0.01 },
  { min: 20000, max: 35000, rate: 0.03 },
  { min: 35000, max: 50000, rate: 0.06 },
  { min: 50000, max: 70000, rate: 0.11 },
  { min: 70000, max: 100000, rate: 0.19 },
  { min: 100000, max: 400000, rate: 0.25 },
  { min: 400000, max: 600000, rate: 0.26 },
  { min: 600000, max: 2000000, rate: 0.28 },
  { min: 2000000, max: Infinity, rate: 0.30 },
];

// Uses official KWSP / PERKESO / EIS bracket tables (Malaysian statute).
// See src/lib/payroll/statutory-tables.ts
function calcEPF(gross: number, customRate?: number | null) {
  const r = calcEPFStatutory(gross, customRate);
  return { employee: r.employee, employer: r.employer, employeeRate: r.employeeRate, bracket: r.bracket };
}
// Perlindungan 24 Jam (extra 0.75% employee contribution combined with SOCSO
// 0.50% → 1.25% total) only applies from June 2026 payroll onwards. For any
// earlier payroll month we fall back to the legacy 0.50% SOCSO-only rate so
// that historical calculations are not altered.
const PERLINDUNGAN24_START_YEAR = 2026;
const PERLINDUNGAN24_START_MONTH = 6; // June
function isPerlindungan24Active(year?: number, month?: number) {
  if (!year || !month) return true; // default modern behaviour
  if (year > PERLINDUNGAN24_START_YEAR) return true;
  if (year < PERLINDUNGAN24_START_YEAR) return false;
  return month >= PERLINDUNGAN24_START_MONTH;
}
function calcSOCSO(gross: number, customRate?: number | null, year?: number, month?: number) {
  // If HR set a custom rate, always honour it verbatim.
  if (customRate != null) {
    const r = calcSOCSOStatutory(gross, customRate);
    return { employee: r.employee, employer: r.employer, employeeRate: r.employeeRate, bracket: r.bracket };
  }
  // Before June 2026 → SOCSO only at 0.50% (no Perlindungan 24 Jam).
  if (!isPerlindungan24Active(year, month)) {
    const r = calcSOCSOStatutory(gross, 0.5);
    return { employee: r.employee, employer: r.employer, employeeRate: r.employeeRate, bracket: r.bracket };
  }
  const r = calcSOCSOStatutory(gross, customRate);
  return { employee: r.employee, employer: r.employer, employeeRate: r.employeeRate, bracket: r.bracket };
}
function calcEIS(gross: number, customRate?: number | null) {
  const r = calcEISStatutory(gross, customRate);
  return { employee: r.employee, employer: r.employer, employeeRate: r.employeeRate, bracket: r.bracket };
}

function calcPCB(grossMonthly: number, epfMonthly: number) {
  const annualGross = grossMonthly * 12;
  const annualEPF = Math.min(epfMonthly * 12, 4000);
  const personalRelief = 9000;
  const chargeableIncome = Math.max(0, annualGross - annualEPF - personalRelief);
  let annualTax = 0;
  for (const bracket of TAX_BRACKETS) {
    if (chargeableIncome <= bracket.min) break;
    annualTax += (Math.min(chargeableIncome, bracket.max) - bracket.min) * bracket.rate;
  }
  if (chargeableIncome <= 35000) annualTax = Math.max(0, annualTax - 400);
  return Math.round((annualTax / 12) * 100) / 100;
}

function calcUnpaidLeaveDeduction(basicSalary: number, unpaidDays: number, divisor: number = 26) {
  if (unpaidDays <= 0 || basicSalary <= 0) return 0;
  const d = divisor > 0 ? divisor : 26;
  return Math.round((basicSalary / d) * unpaidDays * 100) / 100;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface CustomItem { id: string; label: string; type: "earning" | "deduction"; amount: number; }

// ─── Inline Editor Component ──────────────────────────────────────
function InlinePayrollEditor({ record, branches, onSaved, onPrint, user, approvalEnabled }: {
  record: any;
  branches: any[];
  onSaved: () => void;
  onPrint: (data: PayslipData) => void;
  user: any;
  approvalEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [basicSalary, setBasicSalary] = useState(String(record.basic_salary ?? "0"));
  const [allowances, setAllowances] = useState(String(record.allowances ?? "0"));
  const [otherAllowances, setOtherAllowances] = useState(String(record.other_allowances ?? "0"));
  const [overtimeHours, setOvertimeHours] = useState(String(record.overtime_hours ?? "0"));
  const [overtimeRate, setOvertimeRate] = useState(String(record.overtime_rate ?? "0"));
  const [lateDeduction, setLateDeduction] = useState(String(record.late_deduction ?? "0"));
  const [advanceDeduction, setAdvanceDeduction] = useState(String(record.advance_deduction ?? "0"));
  const [otherDeductions, setOtherDeductions] = useState(String(record.other_deductions ?? "0"));
  const [claimsAmount, setClaimsAmount] = useState(Number(record.claims_amount ?? 0));
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);

  // Load staff salary components
  const { data: salaryComponents } = useQuery({
    queryKey: ["salary-components-inline", record.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_salary_components" as any).select("*").eq("user_id", record.user_id).eq("is_active", true);
      return (data ?? []) as any[];
    },
  });

  // Load staff profile for custom rates, deduction toggles, and IC/EPF/SOCSO
  const { data: staffProfile } = useQuery({
    queryKey: ["staff-profile-inline", record.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("custom_epf_rate, custom_socso_rate, custom_eis_rate, work_schedule, overtime_rate, epf_enabled, socso_enabled, eis_enabled, basic_salary, ic_number, epf_number, socso_number, employment_type").eq("user_id", record.user_id).maybeSingle();
      return data;
    },
  });

  // Load staff designation
  const { data: staffDesignation } = useQuery({
    queryKey: ["staff-designation-inline", record.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_designations").select("designation, custom_designation").eq("user_id", record.user_id).maybeSingle();
      return data;
    },
  });

  // Auto-detect approved OT requests for this month (with cutoff logic)
  const { data: approvedOT } = useQuery({
    queryKey: ["approved-ot-inline", record.user_id, record.month, record.year, record.branch_id],
    queryFn: async () => {
      const ms = format(new Date(record.year, record.month - 1, 1), "yyyy-MM-dd");
      const me = format(endOfMonth(new Date(record.year, record.month - 1, 1)), "yyyy-MM-dd");
      // Fetch cutoff policy
      const { data: cutoffData } = await supabase.from("hr_policies").select("policy_data").eq("branch_id", record.branch_id).eq("policy_type", "payroll_cutoff").maybeSingle();
      const cutoff = cutoffData?.policy_data as any;
      const cutoffEnabled = cutoff?.enabled === true;
      // Aggregate by assigned payroll_month (new logic). Fall back to OT date
      // for legacy rows where payroll_month was never written.
      let query = supabase
        .from("overtime_requests")
        .select("hours, date, overtime_type, is_late_submission, payroll_month")
        .eq("user_id", record.user_id)
        .in("status", ["approved", "pending_payroll", "assigned_next_payroll"])
        .or(`payroll_month.eq.${ms},and(payroll_month.is.null,date.gte.${ms},date.lte.${me})`);
      if (cutoffEnabled && cutoff?.ot_cutoff_day) {
        const otCutoffTs = format(new Date(record.year, record.month, cutoff.ot_cutoff_day), "yyyy-MM-dd") + "T23:59:59";
        query = query.lte("created_at", otCutoffTs);
      }
      const { data } = await query;
      return data ?? [];
    },
  });

  // Load branch settings for logo and company info
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings-inline", record.branch_id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("logo_url, school_display_name, business_registration_no, address_line, phone, email").eq("branch_id", record.branch_id).maybeSingle();
      return data;
    },
  });

  // Load YTD payroll data
  const { data: ytdRecords } = useQuery({
    queryKey: ["ytd-payroll-inline", record.user_id, record.year, record.month],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_records").select("gross_salary, epf_employee, socso_employee, eis_employee, pcb_amount, net_salary, month, status").eq("user_id", record.user_id).eq("year", record.year).lte("month", record.month).neq("status", "reversed");
      return data ?? [];
    },
  });

  // Load existing custom items
  const { data: existingCustomItems } = useQuery({
    queryKey: ["payroll-custom-items", record.id],
    queryFn: async () => {
      const { data } = await supabase.from("payroll_custom_items").select("*").eq("payroll_record_id", record.id);
      return data ?? [];
    },
  });

  // Load attendance for this month
  const monthStart = format(new Date(record.year, record.month - 1, 1), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(record.year, record.month - 1, 1)), "yyyy-MM-dd");

  const { data: staffAttendance } = useQuery({
    queryKey: ["staff-attendance-inline", record.user_id, record.month, record.year],
    queryFn: async () => {
      const { data } = await supabase.from("staff_attendance").select("clock_in, clock_out, date").eq("user_id", record.user_id).gte("date", monthStart).lte("date", monthEnd);
      return data ?? [];
    },
  });

  const { data: staffLeave } = useQuery({
    queryKey: ["staff-leave-inline", record.user_id, record.month, record.year],
    queryFn: async () => {
      // Load any approved leave that overlaps this payroll month (start within month OR end within/after month start)
      const { data } = await supabase
        .from("leave_requests")
        .select("leave_type, days, status, start_date, end_date")
        .eq("user_id", record.user_id)
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .or(`end_date.gte.${monthStart},end_date.is.null`);
      return data ?? [];
    },
  });

  // Load holidays: school_holidays uses event_date, not start_date
  const { data: holidays } = useQuery({
    queryKey: ["holidays-inline", record.branch_id, record.month, record.year],
    queryFn: async () => {
      const yearIds = await getBranchAcademicYearIds(record.branch_id);
      const { data } = await supabase.from("school_holidays").select("event_date, end_date, event_type, is_public_holiday, affects_attendance").in("academic_year_id", yearIds).lte("event_date", monthEnd).gte("event_date", monthStart);
      return (data ?? []).filter(isPaidClosure) as any[];
    },
  });

  // Load early-paid claims for recovery calculation
  const { data: earlyPaidClaims } = useQuery({
    queryKey: ["early-paid-claims-inline", record.user_id, record.month, record.year],
    queryFn: async () => {
      const { data } = await supabase.from("staff_claims").select("amount, paid_at").eq("user_id", record.user_id).eq("paid_via", "early_payment").eq("level2_status", "approved").or(`and(payroll_month.eq.${record.month},payroll_year.eq.${record.year}),and(payroll_month.is.null,claim_date.gte.${monthStart},claim_date.lte.${monthEnd})`);
      return data ?? [];
    },
  });
  const earlyPaidAmount = (earlyPaidClaims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);

  const { data: branchEvents } = useQuery({
    queryKey: ["branch-events-inline", record.branch_id, record.month, record.year],
    queryFn: async () => {
      const { data } = await supabase.from("branch_events").select("event_date, end_date, affects_attendance, event_type, is_paid").eq("branch_id", record.branch_id).gte("event_date", monthStart).lte("event_date", monthEnd).eq("affects_attendance", true);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (existingCustomItems) {
      setCustomItems(existingCustomItems.map((ci: any) => ({ id: ci.id, label: ci.label, type: ci.type as "earning" | "deduction", amount: Number(ci.amount) })));
    }
  }, [existingCustomItems]);

  // Compute OT breakdown by type from approved OT requests
  const otBreakdown = useMemo(() => {
    if (!approvedOT || approvedOT.length === 0) return { normal: 0, rest_day: 0, public_holiday: 0, totalHrs: 0, totalAmount: 0 };
    const basic = staffProfile?.basic_salary || parseFloat(basicSalary || "0");
    const hourlyRate = basic > 0 ? basic / 26 / 8 : 0;
    let normalHrs = 0, restHrs = 0, phHrs = 0, totalAmount = 0;
    approvedOT.forEach((r: any) => {
      const hrs = Number(r.hours || 0);
      const otType = (r as any).overtime_type || "normal";
      const multiplier = otType === "public_holiday" ? 3.0 : otType === "rest_day" ? 2.0 : 1.5;
      totalAmount += hrs * hourlyRate * multiplier;
      if (otType === "public_holiday") phHrs += hrs;
      else if (otType === "rest_day") restHrs += hrs;
      else normalHrs += hrs;
    });
    // Round each part to 2 decimals to eliminate floating-point drift (e.g.
    // 1.9 + 1.9 = 3.8000000000000003) while preserving the approved decimal
    // precision of the underlying OT hours.
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const totalHrs = r2(normalHrs + restHrs + phHrs);
    return { normal: r2(normalHrs), rest_day: r2(restHrs), public_holiday: r2(phHrs), totalHrs, totalAmount: r2(totalAmount) };
  }, [approvedOT, staffProfile, basicSalary]);

  // Auto-populate OT from approved requests. Always resync while the record
  // is still editable so newly-approved OT (including same-month approvals
  // after the payroll row was drafted) is picked up with exact decimal hours.
  useEffect(() => {
    if (!approvedOT || approvedOT.length === 0) return;
    if (otBreakdown.totalHrs <= 0) return;
    // Only overwrite while payroll is still a draft — never touch confirmed/paid rows.
    if (record.status && record.status !== "draft") return;
    const nextHrs = String(otBreakdown.totalHrs);
    const avgRate = otBreakdown.totalAmount / otBreakdown.totalHrs;
    const nextRate = String(Math.round(avgRate * 100) / 100);
    if (overtimeHours !== nextHrs) setOvertimeHours(nextHrs);
    if (overtimeRate !== nextRate) setOvertimeRate(nextRate);
  }, [approvedOT, otBreakdown, record.status]);

  const attendanceSummary = useMemo(() => {
    const allDays = eachDayOfInterval({ start: new Date(record.year, record.month - 1, 1), end: new Date(monthEnd) });
    const workSchedule = (staffProfile as any)?.work_schedule;
    const isIntern = (staffProfile as any)?.employment_type === "intern";
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    // Helper: is this a scheduled work day? Returns fraction (0, 0.5, 1)
    const getWorkDayFraction = (d: Date): number => {
      const dow = getDay(d);
      // Interns are always Mon-Fri regardless of any Saturday shift left on the profile.
      if (isIntern && (dow === 0 || dow === 6)) return 0;
      if (workSchedule) {
        const shift = workSchedule[String(dow)] !== undefined ? workSchedule[String(dow)] : workSchedule[dayNames[dow]];
        // Explicitly off: null or false
        if (shift === null || shift === false) return 0;
        // Undefined = use default: weekends off, weekdays work
        if (shift === undefined) {
          if (dow === 0 || dow === 6) return 0;
          return 1;
        }
        // Saturday half-day: if end time <= 13:00, count as 0.5
        if (dow === 6) {
          const endTime = typeof shift === "object" && shift.end ? shift.end : null;
          if (endTime && endTime <= "13:00") return 0.5;
        }
        return 1;
      }
      // Default: Mon-Fri = 1, Sat/Sun = 0
      if (dow === 0 || dow === 6) return 0;
      return 1;
    };

    // Build holiday metadata map: date -> { type, isPaid }
    const holidayMeta = new Map<string, { type: string; isPaid: boolean }>();
    (holidays ?? []).forEach((h: any) => {
      const dates = h.end_date
        ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd"))
        : [h.event_date];
      dates.forEach(ds => holidayMeta.set(ds, { type: "public_holiday", isPaid: true }));
    });
    (branchEvents ?? []).forEach((e: any) => {
      const dates = e.end_date
        ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd"))
        : [e.event_date];
      dates.forEach(ds => {
        if (!holidayMeta.has(ds)) {
          const evType = (e as any).event_type || "public_holiday";
          holidayMeta.set(ds, { type: evType, isPaid: (e as any).is_paid !== false });
        }
      });
    });

    // Attendance records map
    const attMap = new Map<string, any>();
    (staffAttendance ?? []).forEach((a: any) => attMap.set(a.date, a));

    // Leave date map: dates within this month that are covered by approved leave
    const leaveDateMap = new Map<string, string>();
    (staffLeave ?? []).forEach((l: any) => {
      if (!l.start_date) return;
      const start = parseISO(l.start_date);
      const end = l.end_date ? parseISO(l.end_date) : start;
      const monthStartD = parseISO(monthStart);
      const monthEndD = parseISO(monthEnd);
      const from = start < monthStartD ? monthStartD : start;
      const to = end > monthEndD ? monthEndD : end;
      if (from > to) return;
      eachDayOfInterval({ start: from, end: to }).forEach(d => {
        leaveDateMap.set(format(d, "yyyy-MM-dd"), l.leave_type);
      });
    });

    let presentDays = 0, lateDays = 0, publicHolidayDays = 0, rewardHolidayDays = 0, absentDays = 0, totalMinutes = 0;

    allDays.forEach(d => {
      if (d > new Date()) return; // skip future days
      const ds = format(d, "yyyy-MM-dd");
      const fraction = getWorkDayFraction(d);
      if (fraction === 0 && !holidayMeta.has(ds)) return; // off day, skip

      const hol = holidayMeta.get(ds);
      const att = attMap.get(ds);

      if (hol) {
        // Holiday on a work day counts as paid
        if (fraction > 0) {
          if (hol.type === "reward_holiday") rewardHolidayDays += fraction;
          else publicHolidayDays += fraction;
        }
        // If staff also clocked in on holiday, count hours
        if (att && att.clock_in && att.clock_out) {
          totalMinutes += (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 60000;
        }
        return;
      }

      if (att) {
        // Check late
        if (att.clock_in) {
          const clockInTime = format(new Date(att.clock_in), "HH:mm");
          // Dynamic late threshold from work schedule
          const dow = getDay(d);
          const shift = workSchedule ? (workSchedule[String(dow)] !== undefined ? workSchedule[String(dow)] : workSchedule[dayNames[dow]]) : null;
          const shiftStart = (shift && typeof shift === "object" && shift.start) ? shift.start : "08:00";
          const [sh, sm] = shiftStart.split(":").map(Number);
          const thresholdDate = new Date(2000, 0, 1, sh, sm + 5);
          const lateThreshold = format(thresholdDate, "HH:mm");
          if (clockInTime > lateThreshold) lateDays++;
        }
        presentDays += fraction;
        if (att.clock_in && att.clock_out) {
          totalMinutes += (new Date(att.clock_out).getTime() - new Date(att.clock_in).getTime()) / 60000;
        }
      } else {
        // Approved leave days are accounted for in leaveSummary, not absent
        if (leaveDateMap.has(ds)) return;
        absentDays += fraction;
      }
    });

    const totalPaidDays = presentDays + publicHolidayDays + rewardHolidayDays;
    return {
      presentDays,
      lateDays,
      publicHolidayDays,
      rewardHolidayDays,
      absentDays,
      totalPaidDays,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      // Legacy compat
      daysPresent: totalPaidDays,
      lateCount: lateDays,
      holidayCount: publicHolidayDays + rewardHolidayDays,
    };
  }, [staffAttendance, staffLeave, monthStart, monthEnd, holidays, branchEvents, staffProfile, record.year, record.month]);

  const leaveSummary = useMemo(() => {
    if (!staffLeave) return { unpaidDays: 0, annualDays: 0, medicalDays: 0, otherDays: 0, total: 0 };
    const unpaidDays = staffLeave.filter((l: any) => l.leave_type === "unpaid").reduce((s: number, l: any) => s + l.days, 0);
    const annualDays = staffLeave.filter((l: any) => l.leave_type === "annual").reduce((s: number, l: any) => s + l.days, 0);
    const medicalDays = staffLeave.filter((l: any) => l.leave_type === "medical").reduce((s: number, l: any) => s + l.days, 0);
    const otherDays = staffLeave.filter((l: any) => !["unpaid", "annual", "medical"].includes(l.leave_type)).reduce((s: number, l: any) => s + l.days, 0);
    return { unpaidDays, annualDays, medicalDays, otherDays, total: unpaidDays + annualDays + medicalDays + otherDays };
  }, [staffLeave]);

  const customEpfRate = staffProfile?.custom_epf_rate;
  const customSocsoRate = staffProfile?.custom_socso_rate;
  const customEisRate = staffProfile?.custom_eis_rate;
  const epfEnabled = (staffProfile as any)?.epf_enabled !== false;
  const socsoEnabled = (staffProfile as any)?.socso_enabled !== false;
  const eisEnabled = (staffProfile as any)?.eis_enabled !== false;
  // Interns receive a fixed monthly allowance with no statutory contributions.
  // Only Absent and Unpaid Leave deductions apply (both are prorated against
  // their Mon–Fri schedule via attendanceSummary).
  const isInternEmp = (staffProfile as any)?.employment_type === "intern";

  // Salary components breakdown
  const compStatutoryEarnings = (salaryComponents ?? []).filter((c: any) => c.type === "earning" && c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
  const compNonStatutoryEarnings = (salaryComponents ?? []).filter((c: any) => c.type === "earning" && !c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
  const compDeductions = (salaryComponents ?? []).filter((c: any) => c.type === "deduction").reduce((s: number, c: any) => s + Number(c.amount), 0);

  // Calculations
  const basicPay = parseFloat(basicSalary || "0");
  const otHours = parseFloat(overtimeHours || "0");
  const otRate = parseFloat(overtimeRate || "0");
  const otAmount = Math.round(otHours * otRate * 100) / 100;
  const extraAllowances = parseFloat(otherAllowances || "0");
  // Unpaid Leave and Absent are calculated with the same daily-rate formula
  // (basic / 26 * days) but kept as two SEPARATE deduction lines. Absent days
  // come straight from the Attendance module (scheduled workdays with no
  // clock-in and no approved leave). If HR later adds a clock-in/out for that
  // date, absent drops and the auto-resync effect rewrites the draft row.
  const absentDays = attendanceSummary.absentDays || 0;
  // Interns are Mon–Fri; deductions should use actual Mon–Fri days in the
  // payroll month rather than the fixed /26 rate used for 6-day workers.
  const internDivisor = (() => {
    if (!isInternEmp) return 26;
    const days = eachDayOfInterval({ start: new Date(record.year, record.month - 1, 1), end: new Date(monthEnd) });
    const count = days.filter(d => { const dow = getDay(d); return dow !== 0 && dow !== 6; }).length;
    return count > 0 ? count : 22;
  })();
  const unpaidLeaveDed = calcUnpaidLeaveDeduction(basicPay, leaveSummary.unpaidDays, internDivisor);
  const absentDed = calcUnpaidLeaveDeduction(basicPay, absentDays, internDivisor);
  const customEarnings = customItems.filter(i => i.type === "earning").reduce((s, i) => s + i.amount, 0);
  const customDeductions = customItems.filter(i => i.type === "deduction").reduce((s, i) => s + i.amount, 0);
  // Malaysian statutory bases (EPF Act 1991): OT is EXEMPT from EPF, but INCLUDED in SOCSO/EIS.
  const epfBase = basicPay + parseFloat(allowances || "0") + compStatutoryEarnings;
  const socsoEisBase = epfBase + otAmount;
  const statutoryGross = epfBase; // kept for backward compat in display logic below
  // Total gross = everything
  const gross = epfBase + otAmount + compNonStatutoryEarnings + extraAllowances + customEarnings;
  const epfRaw = calcEPF(epfBase, customEpfRate);
  const socsoRaw = calcSOCSO(socsoEisBase, customSocsoRate, record.year, record.month);
  const eisRaw = calcEIS(socsoEisBase, customEisRate);
  const perlindunganActive = isPerlindungan24Active(record.year, record.month);
  const epf = (isInternEmp || !epfEnabled) ? { employee: 0, employer: 0, employeeRate: epfRaw.employeeRate } : epfRaw;
  const socso = (isInternEmp || !socsoEnabled) ? { employee: 0, employer: 0, employeeRate: socsoRaw.employeeRate } : socsoRaw;
  const eis = (isInternEmp || !eisEnabled) ? { employee: 0, employer: 0, employeeRate: eisRaw.employeeRate } : eisRaw;
  const pcb = isInternEmp ? 0 : calcPCB(socsoEisBase, epf.employee);
  const lateDed = parseFloat(lateDeduction || "0");
  const advanceDed = parseFloat(advanceDeduction || "0");
  const otherDed = parseFloat(otherDeductions || "0");
  const totalDeductions = epf.employee + socso.employee + eis.employee + pcb + lateDed + advanceDed + otherDed + unpaidLeaveDed + absentDed + customDeductions + compDeductions;
  const netSalary = gross - totalDeductions + claimsAmount - earlyPaidAmount;
  const totalEmployerContrib = epf.employer + socso.employer + eis.employer;
  const totalEmployerCost = gross + totalEmployerContrib;

  const rm = (v: number) => `RM ${v.toFixed(2)}`;

  // ─── Auto-resync draft payroll when attendance / leave changes ─────────
  // Only draft or pending_approval rows are ever touched. Approved / paid
  // rows stay byte-identical. A signature ref prevents update loops.
  const lastSyncSigRef = useRef<string>("");
  const isSyncableStatus = !record.status || record.status === "draft" || record.status === "pending_approval";
  useEffect(() => {
    if (!isSyncableStatus || !record.id) return;
    if (!staffProfile) return; // wait until profile loaded so calc is stable
    const roundedDaysWorked = Math.round(attendanceSummary.daysPresent * 100) / 100;
    // Signature covers every field we auto-persist so any drift in
    // attendance / leave / OT / statutory contributions triggers exactly one
    // update.
    const sig = [
      unpaidLeaveDed, absentDed, roundedDaysWorked, gross, otHours, otRate, otAmount,
      epf.employee, epf.employer, socso.employee, socso.employer,
      eis.employee, eis.employer, pcb, totalDeductions, netSalary,
    ].join("|");
    if (sig === lastSyncSigRef.current) return;
    const savedUnpaid = Number(record.unpaid_leave_deduction || 0);
    const savedAbsent = Number(record.absent_deduction || 0);
    const savedDaysWorked = Number(record.days_worked || 0);
    const savedNet = Number(record.net_salary || 0);
    const savedGross = Number(record.gross_salary || 0);
    const savedOtHours = Number(record.overtime_hours || 0);
    const savedOtAmount = Number(record.overtime_amount || 0);
    const savedEpfEmp = Number(record.epf_employee || 0);
    const savedSocsoEmp = Number(record.socso_employee || 0);
    const savedEisEmp = Number(record.eis_employee || 0);
    const savedPcb = Number(record.pcb_amount || 0);
    // Tolerance 1 cent / 0.01 day / 0.01 hr to avoid floating-point churn.
    const drift =
      Math.abs(savedUnpaid - unpaidLeaveDed) > 0.01
      || Math.abs(savedAbsent - absentDed) > 0.01
      || Math.abs(savedDaysWorked - roundedDaysWorked) > 0.01
      || Math.abs(savedNet - netSalary) > 0.01
      || Math.abs(savedGross - gross) > 0.01
      || Math.abs(savedOtHours - otHours) > 0.01
      || Math.abs(savedOtAmount - otAmount) > 0.01
      || Math.abs(savedEpfEmp - epf.employee) > 0.01
      || Math.abs(savedSocsoEmp - socso.employee) > 0.01
      || Math.abs(savedEisEmp - eis.employee) > 0.01
      || Math.abs(savedPcb - pcb) > 0.01;
    if (!drift) { lastSyncSigRef.current = sig; return; }
    lastSyncSigRef.current = sig;
    (async () => {
      const { error } = await supabase.from("payroll_records").update({
        gross_salary: gross,
        overtime_hours: otHours,
        overtime_rate: otRate,
        overtime_amount: otAmount,
        epf_employee: epf.employee, epf_employer: epf.employer,
        socso_employee: socso.employee, socso_employer: socso.employer,
        eis_employee: eis.employee, eis_employer: eis.employer,
        pcb_amount: pcb,
        unpaid_leave_deduction: unpaidLeaveDed,
        absent_deduction: absentDed,
        days_worked: roundedDaysWorked,
        net_salary: netSalary,
      } as any).eq("id", record.id).in("status", ["draft", "pending_approval"]);
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
        queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
      }
    })();
  }, [
    isSyncableStatus, record.id, staffProfile,
    unpaidLeaveDed, absentDed, attendanceSummary.daysPresent,
    gross, otHours, otRate, otAmount,
    epf.employee, epf.employer, socso.employee, socso.employer,
    eis.employee, eis.employer, pcb,
    totalDeductions, netSalary,
    record.unpaid_leave_deduction, record.absent_deduction, record.days_worked, record.net_salary,
    record.gross_salary, record.overtime_hours, record.overtime_amount,
    record.epf_employee, record.socso_employee, record.eis_employee, record.pcb_amount,
    queryClient,
  ]);

  // ─── Realtime: refresh when the staff's attendance / leave / OT changes ─
  useEffect(() => {
    if (!record.user_id) return;
    const channel = supabase
      .channel(`payroll-sync-${record.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_attendance", filter: `user_id=eq.${record.user_id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-attendance-inline", record.user_id, record.month, record.year] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests", filter: `user_id=eq.${record.user_id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-leave-inline", record.user_id, record.month, record.year] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overtime_requests", filter: `user_id=eq.${record.user_id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["approved-ot-inline", record.user_id, record.month, record.year, record.branch_id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [record.id, record.user_id, record.month, record.year, record.branch_id, queryClient]);

  const addCustomItem = (type: "earning" | "deduction") => {
    setCustomItems(prev => [...prev, { id: crypto.randomUUID(), label: "", type, amount: 0 }]);
  };
  const updateCustomItem = (id: string, field: string, value: any) => {
    setCustomItems(prev => prev.map(i => i.id === id ? { ...i, [field]: field === "amount" ? Number(value) || 0 : value } : i));
  };
  const removeCustomItem = (id: string) => {
    setCustomItems(prev => prev.filter(i => i.id !== id));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updated: any = {
        user_id: record.user_id, branch_id: record.branch_id, month: record.month, year: record.year,
        basic_salary: basicPay, allowances: parseFloat(allowances || "0"),
        gross_salary: gross, epf_employee: epf.employee, epf_employer: epf.employer,
        socso_employee: socso.employee, socso_employer: socso.employer,
        eis_employee: eis.employee, eis_employer: eis.employer,
        pcb_amount: pcb, net_salary: netSalary,
        overtime_hours: otHours, overtime_rate: otRate, overtime_amount: otAmount,
        late_deduction: lateDed, advance_deduction: advanceDed, other_deductions: otherDed,
        other_allowances: extraAllowances, claims_amount: claimsAmount,
        unpaid_leave_deduction: unpaidLeaveDed, absent_deduction: absentDed,
        days_worked: attendanceSummary.daysPresent,
        status: "draft", created_by: user!.id,
      };
      const { data: upserted, error } = await supabase.from("payroll_records").upsert(updated, { onConflict: "user_id,month,year" }).select("id").single();
      if (error) throw error;
      const recordId = upserted.id;
      await supabase.from("payroll_custom_items").delete().eq("payroll_record_id", recordId);
      if (customItems.length > 0) {
        const items = customItems.filter(i => i.label.trim()).map(i => ({ payroll_record_id: recordId, label: i.label, type: i.type, amount: i.amount }));
        if (items.length > 0) {
          const { error: itemErr } = await supabase.from("payroll_custom_items").insert(items);
          if (itemErr) throw itemErr;
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Payroll saved", description: `${MONTHS[record.month - 1]} ${record.year} payroll record saved.` });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-custom-items"] });
      onSaved();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isEditable = record.status === "draft" || !record.status;

  return (
    <div className="p-4 bg-muted/30 border-t space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net Payable</p>
            <p className="text-lg font-bold text-primary">{rm(netSalary)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross Salary</p>
            <p className="text-lg font-bold">{rm(gross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deductions</p>
            <p className="text-lg font-bold text-destructive">{rm(totalDeductions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Company Cost</p>
            <p className="text-lg font-bold">{rm(totalEmployerCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 4-Column Calculator */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Column 1: Basic Earning */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Basic Earning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Basic Salary</Label>
              <Input type="number" placeholder="0" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fixed Allowances</Label>
              <Input type="number" placeholder="0" value={allowances} onChange={(e) => setAllowances(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Other Allowances</Label>
              <Input type="number" placeholder="0" value={otherAllowances} onChange={(e) => setOtherAllowances(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            <Separator />
             <div className="space-y-1.5">
              <Label className="text-xs">OT Hours {approvedOT && approvedOT.length > 0 && <Badge variant="secondary" className="ml-1 text-[8px] px-1 py-0">Auto-detected</Badge>}</Label>
              <Input type="number" placeholder="0" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
              {approvedOT && approvedOT.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground">{approvedOT.length} approved OT request(s) totalling {otBreakdown.totalHrs}hrs</p>
                  {otBreakdown.normal > 0 && <p className="text-[10px] text-muted-foreground">Normal: <strong>{otBreakdown.normal}h</strong></p>}
                  {otBreakdown.rest_day > 0 && <p className="text-[10px] text-info">Rest Day: <strong>{otBreakdown.rest_day}h</strong></p>}
                  {otBreakdown.public_holiday > 0 && <p className="text-[10px] text-destructive">Public Holiday: <strong>{otBreakdown.public_holiday}h</strong></p>}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">OT Rate (RM/hr)</Label>
              <Input type="number" placeholder="0" value={overtimeRate} onChange={(e) => setOvertimeRate(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            {otAmount > 0 && (
              <>
                <div className="text-xs font-medium text-primary">OT Amount: <strong>{rm(otAmount)}</strong></div>
              </>
            )}
            {/* Claims moved to Reimbursements section below */}
            {/* Salary Components */}
            {(salaryComponents ?? []).length > 0 && (
              <>
                <Separator />
                <p className="text-xs font-medium text-muted-foreground">Salary Components</p>
                {(salaryComponents ?? []).filter((c: any) => c.type === "earning").map((c: any) => (
                  <div key={c.id} className="flex justify-between text-xs">
                    <span className="flex items-center gap-1">
                      {c.label}
                      {c.is_statutory ? <Badge variant="secondary" className="text-[8px] px-1 py-0">Stat</Badge> : <Badge variant="outline" className="text-[8px] px-1 py-0">Non-Stat</Badge>}
                    </span>
                    <span className="font-medium text-primary">+ {rm(Number(c.amount))}</span>
                  </div>
                ))}
                {(salaryComponents ?? []).filter((c: any) => c.type === "deduction").map((c: any) => (
                  <div key={c.id} className="flex justify-between text-xs">
                    <span>{c.label}</span>
                    <span className="font-medium text-destructive">− {rm(Number(c.amount))}</span>
                  </div>
                ))}
                {compStatutoryEarnings > 0 && <div className="text-[10px] text-muted-foreground">Statutory base includes: {rm(compStatutoryEarnings)}</div>}
              </>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-sm">
              <span>Gross Salary</span>
              <span>{rm(gross)}</span>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div>EPF Base: {rm(epfBase)} <span className="opacity-70">(excludes OT per EPF Act 1991)</span></div>
              <div>SOCSO/EIS Base: {rm(socsoEisBase)} <span className="opacity-70">(includes OT, capped RM6,000)</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Column 2: Additional Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Additional Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customItems.filter(i => i.type === "earning").map((item) => (
              <div key={item.id} className="flex gap-2 items-end">
                <div className="flex-1"><Input placeholder="e.g. Bonus" value={item.label} onChange={(e) => updateCustomItem(item.id, "label", e.target.value)} className="h-8 text-xs" disabled={!isEditable} /></div>
                <div className="w-24"><Input type="number" placeholder="0" value={item.amount || ""} onChange={(e) => updateCustomItem(item.id, "amount", e.target.value)} className="h-8 text-xs" disabled={!isEditable} /></div>
                {isEditable && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeCustomItem(item.id)}><X className="h-3 w-3" /></Button>}
              </div>
            ))}
            {isEditable && <Button variant="outline" size="sm" className="w-full gap-1 text-xs" onClick={() => addCustomItem("earning")}><Plus className="h-3 w-3" /> Add Earning</Button>}

            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Custom Deductions</p>
            {customItems.filter(i => i.type === "deduction").map((item) => (
              <div key={item.id} className="flex gap-2 items-end">
                <div className="flex-1"><Input placeholder="e.g. Advance Salary" value={item.label} onChange={(e) => updateCustomItem(item.id, "label", e.target.value)} className="h-8 text-xs" disabled={!isEditable} /></div>
                <div className="w-24"><Input type="number" placeholder="0" value={item.amount || ""} onChange={(e) => updateCustomItem(item.id, "amount", e.target.value)} className="h-8 text-xs" disabled={!isEditable} /></div>
                {isEditable && <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeCustomItem(item.id)}><X className="h-3 w-3" /></Button>}
              </div>
            ))}
            {isEditable && <Button variant="outline" size="sm" className="w-full gap-1 text-xs" onClick={() => addCustomItem("deduction")}><Plus className="h-3 w-3" /> Add Deduction</Button>}

            {(customEarnings > 0 || customDeductions > 0) && (
              <>
                <Separator />
                {customEarnings > 0 && <div className="flex justify-between text-xs"><span>Total Additional Earnings</span><span className="font-medium text-primary">+ {rm(customEarnings)}</span></div>}
                {customDeductions > 0 && <div className="flex justify-between text-xs"><span>Total Additional Deductions</span><span className="font-medium text-destructive">− {rm(customDeductions)}</span></div>}
              </>
            )}

            {/* Attendance & Leave */}
            <Separator />
            <div className="space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" /> Attendance Summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Present:</span>
                <span className="font-semibold text-success">{attendanceSummary.presentDays}d</span>
                {attendanceSummary.lateDays > 0 && <>
                  <span className="text-muted-foreground">Late:</span>
                  <span className="font-semibold text-warning">{attendanceSummary.lateDays}×</span>
                </>}
                <span className="text-muted-foreground">Public Holiday:</span>
                <span className="font-semibold text-warning">{attendanceSummary.publicHolidayDays}d</span>
                <span className="text-muted-foreground">Reward Holiday:</span>
                <span className="font-semibold text-info">{attendanceSummary.rewardHolidayDays}d</span>
                {attendanceSummary.absentDays > 0 && <>
                  <span className="text-muted-foreground">Absent:</span>
                  <span className="font-semibold text-destructive">{attendanceSummary.absentDays}d</span>
                </>}
                <span className="text-muted-foreground border-t pt-1">Total Paid Days:</span>
                <span className="font-bold text-foreground border-t pt-1">{attendanceSummary.totalPaidDays}d</span>
                <span className="text-muted-foreground">Hours Worked:</span>
                <span className="font-semibold text-foreground">{attendanceSummary.totalHours}h</span>
              </div>
            </div>
            {leaveSummary.total > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Leave</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {leaveSummary.annualDays > 0 && <span>Annual: {leaveSummary.annualDays}d</span>}
                  {leaveSummary.medicalDays > 0 && <span>Medical: {leaveSummary.medicalDays}d</span>}
                  {leaveSummary.unpaidDays > 0 && <span className="text-destructive">Unpaid: {leaveSummary.unpaidDays}d</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Deductions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Deductions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>
                EPF (KWSP) {!epfEnabled && "Disabled"}
                {customEpfRate != null && epfEnabled && <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Custom</Badge>}
                {!epfEnabled && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">Off</Badge>}
              </span>
              <span className="font-medium">{rm(epf.employee)}</span>
            </div>
            <div className="flex justify-between items-start text-xs rounded-md bg-muted/40 px-2 py-1.5">
              <span className="flex flex-col leading-tight">
                <span className="font-medium">
                  {perlindunganActive ? "SOCSO + Perlindungan 24 Jam" : "SOCSO"}
                </span>
                {!socsoEnabled && <span className="text-[10px] text-muted-foreground">Disabled</span>}
                {customSocsoRate != null && socsoEnabled && <Badge variant="secondary" className="mt-0.5 w-fit text-[9px] px-1 py-0">Custom</Badge>}
                {!socsoEnabled && <Badge variant="outline" className="mt-0.5 w-fit text-[9px] px-1 py-0">Off</Badge>}
              </span>
              <span className="font-semibold">{rm(socso.employee)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>
                EIS {!eisEnabled && "Disabled"}
                {customEisRate != null && eisEnabled && <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Custom</Badge>}
                {!eisEnabled && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0">Off</Badge>}
              </span>
              <span className="font-medium">{rm(eis.employee)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>PCB (Monthly Tax)</span>
              <span className="font-medium">{rm(pcb)}</span>
            </div>
            {unpaidLeaveDed > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Unpaid Leave ({leaveSummary.unpaidDays}d)</span>
                <span className="font-medium">{rm(unpaidLeaveDed)}</span>
              </div>
            )}
            {absentDed > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Absent ({absentDays}d)</span>
                <span className="font-medium">{rm(absentDed)}</span>
              </div>
            )}
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-xs">Late Deduction</Label>
              <Input type="number" placeholder="0" value={lateDeduction} onChange={(e) => setLateDeduction(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Advance Deduction</Label>
              <Input type="number" placeholder="0" value={advanceDeduction} onChange={(e) => setAdvanceDeduction(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Other Deductions</Label>
              <Input type="number" placeholder="0" value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} className="h-8 text-xs" disabled={!isEditable} />
            </div>
            {customDeductions > 0 && <div className="flex justify-between text-xs text-destructive"><span>Custom Deductions</span><span className="font-medium">{rm(customDeductions)}</span></div>}
            {compDeductions > 0 && <div className="flex justify-between text-xs text-destructive"><span>Salary Component Deductions</span><span className="font-medium">{rm(compDeductions)}</span></div>}
            <Separator />
            <div className="flex justify-between font-semibold text-sm">
              <span>Total Deductions</span>
              <span className="text-destructive">{rm(totalDeductions)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Column 4: Company Contribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Contribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>EPF (KWSP)</span>
              <span className="font-medium">{rm(epf.employer)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>SOCSO</span>
              <span className="font-medium">{rm(socso.employer)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>EIS</span>
              <span className="font-medium">{rm(eis.employer)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-sm">
              <span>Total Contribution</span>
              <span>{rm(totalEmployerContrib)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-sm">
              <span>Total Cost to Company</span>
              <span>{rm(totalEmployerCost)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reimbursements Summary */}
      {claimsAmount > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Receipt className="h-4 w-4 text-primary" />
                <span>Claims Reimbursement (non-taxable)</span>
              </div>
              <span className="text-sm font-bold text-primary">+ {rm(claimsAmount)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Claims are added to net salary but excluded from gross (Malaysian HR standard — non-taxable reimbursement)</p>
          </CardContent>
        </Card>
      )}

      {/* Save & Print Buttons */}
      <div className="flex gap-2">
        {isEditable && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        )}
        <Button variant="outline" className="gap-2" onClick={async () => {
          const branch = branches?.find((b: any) => b.id === record.branch_id);
          const ytd = (ytdRecords ?? []);
          // Fetch early-paid claims for reference
          const mStart = format(new Date(record.year, record.month - 1, 1), "yyyy-MM-dd");
          const mEnd = format(endOfMonth(new Date(record.year, record.month - 1, 1)), "yyyy-MM-dd");
          const { data: earlyClaims } = await supabase.from("staff_claims").select("amount, paid_at").eq("user_id", record.user_id).eq("paid_via", "early_payment").eq("level2_status", "approved").or(`and(payroll_month.eq.${record.month},payroll_year.eq.${record.year}),and(payroll_month.is.null,claim_date.gte.${mStart},claim_date.lte.${mEnd})`);
          const earlyTotal = (earlyClaims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
          const earlyDate = earlyClaims?.[0]?.paid_at ? format(new Date(earlyClaims[0].paid_at), "dd/MM/yyyy") : undefined;
          onPrint({
            staffName: `${record.profiles?.first_name || ""} ${record.profiles?.last_name || ""}`.trim(),
            staffEmail: record.profiles?.email || "", branchName: branch?.name || "",
            staffIc: (staffProfile as any)?.ic_number || "",
            staffId: (staffDesignation as any)?.custom_designation || (staffDesignation as any)?.designation || "",
            designation: (staffDesignation as any)?.custom_designation || (staffDesignation as any)?.designation || "",
            epfNumber: (staffProfile as any)?.epf_number || "",
            socsoNumber: (staffProfile as any)?.socso_number || "",
            companyRegNo: branchSettings?.business_registration_no || "",
            companyAddress: branchSettings?.address_line || "",
            companyPhone: branchSettings?.phone || "",
            companyEmail: branchSettings?.email || "",
            month: record.month, year: record.year, basicSalary: basicPay,
            allowances: parseFloat(allowances || "0"), otherAllowances: extraAllowances,
            overtimeHours: otHours, overtimeRate: otRate, overtimeAmount: otAmount,
            grossSalary: gross, epfEmployee: epf.employee, epfEmployer: epf.employer,
            socsoEmployee: socso.employee, socsoEmployer: socso.employer,
            eisEmployee: eis.employee, eisEmployer: eis.employer, pcbAmount: pcb,
            lateDeduction: lateDed, unpaidLeaveDeduction: unpaidLeaveDed,
            absentDeduction: absentDed,
            absentDays: absentDays,
            unpaidLeaveDays: leaveSummary.unpaidDays,
            advanceDeduction: advanceDed, otherDeductions: otherDed,
            claimsAmount, netSalary, status: record.status || "draft",
            earlyPaidClaimsAmount: earlyTotal > 0 ? earlyTotal : undefined,
            earlyPaidClaimsDate: earlyDate,
            extraEarnings: [
              ...((salaryComponents ?? [])
                .filter((c: any) => c.type === "earning")
                .map((c: any) => ({ label: c.label || c.name || "Allowance", amount: Number(c.amount) || 0 }))),
              ...customItems
                .filter((c) => c.type === "earning")
                .map((c) => ({ label: c.label || "Custom Earning", amount: Number(c.amount) || 0 })),
            ],
            extraDeductions: [
              ...((salaryComponents ?? [])
                .filter((c: any) => c.type === "deduction")
                .map((c: any) => ({ label: c.label || c.name || "Deduction", amount: Number(c.amount) || 0 }))),
              ...customItems
                .filter((c) => c.type === "deduction")
                .map((c) => ({ label: c.label || "Custom Deduction", amount: Number(c.amount) || 0 })),
            ],
            logoUrl: branchSettings?.logo_url || "",
            schoolName: branchSettings?.school_display_name || "",
            ytdGross: ytd.reduce((s: number, r: any) => s + Number(r.gross_salary), 0),
            ytdEpfEmployee: ytd.reduce((s: number, r: any) => s + Number(r.epf_employee), 0),
            ytdSocsoEmployee: ytd.reduce((s: number, r: any) => s + Number(r.socso_employee), 0),
            ytdEisEmployee: ytd.reduce((s: number, r: any) => s + Number(r.eis_employee), 0),
            ytdPcb: ytd.reduce((s: number, r: any) => s + Number(r.pcb_amount), 0),
            ytdNet: ytd.reduce((s: number, r: any) => s + Number(r.net_salary), 0),
          });
        }}>
          <Printer className="h-4 w-4" /> Print Payslip
        </Button>
      </div>
    </div>
  );
}

// ─── Main Payroll Page ────────────────────────────────────────────
export default function Payroll() {
  const { user, role, allowedRoutes, managedRoutes } = useAuth();
  const queryClient = useQueryClient();
  const isRestrictedAdmin = role === "admin" && allowedRoutes.length > 0 && !managedRoutes.includes("/payroll");
  const canManage = (role === "super_admin" || role === "franchisee" || role === "admin") && !isRestrictedAdmin;
  const isSuperAdmin = role === "super_admin";

  const { selectedBranchId, activeBranchIds, branches } = useGlobalBranch();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const payslipRef = useRef<HTMLDivElement>(null);
  const [selectiveGenerating, setSelectiveGenerating] = useState(false);
  const [selectiveProgress, setSelectiveProgress] = useState(0);
  // Post-run summary so HR can see WHY staff were skipped and fix it
  const [skipReportOpen, setSkipReportOpen] = useState(false);
  const [skipReport, setSkipReport] = useState<{ success: number; skipped: { id: string; name: string; reason: string }[] }>({ success: 0, skipped: [] });
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "detail">("overview");
  const [detailMonth, setDetailMonth] = useState<number | null>(null);
  // Reverse dialog
  const [reverseTarget, setReverseTarget] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [showRunPayrollDialog, setShowRunPayrollDialog] = useState(false);
  const [payrollDate, setPayrollDate] = useState<Date | undefined>(undefined);
  const [payrollRemarks, setPayrollRemarks] = useState("");
  const [includeClaims, setIncludeClaims] = useState(true);
  const [includeOvertime, setIncludeOvertime] = useState(true);
  const [includeUnpaidLeave, setIncludeUnpaidLeave] = useState(true);
  const [includeLateness, setIncludeLateness] = useState(true);
  const [payrollMode, setPayrollMode] = useState<"all" | "selective">("all");
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffSearch, setStaffSearch] = useState("");

  const handlePrintPayslip = useCallback((data: PayslipData) => {
    setPayslipData(data);
    setTimeout(() => window.print(), 200);
  }, []);

  const selectedBranch = selectedBranchId !== "all" ? selectedBranchId : activeBranchIds[0] || "";

  // Branch settings for company info on payslips
  const { data: mainBranchSettings } = useQuery({
    queryKey: ["main-branch-settings", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("logo_url, school_display_name, business_registration_no, address_line, phone, email").eq("branch_id", selectedBranch).maybeSingle();
      return data;
    },
    enabled: !!selectedBranch,
  });

  // Approval settings for selected branch
  const { data: approvalSettings } = useApprovalSettings(selectedBranch || null);

  const monthStart = format(new Date(year, month - 1, 1), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(year, month - 1, 1)), "yyyy-MM-dd");

  const { data: staffList } = useQuery({
    queryKey: ["branch-staff", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("user_id").eq("branch_id", selectedBranch);
      const userIds = [...new Set((data ?? []).map((m: any) => m.user_id))];
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
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", staffUserIds);
      const { data: spData } = await supabase.from("staff_profiles").select("user_id, employment_status, basic_salary, last_working_date, resignation_date").in("user_id", staffUserIds);
      const spMap = new Map((spData ?? []).map((sp: any) => [sp.user_id, sp]));
      // Payroll month cutoff: include resigned/terminated staff whose last
      // working day falls on or after the first day of the selected payroll
      // month so their final pay can still be processed.
      const periodStart = new Date(year, month - 1, 1);
      return (profiles ?? []).filter((p: any) => isEligibleForPayrollMonth(spMap.get(p.id), periodStart));
    },
    enabled: !!selectedBranch && canManage,
  });

  const { data: staffProfilesForDialog = [] } = useQuery({
    queryKey: ["staff-profiles-dialog", selectedBranch, month, year],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("user_id").eq("branch_id", selectedBranch);
      const userIds = [...new Set((data ?? []).map((m: any) => m.user_id))];
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
      const { data: excludeData } = await supabase.from("staff_profiles").select("user_id, exclude_from_payroll").in("user_id", staffUserIds);
      const excludeSet = new Set((excludeData ?? []).filter((sp: any) => sp.exclude_from_payroll === true).map((sp: any) => sp.user_id));
      const finalIds = staffUserIds.filter(uid => !excludeSet.has(uid));
      if (finalIds.length === 0) return [];
      const [{ data: profiles }, { data: spData }, { data: desigData }, { data: existingRecords }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, email").in("id", finalIds),
        supabase.from("staff_profiles").select("user_id, employment_status, basic_salary, last_working_date, resignation_date").in("user_id", finalIds),
        supabase.from("staff_designations").select("user_id, designation, custom_designation").in("user_id", finalIds),
        supabase.from("payroll_records").select("user_id").eq("month", month).eq("year", year).eq("branch_id", selectedBranch),
      ]);
      const spMap = new Map((spData ?? []).map((sp: any) => [sp.user_id, sp]));
      const desigMap = new Map((desigData ?? []).map((d: any) => [d.user_id, d]));
      const existingSet = new Set((existingRecords ?? []).map((r: any) => r.user_id));
      const periodStart = new Date(year, month - 1, 1);
      return (profiles ?? [])
        .filter((p: any) => isEligibleForPayrollMonth(spMap.get(p.id), periodStart))
        .map((p: any) => ({
          ...p,
          basic_salary: spMap.get(p.id)?.basic_salary || 0,
          designation: desigMap.get(p.id)?.custom_designation || desigMap.get(p.id)?.designation || "",
          hasRecord: existingSet.has(p.id),
        }));
    },
    enabled: !!selectedBranch && canManage && showRunPayrollDialog,
  });

  const { data: payrollRecords } = useQuery({
    queryKey: ["payroll-history", selectedBranch, month, year],
    queryFn: async () => {
      let query = supabase.from("payroll_records").select("*").eq("month", month).eq("year", year).order("created_at", { ascending: false });
      if (selectedBranch) query = query.eq("branch_id", selectedBranch);
      const { data } = await query;
      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const { data: profiles } = userIds.length > 0 ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds) : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((r: any) => ({ ...r, profiles: profileMap.get(r.user_id) || null }));
    },
    enabled: !!user && (!!selectedBranch || role === "super_admin"),
  });

  // Yearly data for summary tab + overview + reports
  const { data: payrollYearly } = useQuery({
    queryKey: ["payroll-yearly", selectedBranch, year],
    queryFn: async () => {
      let query = supabase.from("payroll_records").select("*").eq("year", year).order("month", { ascending: false });
      if (selectedBranch) query = query.eq("branch_id", selectedBranch);
      const { data } = await query;
      if (!data || data.length === 0) return [];
      const userIds = [...new Set(data.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return data.map((r: any) => ({ ...r, profiles: profileMap.get(r.user_id) || null }));
    },
    enabled: !!user && (!!selectedBranch || role === "super_admin"),
  });

  const payrollApprovalEnabled = approvalSettings?.payroll_l2_enabled ?? false;

  const confirmMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from("payroll_records").update({ status: "confirmed" }).eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Payroll confirmed" }); queryClient.invalidateQueries({ queryKey: ["payroll-history"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from("payroll_records").update({
        status: "pending_approval",
        submitted_by: user!.id,
        submitted_at: new Date().toISOString(),
      } as any).eq("id", record.id);
      if (error) throw error;
      const staffName = record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : "a staff member";
      if (selectedBranch) {
        await notifyAndEmailWorkflowApprovers({
          submitterUserId: record.user_id,
          branchId: selectedBranch,
          workflow: "payroll",
          title: "Payroll Pending Approval",
          message: `Payroll for ${staffName} (${MONTHS[record.month - 1]} ${record.year}) is pending your approval.`,
          type: "payroll",
          actionUrl: "/payroll",
          referenceId: record.id,
          groupKey: `payroll-approval-${record.id}`,
          priority: "high",
          requesterName: staffName,
          requestType: "Payroll",
          summary: `${MONTHS[record.month - 1]} ${record.year} • Net RM ${Number(record.net_salary).toFixed(2)}`,
          details: [
            { label: "Period", value: `${MONTHS[record.month - 1]} ${record.year}` },
            { label: "Net salary", value: `RM ${Number(record.net_salary).toFixed(2)}` },
          ],
          emailIdempotencyKey: `payroll-approval-${record.id}`,
        });
      }
    },
    onSuccess: () => { toast({ title: "Submitted for approval" }); queryClient.invalidateQueries({ queryKey: ["payroll-history"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approvePayrollMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from("payroll_records").update({
        status: "approved",
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
      } as any).eq("id", record.id);
      if (error) throw error;
      await notifyAndEmailSubmitterDecision({
        submitterUserId: record.user_id,
        title: "Payroll Approved",
        message: `Your payroll for ${MONTHS[record.month - 1]} ${record.year} has been approved. Net salary: RM ${Number(record.net_salary).toFixed(2)}.`,
        type: "payroll",
        actionUrl: "/my-payslips",
        referenceId: record.id,
        templateName: "payslip-published",
        templateData: {
          period: `${MONTHS[record.month - 1]} ${record.year}`,
          netSalary: Number(record.net_salary).toFixed(2),
          currency: "RM",
        },
        emailIdempotencyKey: `payroll-approved-${record.id}`,
      });
    },
    onSuccess: () => { toast({ title: "Payroll approved" }); queryClient.invalidateQueries({ queryKey: ["payroll-history"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectPayrollMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from("payroll_records").update({ status: "draft" } as any).eq("id", record.id);
      if (error) throw error;
      // Notify the original submitter (HR admin) — NOT the staff member
      if (record.submitted_by && record.submitted_by !== user!.id) {
        await notifyUsers([record.submitted_by], "Payroll Rejected", `Payroll for ${record.profiles?.first_name ?? "staff"} (${MONTHS[record.month - 1]} ${record.year}) was rejected and returned to draft.`, "payroll", record.id, "/payroll");
      }
      // Notify all branch approvers
      if (selectedBranch) {
        const staffName = record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : "staff";
        await notifyBranchApprovers(selectedBranch, user!.id, "Payroll Rejected", `Payroll for ${staffName} (${MONTHS[record.month - 1]} ${record.year}) was rejected and returned to draft.`, "payroll", "/payroll", record.id, `payroll-reject-${record.id}`);
      }
    },
    onSuccess: () => { toast({ title: "Payroll rejected — returned to draft" }); queryClient.invalidateQueries({ queryKey: ["payroll-history"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (record: any) => {
      const { error } = await supabase.from("payroll_records").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", record.id);
      if (error) throw error;
      await supabase.from("notifications").insert({ user_id: record.user_id, title: "Salary Paid", message: `Your salary for ${MONTHS[record.month - 1]} ${record.year} has been paid. Net amount: RM ${Number(record.net_salary).toFixed(2)}.`, type: "payroll", reference_id: record.id, action_url: "/my-payslips" });
      const staffName = record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : "a staff member";
      if (selectedBranch) {
        await notifyBranchApprovers(selectedBranch, user!.id, "Payroll Payment Completed", `Salary for ${staffName} (${MONTHS[record.month - 1]} ${record.year}) has been marked as paid.`, "payroll", "/payroll", record.id, `payroll-paid-${record.id}`);
      }
    },
    onSuccess: () => { toast({ title: "Marked as paid" }); queryClient.invalidateQueries({ queryKey: ["payroll-history"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from("payroll_records").delete().eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Record deleted", description: "Draft payroll record has been deleted." });
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
      setExpandedRecordId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ record, reason }: { record: any; reason: string }) => {
      const { error } = await supabase.from("payroll_records").update({ status: "reversed", reversed_at: new Date().toISOString(), reversed_by: user!.id, reversal_reason: reason }).eq("id", record.id);
      if (error) throw error;
      await supabase.from("notifications").insert({ user_id: record.user_id, title: "Payroll Reversed", message: `Your payroll for ${MONTHS[record.month - 1]} ${record.year} has been reversed. Reason: ${reason}`, type: "payroll", reference_id: record.id, action_url: "/my-payslips" });
      await supabase.from("audit_logs").insert({ actor_id: user!.id, action: "reverse_payroll", target_type: "payroll_records", target_id: record.id, target_label: `${record.profiles?.first_name} ${record.profiles?.last_name} — ${MONTHS[record.month - 1]} ${record.year}`, metadata: { reason, net_salary: record.net_salary } });
    },
    onSuccess: () => {
      toast({ title: "Payroll reversed", description: "The record has been reversed and staff notified." });
      setReverseTarget(null);
      setReverseReason("");
      queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Batch Generate ──────────────────────────────────────
  const handleBatchGenerate = async () => {
    if (!staffList?.length || !selectedBranch) return;
    setBatchGenerating(true); setBatchProgress(0);
    // Fetch cutoff policy for claims/OT cross-month inclusion
    const { data: cutoffPolicyData } = await supabase.from("hr_policies").select("policy_data").eq("branch_id", selectedBranch).eq("policy_type", "payroll_cutoff").maybeSingle();
    const cutoff = cutoffPolicyData?.policy_data as any;
    const cutoffEnabled = cutoff?.enabled === true;
    // Cutoff = submission deadline (created_at), NOT activity date extension
    // Activity date must be within the payroll month; created_at can extend to cutoff day in next month
    const claimCutoffTimestamp = cutoffEnabled && cutoff?.claim_cutoff_day
      ? format(new Date(year, month, cutoff.claim_cutoff_day), "yyyy-MM-dd") + "T23:59:59"
      : null;
    const otCutoffTimestamp = cutoffEnabled && cutoff?.ot_cutoff_day
      ? format(new Date(year, month, cutoff.ot_cutoff_day), "yyyy-MM-dd") + "T23:59:59"
      : null;
    // Fetch holidays for the month once
    const { data: batchHolidays } = await supabase.from("branch_events").select("event_date, end_date, affects_attendance").eq("branch_id", selectedBranch).eq("affects_attendance", true).gte("event_date", monthStart).lte("event_date", monthEnd);
    const batchYearIds = await getBranchAcademicYearIds(selectedBranch);
    const { data: batchSchoolHols } = await supabase.from("school_holidays").select("event_date, end_date, event_type, is_public_holiday, affects_attendance").in("academic_year_id", batchYearIds).lte("event_date", monthEnd).gte("event_date", monthStart);
    const paidHolidayDates = new Set<string>();
    (batchHolidays ?? []).forEach((e: any) => {
      const dates = e.end_date ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [e.event_date];
      dates.forEach(ds => paidHolidayDates.add(ds));
    });
    (batchSchoolHols ?? []).filter(isPaidClosure).forEach((h: any) => {
      const dates = h.end_date ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [h.event_date];
      dates.forEach(ds => paidHolidayDates.add(ds));
    });
    // Count holidays that fall on weekdays
    const holidayWorkDays = [...paidHolidayDates].filter(ds => { const dow = getDay(parseISO(ds)); return dow !== 0 && dow !== 6; }).length;
    let success = 0, failed = 0;
    const skipped: { id: string; name: string; reason: string }[] = [];
    for (let i = 0; i < staffList.length; i++) {
      const staff = staffList[i];
      try {
        const { data: profile } = await supabase.from("staff_profiles").select("basic_salary, custom_epf_rate, custom_socso_rate, custom_eis_rate, overtime_rate, epf_enabled, socso_enabled, eis_enabled").eq("user_id", staff.id).maybeSingle();
        const staffBasic = profile?.basic_salary || 0;
        if (staffBasic <= 0) {
          failed++;
          skipped.push({ id: staff.id, name: `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || staff.email || "Staff", reason: profile ? "Basic salary is 0 — set a salary on the staff profile" : "No staff profile / salary set" });
          continue;
        }
        // Fetch salary components
        const { data: salComps } = await supabase.from("staff_salary_components" as any).select("*").eq("user_id", staff.id).eq("is_active", true);
        const compStatEarnings = (salComps ?? []).filter((c: any) => c.type === "earning" && c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
        const compNonStatEarnings = (salComps ?? []).filter((c: any) => c.type === "earning" && !c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
        const compDeds = (salComps ?? []).filter((c: any) => c.type === "deduction").reduce((s: number, c: any) => s + Number(c.amount), 0);
        const { data: att } = await supabase.from("staff_attendance").select("clock_in, clock_out, date").eq("user_id", staff.id).gte("date", monthStart).lte("date", monthEnd);
        const { data: leave } = await supabase.from("leave_requests").select("leave_type, days").eq("user_id", staff.id).eq("status", "approved").gte("start_date", monthStart).lte("start_date", monthEnd);
        const unpaidDays = includeUnpaidLeave ? (leave ?? []).filter((l: any) => l.leave_type === "unpaid").reduce((s: number, l: any) => s + l.days, 0) : 0;
        // OT: include current month + next month up to cutoff day if enabled
        let otQuery = includeOvertime
          ? supabase
              .from("overtime_requests")
              .select("hours, overtime_type, is_late_submission, payroll_month")
              .eq("user_id", staff.id)
              .in("status", ["approved", "pending_payroll", "assigned_next_payroll"])
              .or(`payroll_month.eq.${monthStart},and(payroll_month.is.null,date.gte.${monthStart},date.lte.${monthEnd})`)
          : null;
        if (otQuery && otCutoffTimestamp) otQuery = otQuery.lte("created_at", otCutoffTimestamp);
        const { data: ot } = otQuery ? await otQuery : { data: [] };
        // Calculate OT with correct multipliers per type
        const hourlyRate = staffBasic > 0 ? staffBasic / 26 / 8 : 0;
        let staffOtAmount = 0;
        let totalOtHours = 0;
        if (includeOvertime) {
          (ot ?? []).forEach((r: any) => {
            const hrs = Number(r.hours || 0);
            totalOtHours += hrs;
            const otType = r.overtime_type || "normal";
            const multiplier = otType === "public_holiday" ? 3.0 : otType === "rest_day" ? 2.0 : 1.5;
            staffOtAmount += hrs * hourlyRate * multiplier;
          });
          staffOtAmount = Math.round(staffOtAmount * 100) / 100;
        }
        const staffOtRate = totalOtHours > 0 ? Math.round((staffOtAmount / totalOtHours) * 100) / 100 : 0;
        // Claims: query by assigned payroll_month/year OR fallback to claim_date range when NULL — include ALL approved claims
        const { data: claims } = includeClaims
          ? await supabase.from("staff_claims").select("amount, paid_via").eq("user_id", staff.id).eq("level2_status", "approved").or(`and(payroll_month.eq.${month},payroll_year.eq.${year}),and(payroll_month.is.null,claim_date.gte.${monthStart},claim_date.lte.${monthEnd})`)
          : { data: [] };
        const totalClaimsAmt = includeClaims ? (claims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0) : 0;
        // Early-paid claims: already disbursed mid-month, must be recovered in payroll
        const earlyPaidAmt = includeClaims ? (claims ?? []).filter((c: any) => c.paid_via === "early_payment").reduce((s: number, c: any) => s + Number(c.amount), 0) : 0;
        const staffStatGross = staffBasic + compStatEarnings + staffOtAmount;
        const staffGross = staffStatGross + compNonStatEarnings;
        const bEpfEnabled = (profile as any)?.epf_enabled !== false;
        const bSocsoEnabled = (profile as any)?.socso_enabled !== false;
        const bEisEnabled = (profile as any)?.eis_enabled !== false;
        const staffEpfRaw = calcEPF(staffStatGross, profile?.custom_epf_rate);
        const staffSocsoRaw = calcSOCSO(staffStatGross, profile?.custom_socso_rate, year, month);
        const staffEisRaw = calcEIS(staffStatGross, profile?.custom_eis_rate);
        const staffEpf = bEpfEnabled ? staffEpfRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffSocso = bSocsoEnabled ? staffSocsoRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffEis = bEisEnabled ? staffEisRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffPcb = calcPCB(staffStatGross, staffEpf.employee);
        const staffUnpaidDed = calcUnpaidLeaveDeduction(staffBasic, unpaidDays);
        const lateDeduction = includeLateness ? 0 : 0; // Late deduction placeholder - respects toggle
        const staffTotalDed = staffEpf.employee + staffSocso.employee + staffEis.employee + staffPcb + staffUnpaidDed + compDeds + lateDeduction;
        const staffNet = staffGross - staffTotalDed + totalClaimsAmt - earlyPaidAmt;
        await supabase.from("payroll_records").upsert({
          user_id: staff.id, branch_id: selectedBranch, month, year,
          basic_salary: staffBasic, allowances: compStatEarnings, gross_salary: staffGross,
          epf_employee: staffEpf.employee, epf_employer: staffEpf.employer,
          socso_employee: staffSocso.employee, socso_employer: staffSocso.employer,
          eis_employee: staffEis.employee, eis_employer: staffEis.employer,
          pcb_amount: staffPcb, net_salary: staffNet,
          overtime_hours: totalOtHours, overtime_rate: staffOtRate, overtime_amount: staffOtAmount,
          late_deduction: 0, advance_deduction: 0, other_deductions: compDeds, other_allowances: compNonStatEarnings,
          claims_amount: totalClaimsAmt, unpaid_leave_deduction: staffUnpaidDed,
          days_worked: (att?.length ?? 0) + holidayWorkDays, status: "draft", created_by: user!.id,
        }, { onConflict: "user_id,month,year" });
        success++;
      } catch (err: any) {
        failed++;
        skipped.push({ id: staff.id, name: `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || staff.email || "Staff", reason: err?.message || "Unexpected error during generation" });
      }
      setBatchProgress(Math.round(((i + 1) / staffList.length) * 100));
    }
    setBatchGenerating(false);
    queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    if (failed > 0) {
      setSkipReport({ success, skipped });
      setSkipReportOpen(true);
    } else {
      toast({ title: "Batch generation complete", description: `${success} payslips generated.` });
    }
  };

  const handleSelectiveGenerate = async (selectedIds: string[]) => {
    if (!selectedIds.length || !selectedBranch) return;
    setSelectiveGenerating(true); setSelectiveProgress(0);
    // Fetch cutoff policy for claims/OT submission deadline
    const { data: selCutoffData } = await supabase.from("hr_policies").select("policy_data").eq("branch_id", selectedBranch).eq("policy_type", "payroll_cutoff").maybeSingle();
    const selCutoff = selCutoffData?.policy_data as any;
    const selCutoffEnabled = selCutoff?.enabled === true;
    const selClaimCutoffTs = selCutoffEnabled && selCutoff?.claim_cutoff_day
      ? format(new Date(year, month, selCutoff.claim_cutoff_day), "yyyy-MM-dd") + "T23:59:59" : null;
    const selOtCutoffTs = selCutoffEnabled && selCutoff?.ot_cutoff_day
      ? format(new Date(year, month, selCutoff.ot_cutoff_day), "yyyy-MM-dd") + "T23:59:59" : null;
    // Fetch holidays for the month
    const { data: selHolidays } = await supabase.from("branch_events").select("event_date, end_date, affects_attendance").eq("branch_id", selectedBranch).eq("affects_attendance", true).gte("event_date", monthStart).lte("event_date", monthEnd);
    const selYearIds = await getBranchAcademicYearIds(selectedBranch);
    const { data: selSchoolHols } = await supabase.from("school_holidays").select("event_date, end_date, event_type, is_public_holiday, affects_attendance").in("academic_year_id", selYearIds).lte("event_date", monthEnd).gte("event_date", monthStart);
    const selPaidHolidayDates = new Set<string>();
    (selHolidays ?? []).forEach((e: any) => {
      const dates = e.end_date ? eachDayOfInterval({ start: parseISO(e.event_date), end: parseISO(e.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [e.event_date];
      dates.forEach(ds => selPaidHolidayDates.add(ds));
    });
    (selSchoolHols ?? []).filter(isPaidClosure).forEach((h: any) => {
      const dates = h.end_date ? eachDayOfInterval({ start: parseISO(h.event_date), end: parseISO(h.end_date) }).map(d => format(d, "yyyy-MM-dd")) : [h.event_date];
      dates.forEach(ds => selPaidHolidayDates.add(ds));
    });
    const selHolidayWorkDays = [...selPaidHolidayDates].filter(ds => { const dow = getDay(parseISO(ds)); return dow !== 0 && dow !== 6; }).length;
    let success = 0, failed = 0;
    const skipped: { id: string; name: string; reason: string }[] = [];
    // Build a quick name lookup from the dialog data
    const nameLookup = new Map<string, string>(
      (staffProfilesForDialog as any[]).map((s: any) => [s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email || "Staff"])
    );
    for (let i = 0; i < selectedIds.length; i++) {
      const staffId = selectedIds[i];
      try {
        const { data: profile } = await supabase.from("staff_profiles").select("basic_salary, custom_epf_rate, custom_socso_rate, custom_eis_rate, overtime_rate, epf_enabled, socso_enabled, eis_enabled").eq("user_id", staffId).maybeSingle();
        const staffBasic = profile?.basic_salary || 0;
        if (staffBasic <= 0) {
          failed++;
          skipped.push({ id: staffId, name: nameLookup.get(staffId) || "Staff", reason: profile ? "Basic salary is 0 — set a salary on the staff profile" : "No staff profile / salary set" });
          continue;
        }
        const { data: salComps } = await supabase.from("staff_salary_components" as any).select("*").eq("user_id", staffId).eq("is_active", true);
        const compStatEarnings = (salComps ?? []).filter((c: any) => c.type === "earning" && c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
        const compNonStatEarnings = (salComps ?? []).filter((c: any) => c.type === "earning" && !c.is_statutory).reduce((s: number, c: any) => s + Number(c.amount), 0);
        const compDeds = (salComps ?? []).filter((c: any) => c.type === "deduction").reduce((s: number, c: any) => s + Number(c.amount), 0);
        const { data: att } = await supabase.from("staff_attendance").select("clock_in, clock_out, date").eq("user_id", staffId).gte("date", monthStart).lte("date", monthEnd);
        const { data: leave } = await supabase.from("leave_requests").select("leave_type, days").eq("user_id", staffId).eq("status", "approved").gte("start_date", monthStart).lte("start_date", monthEnd);
        const unpaidDays = includeUnpaidLeave ? (leave ?? []).filter((l: any) => l.leave_type === "unpaid").reduce((s: number, l: any) => s + l.days, 0) : 0;
        let selOtQuery = includeOvertime
          ? supabase
              .from("overtime_requests")
              .select("hours, overtime_type, is_late_submission, payroll_month")
              .eq("user_id", staffId)
              .in("status", ["approved", "pending_payroll", "assigned_next_payroll"])
              .or(`payroll_month.eq.${monthStart},and(payroll_month.is.null,date.gte.${monthStart},date.lte.${monthEnd})`)
          : null;
        if (selOtQuery && selOtCutoffTs) selOtQuery = selOtQuery.lte("created_at", selOtCutoffTs);
        const { data: ot } = selOtQuery ? await selOtQuery : { data: [] };
        const selHourlyRate = staffBasic > 0 ? staffBasic / 26 / 8 : 0;
        let staffOtAmount = 0;
        let totalOtHours = 0;
        if (includeOvertime) {
          (ot ?? []).forEach((r: any) => {
            const hrs = Number(r.hours || 0);
            totalOtHours += hrs;
            const otType = r.overtime_type || "normal";
            const multiplier = otType === "public_holiday" ? 3.0 : otType === "rest_day" ? 2.0 : 1.5;
            staffOtAmount += hrs * selHourlyRate * multiplier;
          });
          staffOtAmount = Math.round(staffOtAmount * 100) / 100;
        }
        const staffOtRate = totalOtHours > 0 ? Math.round((staffOtAmount / totalOtHours) * 100) / 100 : 0;
        // Claims: query by assigned payroll_month/year OR fallback to claim_date range when NULL — include ALL approved claims
        const { data: claims } = includeClaims
          ? await supabase.from("staff_claims").select("amount, paid_via").eq("user_id", staffId).eq("level2_status", "approved").or(`and(payroll_month.eq.${month},payroll_year.eq.${year}),and(payroll_month.is.null,claim_date.gte.${monthStart},claim_date.lte.${monthEnd})`)
          : { data: [] };
        const totalClaimsAmt = includeClaims ? (claims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0) : 0;
        // Early-paid claims: already disbursed mid-month, must be recovered in payroll
        const earlyPaidAmt = includeClaims ? (claims ?? []).filter((c: any) => c.paid_via === "early_payment").reduce((s: number, c: any) => s + Number(c.amount), 0) : 0;
        const staffStatGross = staffBasic + compStatEarnings + staffOtAmount;
        const staffGross = staffStatGross + compNonStatEarnings;
        const sEpfEnabled = (profile as any)?.epf_enabled !== false;
        const sSocsoEnabled = (profile as any)?.socso_enabled !== false;
        const sEisEnabled = (profile as any)?.eis_enabled !== false;
        const staffEpfRaw = calcEPF(staffStatGross, profile?.custom_epf_rate);
        const staffSocsoRaw = calcSOCSO(staffStatGross, profile?.custom_socso_rate, year, month);
        const staffEisRaw = calcEIS(staffStatGross, profile?.custom_eis_rate);
        const staffEpf = sEpfEnabled ? staffEpfRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffSocso = sSocsoEnabled ? staffSocsoRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffEis = sEisEnabled ? staffEisRaw : { employee: 0, employer: 0, employeeRate: 0 };
        const staffPcb = calcPCB(staffStatGross, staffEpf.employee);
        const staffUnpaidDed = calcUnpaidLeaveDeduction(staffBasic, unpaidDays);
        const lateDeduction = includeLateness ? 0 : 0;
        const staffTotalDed = staffEpf.employee + staffSocso.employee + staffEis.employee + staffPcb + staffUnpaidDed + compDeds + lateDeduction;
        const staffNet = staffGross - staffTotalDed + totalClaimsAmt - earlyPaidAmt;
        await supabase.from("payroll_records").upsert({
          user_id: staffId, branch_id: selectedBranch, month, year,
          basic_salary: staffBasic, allowances: compStatEarnings, gross_salary: staffGross,
          epf_employee: staffEpf.employee, epf_employer: staffEpf.employer,
          socso_employee: staffSocso.employee, socso_employer: staffSocso.employer,
          eis_employee: staffEis.employee, eis_employer: staffEis.employer,
          pcb_amount: staffPcb, net_salary: staffNet,
          overtime_hours: totalOtHours, overtime_rate: staffOtRate, overtime_amount: staffOtAmount,
          late_deduction: 0, advance_deduction: 0, other_deductions: compDeds, other_allowances: compNonStatEarnings,
          claims_amount: totalClaimsAmt, unpaid_leave_deduction: staffUnpaidDed,
          days_worked: (att?.length ?? 0) + selHolidayWorkDays, status: "draft", created_by: user!.id,
        }, { onConflict: "user_id,month,year" });
        success++;
      } catch (err: any) {
        failed++;
        skipped.push({ id: staffId, name: nameLookup.get(staffId) || "Staff", reason: err?.message || "Unexpected error during generation" });
      }
      setSelectiveProgress(Math.round(((i + 1) / selectedIds.length) * 100));
    }
    setSelectiveGenerating(false);
    queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
    queryClient.invalidateQueries({ queryKey: ["staff-profiles-dialog"] });
    if (failed > 0) {
      setSkipReport({ success, skipped });
      setSkipReportOpen(true);
    } else {
      toast({ title: "Payslip generation complete", description: `${success} payslips generated.` });
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending_approval": return <Badge className="bg-warning/100/10 text-warning border-warning/25">Pending Approval</Badge>;
      case "approved": return <Badge className="bg-info/100/10 text-info border-info/25">Approved</Badge>;
      case "confirmed": return <Badge className="bg-info/100/10 text-info border-info/25">Confirmed</Badge>;
      case "paid": return <Badge className="bg-success/100/10 text-success border-success/25">Paid</Badge>;
      case "reversed": return <Badge className="bg-destructive/100/10 text-destructive border-destructive/25">Reversed</Badge>;
      default: return <Badge variant="outline">Draft</Badge>;
    }
  };

  const rm = (v: number) => `RM ${v.toFixed(2)}`;

  // Month-level KPIs
  const monthKpis = useMemo(() => {
    const records = (payrollRecords ?? []).filter((r: any) => r.status !== "reversed");
    return {
      totalGross: records.reduce((s: number, r: any) => s + Number(r.gross_salary), 0),
      totalNet: records.reduce((s: number, r: any) => s + Number(r.net_salary), 0),
      totalDeductions: records.reduce((s: number, r: any) => s + Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount) + Number(r.late_deduction || 0) + Number(r.advance_deduction || 0) + Number(r.other_deductions || 0) + Number(r.unpaid_leave_deduction || 0) + Number(r.absent_deduction || 0), 0),
      totalEmployer: records.reduce((s: number, r: any) => s + Number(r.epf_employer) + Number(r.socso_employer) + Number(r.eis_employer), 0),
      staffCount: records.length,
      pendingCount: records.filter((r: any) => r.status === "pending_approval").length,
      approvedCount: records.filter((r: any) => r.status === "approved").length,
      draftCount: records.filter((r: any) => r.status === "draft" || !r.status).length,
      confirmedCount: records.filter((r: any) => r.status === "confirmed").length,
      paidCount: records.filter((r: any) => r.status === "paid").length,
    };
  }, [payrollRecords]);

  // Monthly overview stats from yearly data
  const monthlyOverview = useMemo(() => {
    const records = (payrollYearly ?? []).filter((r: any) => r.status !== "reversed");
    return MONTHS.map((name, i) => {
      const monthRecords = records.filter((r: any) => r.month === i + 1);
      if (monthRecords.length === 0) return null;
      const allPaid = monthRecords.every((r: any) => r.status === "paid");
      const anyDraft = monthRecords.some((r: any) => r.status === "draft" || !r.status);
      const anyPending = monthRecords.some((r: any) => r.status === "pending_approval");
      const anyApproved = monthRecords.some((r: any) => r.status === "approved" || r.status === "confirmed");
      let aggregateStatus = "Closed";
      let statusColor = "bg-success/100/10 text-success border-success/25";
      if (anyDraft) { aggregateStatus = "Preparing"; statusColor = "bg-muted text-muted-foreground border-border"; }
      else if (anyPending) { aggregateStatus = "Pending Approval"; statusColor = "bg-warning/100/10 text-warning border-warning/25"; }
      else if (anyApproved && !allPaid) { aggregateStatus = "Approved"; statusColor = "bg-info/100/10 text-info border-info/25"; }
      else if (allPaid) { aggregateStatus = "Closed"; statusColor = "bg-success/100/10 text-success border-success/25"; }
      // Derive progress step
      let step = 1;
      if (!anyDraft && !anyPending) step = 3;
      else if (!anyDraft) step = 2;
      return {
        monthIndex: i + 1,
        monthName: name,
        staffCount: monthRecords.length,
        totalNet: monthRecords.reduce((s: number, r: any) => s + Number(r.net_salary), 0),
        totalGross: monthRecords.reduce((s: number, r: any) => s + Number(r.gross_salary), 0),
        aggregateStatus,
        statusColor,
        step,
        draftCount: monthRecords.filter((r: any) => r.status === "draft" || !r.status).length,
        pendingCount: monthRecords.filter((r: any) => r.status === "pending_approval").length,
        paidCount: monthRecords.filter((r: any) => r.status === "paid").length,
      };
    }).filter(Boolean) as any[];
  }, [payrollYearly]);

  // When entering detail view, sync month
  useEffect(() => {
    if (viewMode === "detail" && detailMonth !== null) {
      setMonth(detailMonth);
    }
  }, [viewMode, detailMonth]);

  // Progress stepper component
  const ProgressStepper = ({ currentStep }: { currentStep: number }) => {
    const steps = [
      { label: "Update & Review", icon: FileText },
      { label: "Approval", icon: CheckCircle2 },
      { label: "Payment & Close", icon: Banknote },
    ];
    return (
      <div className="flex items-center justify-between w-full max-w-lg mx-auto mb-6">
        {steps.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = i + 1 === currentStep;
          const isComplete = i + 1 < currentStep;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors",
                  isComplete ? "bg-primary border-primary text-primary-foreground" :
                  isActive ? "border-primary text-primary bg-primary/10" :
                  "border-muted-foreground/30 text-muted-foreground/50"
                )}>
                  <StepIcon className="h-4 w-4" />
                </div>
                <span className={cn("text-[10px] font-medium text-center", isActive || isComplete ? "text-foreground" : "text-muted-foreground/50")}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-2 mt-[-16px]", isComplete ? "bg-primary" : "bg-muted-foreground/20")} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payroll Management</h1>
            <p className="text-muted-foreground">
              {viewMode === "overview" ? "Monthly payroll overview" : `${MONTHS[month - 1]} ${year} — Staff Payroll`}
            </p>
          </div>
          {viewMode === "detail" && (
            <Button variant="outline" onClick={() => { setViewMode("overview"); setExpandedRecordId(null); }} className="gap-2">
              <ChevronUp className="h-4 w-4 rotate-[-90deg]" /> Back to Overview
            </Button>
          )}
        </div>

        {/* Year Selector — always visible */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input type="number" className="w-[100px]" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} />
          </div>
          {viewMode === "overview" && canManage && selectedBranch && (
            <Button className="gap-2" onClick={() => {
              setPayrollDate(undefined);
              setPayrollRemarks("");
              setIncludeClaims(true);
              setIncludeOvertime(true);
              setIncludeUnpaidLeave(true);
              setIncludeLateness(true);
              setPayrollMode("all");
              setSelectedStaffIds(new Set());
              setStaffSearch("");
              setShowRunPayrollDialog(true);
            }}>
              <Zap className="h-4 w-4" /> Run New Payroll
            </Button>
          )}
          {(batchGenerating || selectiveGenerating) && (
            <div className="flex-1 max-w-xs">
              <Progress value={batchGenerating ? batchProgress : selectiveProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{batchGenerating ? batchProgress : selectiveProgress}% complete</p>
            </div>
          )}
        </div>

        {/* Run New Payroll Dialog */}
        <Dialog open={showRunPayrollDialog} onOpenChange={setShowRunPayrollDialog}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Run New Payroll</DialogTitle>
              <DialogDescription>Configure payroll parameters and select staff to generate payslips.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Payroll Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Year</Label>
                    <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Month</Label>
                    <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Payroll Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !payrollDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {payrollDate ? format(payrollDate, "PPP") : "Select payroll date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={payrollDate} onSelect={setPayrollDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Remarks</Label>
                <Textarea placeholder="Optional remarks for this payroll run..." value={payrollRemarks} onChange={(e) => setPayrollRemarks(e.target.value)} rows={2} />
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Include into Payment</h4>
                <div className="space-y-3">
                  {[
                    { label: "Claim Financial", desc: "Include approved claims in net pay", checked: includeClaims, onChange: setIncludeClaims },
                    { label: "Claim Overtime", desc: "Include approved overtime hours", checked: includeOvertime, onChange: setIncludeOvertime },
                    { label: "Unpaid Leave", desc: "Deduct unpaid leave days from salary", checked: includeUnpaidLeave, onChange: setIncludeUnpaidLeave },
                    { label: "Lateness", desc: "Apply late deduction based on policy", checked: includeLateness, onChange: setIncludeLateness },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                      <Switch checked={item.checked} onCheckedChange={item.onChange} />
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Staff Selection</h4>
                <div className="flex gap-2">
                  <Button size="sm" variant={payrollMode === "all" ? "default" : "outline"} onClick={() => { setPayrollMode("all"); setSelectedStaffIds(new Set()); }} className="text-xs">All Staff</Button>
                  <Button size="sm" variant={payrollMode === "selective" ? "default" : "outline"} onClick={() => setPayrollMode("selective")} className="text-xs">Select Staff</Button>
                </div>
                {payrollMode === "selective" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search staff..." value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} className="pl-9 h-8 text-xs" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => {
                        const selectable = staffProfilesForDialog.filter((s: any) => !s.hasRecord);
                        if (selectedStaffIds.size === selectable.length) setSelectedStaffIds(new Set());
                        else setSelectedStaffIds(new Set(selectable.map((s: any) => s.id)));
                      }}>
                        {selectedStaffIds.size === staffProfilesForDialog.filter((s: any) => !s.hasRecord).length && staffProfilesForDialog.length > 0 ? "Deselect All" : "Select All"}
                      </Button>
                      <span className="text-[10px] text-muted-foreground">{selectedStaffIds.size} selected</span>
                    </div>
                    <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                      {staffProfilesForDialog
                        .filter((s: any) => !staffSearch || `${s.first_name} ${s.last_name}`.toLowerCase().includes(staffSearch.toLowerCase()))
                        .map((s: any) => (
                        <label key={s.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors text-xs ${s.hasRecord ? "opacity-50" : ""}`}>
                          <input type="checkbox" className="rounded" checked={selectedStaffIds.has(s.id)} disabled={s.hasRecord} onChange={() => {
                            const next = new Set(selectedStaffIds);
                            if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                            setSelectedStaffIds(next);
                          }} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{s.first_name} {s.last_name}</p>
                            {s.designation && <span className="text-muted-foreground">{s.designation}</span>}
                          </div>
                          {s.hasRecord && <Badge variant="outline" className="text-[9px] shrink-0">Has Record</Badge>}
                          {!s.hasRecord && (!s.basic_salary || s.basic_salary <= 0) && <Badge variant="outline" className="text-[9px] border-warning/30 text-warning shrink-0">No Salary</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span><strong className="text-foreground">{payrollMode === "all" ? (staffList?.length ?? 0) : selectedStaffIds.size}</strong> employees will be included</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRunPayrollDialog(false)}>Cancel</Button>
              <Button className="gap-2" disabled={batchGenerating || selectiveGenerating || (payrollMode === "selective" && selectedStaffIds.size === 0)} onClick={() => {
                setShowRunPayrollDialog(false);
                if (payrollMode === "selective") handleSelectiveGenerate(Array.from(selectedStaffIds));
                else handleBatchGenerate();
              }}>
                {(batchGenerating || selectiveGenerating) ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Zap className="h-4 w-4" /> Generate Payment</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* OVERVIEW MODE — Monthly Summary Table                      */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* Skip Report Dialog — shows WHY staff were skipped         */}
        <Dialog open={skipReportOpen} onOpenChange={setSkipReportOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Payroll run finished — some staff were skipped</DialogTitle>
              <DialogDescription>
                {skipReport.success} payslip{skipReport.success === 1 ? "" : "s"} generated, {skipReport.skipped.length} skipped. Fix the issues below and run payroll again for those staff.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto divide-y rounded-md border">
              {skipReport.skipped.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setSkipReportOpen(false);
                      window.location.href = `/staff-management/${s.id}`;
                    }}
                  >
                    Open profile
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkipReportOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {viewMode === "overview" && (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview"><CalendarDays className="h-4 w-4 mr-1" />Monthly Overview</TabsTrigger>
              {canManage && <TabsTrigger value="summary"><BarChart3 className="h-4 w-4 mr-1" />Summary</TabsTrigger>}
              {canManage && <TabsTrigger value="reports"><FileText className="h-4 w-4 mr-1" />Reports</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {monthlyOverview.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center">
                      <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-muted-foreground font-medium">No payroll records for {year}</p>
                      <p className="text-xs text-muted-foreground mt-1">Click "Run New Payroll" to create your first payroll run</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {monthlyOverview.map((mo: any) => (
                    <Card key={mo.monthIndex} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => {
                      setDetailMonth(mo.monthIndex);
                      setMonth(mo.monthIndex);
                      setViewMode("detail");
                    }}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{mo.monthName} {year}</CardTitle>
                          <Badge className={cn("text-[10px]", mo.statusColor)}>{mo.aggregateStatus}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Net</p>
                            <p className="text-lg font-bold text-primary">{rm(mo.totalNet)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Staff</p>
                            <p className="text-lg font-bold">{mo.staffCount}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {mo.draftCount > 0 && <Badge variant="outline" className="text-[9px]">{mo.draftCount} Draft</Badge>}
                          {mo.pendingCount > 0 && <Badge className="bg-warning/100/10 text-warning border-warning/25 text-[9px]">{mo.pendingCount} Pending</Badge>}
                          {mo.paidCount > 0 && <Badge className="bg-success/100/10 text-success border-success/25 text-[9px]">{mo.paidCount} Paid</Badge>}
                        </div>
                        {/* Mini progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Progress</span>
                            <span>{mo.paidCount}/{mo.staffCount} paid</span>
                          </div>
                          <Progress value={mo.staffCount > 0 ? (mo.paidCount / mo.staffCount) * 100 : 0} className="h-1.5" />
                        </div>
                        <div className="flex items-center justify-end text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details →
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Summary Tab (existing chart + stats) */}
            {canManage && (
              <TabsContent value="summary" className="space-y-6">
                {(() => {
                  const records = (payrollYearly ?? []).filter((r: any) => r.status !== "reversed");
                  const monthlyData = MONTHS.map((name, i) => {
                    const monthRecords = records.filter((r: any) => r.month === i + 1);
                    return {
                      month: name.substring(0, 3),
                      grossSalary: monthRecords.reduce((s: number, r: any) => s + Number(r.gross_salary), 0),
                      totalDeductions: monthRecords.reduce((s: number, r: any) => s + Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount) + Number(r.late_deduction || 0) + Number(r.advance_deduction || 0) + Number(r.other_deductions || 0) + Number(r.unpaid_leave_deduction || 0) + Number(r.absent_deduction || 0), 0),
                      employerContributions: monthRecords.reduce((s: number, r: any) => s + Number(r.epf_employer) + Number(r.socso_employer) + Number(r.eis_employer), 0),
                      netSalary: monthRecords.reduce((s: number, r: any) => s + Number(r.net_salary), 0),
                      staffCount: monthRecords.length,
                    };
                  });
                  const totals = {
                    gross: records.reduce((s: number, r: any) => s + Number(r.gross_salary), 0),
                    deductions: records.reduce((s: number, r: any) => s + Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount) + Number(r.late_deduction || 0) + Number(r.advance_deduction || 0) + Number(r.other_deductions || 0) + Number(r.unpaid_leave_deduction || 0) + Number(r.absent_deduction || 0), 0),
                    employer: records.reduce((s: number, r: any) => s + Number(r.epf_employer) + Number(r.socso_employer) + Number(r.eis_employer), 0),
                    net: records.reduce((s: number, r: any) => s + Number(r.net_salary), 0),
                    claims: records.reduce((s: number, r: any) => s + Number(r.claims_amount || 0), 0),
                    epfEmployee: records.reduce((s: number, r: any) => s + Number(r.epf_employee), 0),
                    epfEmployer: records.reduce((s: number, r: any) => s + Number(r.epf_employer), 0),
                    socsoEmployee: records.reduce((s: number, r: any) => s + Number(r.socso_employee), 0),
                    socsoEmployer: records.reduce((s: number, r: any) => s + Number(r.socso_employer), 0),
                    eisEmployee: records.reduce((s: number, r: any) => s + Number(r.eis_employee), 0),
                    eisEmployer: records.reduce((s: number, r: any) => s + Number(r.eis_employer), 0),
                    pcb: records.reduce((s: number, r: any) => s + Number(r.pcb_amount), 0),
                  };
                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Gross Salary</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rm(totals.gross)}</p><p className="text-xs text-muted-foreground">{records.length} records in {year}</p></CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Deductions</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rm(totals.deductions)}</p></CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Employer Contributions</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rm(totals.employer)}</p></CardContent></Card>
                        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Net Payout</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rm(totals.net)}</p><p className="text-xs text-muted-foreground">Incl. claims: {rm(totals.claims)}</p></CardContent></Card>
                      </div>
                      <Card>
                        <CardHeader><CardTitle>Monthly Payroll Costs — {year}</CardTitle><CardDescription>Gross salary, deductions, and employer contributions by month</CardDescription></CardHeader>
                        <CardContent>
                          <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="month" className="text-xs" />
                                <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => rm(v)} />
                                <Legend />
                                <Bar dataKey="grossSalary" name="Gross Salary" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="totalDeductions" name="Deductions" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="employerContributions" name="Employer Cost" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle>Statutory Contributions Breakdown — {year}</CardTitle></CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader><TableRow><TableHead>Contribution</TableHead><TableHead className="text-right">Employee</TableHead><TableHead className="text-right">Employer</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                            <TableBody>
                              <TableRow><TableCell className="font-medium">EPF (KWSP)</TableCell><TableCell className="text-right">{rm(totals.epfEmployee)}</TableCell><TableCell className="text-right">{rm(totals.epfEmployer)}</TableCell><TableCell className="text-right font-semibold">{rm(totals.epfEmployee + totals.epfEmployer)}</TableCell></TableRow>
                              <TableRow><TableCell className="font-medium">SOCSO + Perlindungan 24 Jam</TableCell><TableCell className="text-right">{rm(totals.socsoEmployee)}</TableCell><TableCell className="text-right">{rm(totals.socsoEmployer)}</TableCell><TableCell className="text-right font-semibold">{rm(totals.socsoEmployee + totals.socsoEmployer)}</TableCell></TableRow>
                              <TableRow><TableCell className="font-medium">EIS (SIP)</TableCell><TableCell className="text-right">{rm(totals.eisEmployee)}</TableCell><TableCell className="text-right">{rm(totals.eisEmployer)}</TableCell><TableCell className="text-right font-semibold">{rm(totals.eisEmployee + totals.eisEmployer)}</TableCell></TableRow>
                              <TableRow><TableCell className="font-medium">PCB (Tax)</TableCell><TableCell className="text-right">{rm(totals.pcb)}</TableCell><TableCell className="text-right">—</TableCell><TableCell className="text-right font-semibold">{rm(totals.pcb)}</TableCell></TableRow>
                              <TableRow className="border-t-2"><TableCell className="font-bold">Grand Total</TableCell><TableCell className="text-right font-bold">{rm(totals.deductions)}</TableCell><TableCell className="text-right font-bold">{rm(totals.employer)}</TableCell><TableCell className="text-right font-bold">{rm(totals.deductions + totals.employer)}</TableCell></TableRow>
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </TabsContent>
            )}

            {/* Reports Tab — YTD Summary */}
            {canManage && (
              <TabsContent value="reports" className="space-y-6">
                {(() => {
                  const records = (payrollYearly ?? []).filter((r: any) => r.status !== "reversed");
                  // Group by user_id
                  const userMap = new Map<string, { name: string; gross: number; epf: number; socso: number; eis: number; pcb: number; net: number; months: number }>();
                  records.forEach((r: any) => {
                    const uid = r.user_id;
                    const existing = userMap.get(uid) || { name: "", gross: 0, epf: 0, socso: 0, eis: 0, pcb: 0, net: 0, months: 0 };
                    if (!existing.name && r.profiles) {
                      existing.name = `${r.profiles.first_name || ""} ${r.profiles.last_name || ""}`.trim();
                    }
                    existing.gross += Number(r.gross_salary);
                    existing.epf += Number(r.epf_employee);
                    existing.socso += Number(r.socso_employee);
                    existing.eis += Number(r.eis_employee);
                    existing.pcb += Number(r.pcb_amount);
                    existing.net += Number(r.net_salary);
                    existing.months += 1;
                    userMap.set(uid, existing);
                  });
                  const ytdData = Array.from(userMap.entries()).map(([uid, data]) => ({ uid, ...data }));

                  const downloadCSV = () => {
                    const headers = ["Employee", "Months", "Gross Salary", "EPF", "SOCSO", "EIS", "PCB", "Net Salary"];
                    const rows = ytdData.map(d => [d.name || d.uid, d.months, d.gross.toFixed(2), d.epf.toFixed(2), d.socso.toFixed(2), d.eis.toFixed(2), d.pcb.toFixed(2), d.net.toFixed(2)]);
                    const totals_row = ["TOTAL", "", ytdData.reduce((s, d) => s + d.gross, 0).toFixed(2), ytdData.reduce((s, d) => s + d.epf, 0).toFixed(2), ytdData.reduce((s, d) => s + d.socso, 0).toFixed(2), ytdData.reduce((s, d) => s + d.eis, 0).toFixed(2), ytdData.reduce((s, d) => s + d.pcb, 0).toFixed(2), ytdData.reduce((s, d) => s + d.net, 0).toFixed(2)];
                    const csv = [headers, ...rows, totals_row].map(r => r.join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `YTD_Payroll_Summary_${year}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  };

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">YTD Employee Payroll Summary — {year}</h3>
                          <p className="text-sm text-muted-foreground">Cumulative totals for each employee across all processed months</p>
                        </div>
                        <Button variant="outline" className="gap-2" onClick={downloadCSV}>
                          <FileText className="h-4 w-4" /> Download CSV
                        </Button>
                      </div>
                      <Card>
                        <CardContent className="pt-6">
                          {ytdData.length === 0 ? (
                            <div className="text-center py-8">
                              <p className="text-muted-foreground">No payroll data for {year}</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead className="text-center">Months</TableHead>
                                    <TableHead className="text-right">Gross</TableHead>
                                    <TableHead className="text-right">EPF</TableHead>
                                    <TableHead className="text-right">SOCSO</TableHead>
                                    <TableHead className="text-right">EIS</TableHead>
                                    <TableHead className="text-right">PCB</TableHead>
                                    <TableHead className="text-right">Net</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {ytdData.map((d) => (
                                    <TableRow key={d.uid}>
                                      <TableCell className="font-medium">{d.name || d.uid.slice(0, 8)}</TableCell>
                                      <TableCell className="text-center">{d.months}</TableCell>
                                      <TableCell className="text-right">{rm(d.gross)}</TableCell>
                                      <TableCell className="text-right">{rm(d.epf)}</TableCell>
                                      <TableCell className="text-right">{rm(d.socso)}</TableCell>
                                      <TableCell className="text-right">{rm(d.eis)}</TableCell>
                                      <TableCell className="text-right">{rm(d.pcb)}</TableCell>
                                      <TableCell className="text-right font-semibold">{rm(d.net)}</TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow className="border-t-2 font-bold">
                                    <TableCell>TOTAL</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.gross, 0))}</TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.epf, 0))}</TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.socso, 0))}</TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.eis, 0))}</TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.pcb, 0))}</TableCell>
                                    <TableCell className="text-right">{rm(ytdData.reduce((s, d) => s + d.net, 0))}</TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* DETAIL MODE — Staff Payroll for Selected Month             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {viewMode === "detail" && (
          <div className="space-y-6">
            {/* Progress Stepper */}
            {(() => {
              const currentOverview = monthlyOverview.find((mo: any) => mo.monthIndex === month);
              return currentOverview ? <ProgressStepper currentStep={currentOverview.step} /> : null;
            })()}

            {/* Month Info Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-sm px-3 py-1">
                <CalendarDays className="h-4 w-4 mr-1.5" />
                {MONTHS[month - 1]} {year}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">
                <Users className="h-4 w-4 mr-1.5" />
                {monthKpis.staffCount} Staff
              </Badge>
            </div>

            {/* Month KPIs */}
            {(payrollRecords?.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Net Payout</p><p className="text-lg font-bold text-primary">{rm(monthKpis.totalNet)}</p><p className="text-[10px] text-muted-foreground">{monthKpis.staffCount} staff</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Gross</p><p className="text-lg font-bold">{rm(monthKpis.totalGross)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Deductions</p><p className="text-lg font-bold text-destructive">{rm(monthKpis.totalDeductions)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p><div className="flex flex-wrap gap-1 mt-1">
                  {monthKpis.draftCount > 0 && <Badge variant="outline" className="text-[10px]">{monthKpis.draftCount} Draft</Badge>}
                  {monthKpis.pendingCount > 0 && <Badge className="bg-warning/100/10 text-warning border-warning/25 text-[10px]">{monthKpis.pendingCount} Pending</Badge>}
                  {monthKpis.approvedCount > 0 && <Badge className="bg-info/100/10 text-info border-info/25 text-[10px]">{monthKpis.approvedCount} Approved</Badge>}
                  {monthKpis.confirmedCount > 0 && <Badge className="bg-info/100/10 text-info border-info/25 text-[10px]">{monthKpis.confirmedCount} Confirmed</Badge>}
                  {monthKpis.paidCount > 0 && <Badge className="bg-success/100/10 text-success border-success/25 text-[10px]">{monthKpis.paidCount} Paid</Badge>}
                </div></CardContent></Card>
              </div>
            )}

            {/* Bulk Actions */}
            {canManage && (payrollRecords?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Submit All for Approval (when approval enabled and there are drafts) */}
                {monthKpis.draftCount > 0 && payrollApprovalEnabled && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Submit All for Approval ({monthKpis.draftCount})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Submit All for Approval</AlertDialogTitle>
                        <AlertDialogDescription>This will submit {monthKpis.draftCount} draft payroll records for {MONTHS[month - 1]} {year} for approval.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const drafts = (payrollRecords ?? []).filter((r: any) => r.status === "draft" || !r.status);
                          let count = 0;
                          for (const r of drafts) {
                            const { error } = await supabase.from("payroll_records").update({
                              status: "pending_approval",
                              submitted_by: user!.id,
                              submitted_at: new Date().toISOString(),
                            } as any).eq("id", r.id);
                            if (!error) count++;
                          }
                          if (count > 0 && selectedBranch) {
                            await notifyBranchApprovers(selectedBranch, user!.id, "Payroll Pending Approval", `${count} payroll record${count > 1 ? "s" : ""} for ${MONTHS[month - 1]} ${year} submitted for your approval.`, "payroll", "/payroll", undefined, `payroll-batch-approval-${month}-${year}`);
                          }
                          queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
                          queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
                          toast({ title: `${count} records submitted for approval` });
                        }}>Submit All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {/* Confirm All Drafts (when approval NOT enabled) */}
                {monthKpis.draftCount > 0 && !payrollApprovalEnabled && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm All Drafts ({monthKpis.draftCount})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm All Drafts</AlertDialogTitle>
                        <AlertDialogDescription>This will confirm {monthKpis.draftCount} draft payroll records for {MONTHS[month - 1]} {year}.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const drafts = (payrollRecords ?? []).filter((r: any) => r.status === "draft" || !r.status);
                          let count = 0;
                          for (const r of drafts) {
                            const { error } = await supabase.from("payroll_records").update({ status: "confirmed" }).eq("id", r.id);
                            if (!error) count++;
                          }
                          queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
                          queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
                          toast({ title: `${count} records confirmed` });
                        }}>Confirm All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {/* Approve All (for super_admin when there are pending_approval records) */}
                {isSuperAdmin && monthKpis.pendingCount > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 border-success/25 text-success hover:bg-success/10">
                        <ThumbsUp className="h-3.5 w-3.5" /> Approve All ({monthKpis.pendingCount})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Approve All Pending</AlertDialogTitle>
                        <AlertDialogDescription>Approve {monthKpis.pendingCount} pending payroll records for {MONTHS[month - 1]} {year}? This will move them to the Payment stage.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const pending = (payrollRecords ?? []).filter((r: any) => r.status === "pending_approval");
                          let count = 0;
                          for (const r of pending) {
                            const { error } = await supabase.from("payroll_records").update({
                              status: "approved",
                              approved_by: user!.id,
                              approved_at: new Date().toISOString(),
                            } as any).eq("id", r.id);
                            if (!error) {
                              count++;
                              await supabase.from("notifications").insert({ user_id: r.user_id, title: "Payroll Approved", message: `Your payroll for ${MONTHS[r.month - 1]} ${r.year} has been approved. Net salary: RM ${Number(r.net_salary).toFixed(2)}.`, type: "payroll", reference_id: r.id, action_url: "/my-payslips" });
                            }
                          }
                          queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
                          queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
                          toast({ title: `${count} records approved` });
                        }}>Approve All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {/* Mark All Paid (confirmed or approved) */}
                {(monthKpis.confirmedCount > 0 || monthKpis.approvedCount > 0) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 border-success/25 text-success hover:bg-success/10">
                        <Banknote className="h-3.5 w-3.5" /> Mark All Paid ({monthKpis.confirmedCount + monthKpis.approvedCount})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mark All as Paid & Close</AlertDialogTitle>
                        <AlertDialogDescription>Mark {monthKpis.confirmedCount + monthKpis.approvedCount} records as paid for {MONTHS[month - 1]} {year}. This will close the payroll for this month.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const eligible = (payrollRecords ?? []).filter((r: any) => r.status === "confirmed" || r.status === "approved");
                          let count = 0;
                          const notifRows: any[] = [];
                          for (const r of eligible) {
                            const { error } = await supabase.from("payroll_records").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", r.id);
                            if (!error) {
                              count++;
                              notifRows.push({ user_id: r.user_id, title: "Salary Paid", message: `Your salary for ${MONTHS[r.month - 1]} ${r.year} has been paid. Net amount: RM ${Number(r.net_salary).toFixed(2)}.`, type: "payroll", reference_id: r.id, action_url: "/my-payslips" });
                            }
                          }
                          if (notifRows.length > 0) await supabase.from("notifications").insert(notifRows);
                          if (count > 0 && selectedBranch) {
                            await notifyBranchApprovers(selectedBranch, user!.id, "Payroll Payment Completed", `${count} payroll record${count > 1 ? "s" : ""} for ${MONTHS[month - 1]} ${year} marked as paid. Payroll cycle closed.`, "payroll", "/payroll", undefined, `payroll-batch-paid-${month}-${year}`);
                          }
                          queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
                          queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
                          toast({ title: `${count} records marked as paid` });
                        }}>Mark All Paid & Close</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {canManage && selectedBranch && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                    setPayrollDate(undefined); setPayrollRemarks(""); setIncludeClaims(true); setIncludeOvertime(true);
                    setIncludeUnpaidLeave(true); setIncludeLateness(true); setPayrollMode("all");
                    setSelectedStaffIds(new Set()); setStaffSearch(""); setShowRunPayrollDialog(true);
                  }}>
                    <Plus className="h-3.5 w-3.5" /> Add Staff
                  </Button>
                )}
              </div>
            )}

            {/* Staff Records Table */}
            <Card>
              <CardContent className="pt-6">
                {!payrollRecords?.length ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground font-medium">No payroll records for {MONTHS[month - 1]} {year}</p>
                    <p className="text-xs text-muted-foreground mt-1">Use "Add Staff" or go back and run a new payroll</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Deductions</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[140px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payrollRecords.map((r: any) => {
                          const isExpanded = expandedRecordId === r.id;
                          const totalDed = Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount) + Number(r.late_deduction || 0) + Number(r.advance_deduction || 0) + Number(r.other_deductions || 0) + Number(r.unpaid_leave_deduction || 0) + Number(r.absent_deduction || 0);
                          return (
                            <Collapsible key={r.id} open={isExpanded} onOpenChange={(open) => setExpandedRecordId(open ? r.id : null)} asChild>
                              <>
                                <CollapsibleTrigger asChild>
                                  <TableRow className={`cursor-pointer ${r.status === "reversed" ? "opacity-50 line-through" : ""} ${isExpanded ? "bg-muted/50" : "hover:bg-muted/30"}`}>
                                    <TableCell className="px-2">
                                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                    </TableCell>
                                    <TableCell className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</TableCell>
                                    <TableCell className="text-right">{rm(r.gross_salary)}</TableCell>
                                    <TableCell className="text-right text-destructive">{rm(totalDed)}</TableCell>
                                    <TableCell className="text-right font-semibold">{rm(r.net_salary)}</TableCell>
                                    <TableCell>
                                      {statusBadge(r.status || "draft")}
                                      {r.status === "reversed" && r.reversal_reason && (
                                        <p className="text-[10px] text-muted-foreground mt-0.5 no-underline" style={{ textDecoration: "none" }}>{r.reversal_reason}</p>
                                      )}
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center gap-1">
                                        <Button size="icon" variant="ghost" title="Print payslip" onClick={async (e) => {
                                          e.stopPropagation();
                                          const branch = branches?.find((b: any) => b.id === r.branch_id);
                                            const [{ data: sp }, { data: sd }, { data: ytd }, { data: earlyClaims }] = await Promise.all([
                                            supabase.from("staff_profiles").select("ic_number, epf_number, socso_number, employment_type").eq("user_id", r.user_id).maybeSingle(),
                                            supabase.from("staff_designations").select("designation, custom_designation").eq("user_id", r.user_id).maybeSingle(),
                                            supabase.from("payroll_records").select("gross_salary, epf_employee, socso_employee, eis_employee, pcb_amount, net_salary").eq("user_id", r.user_id).eq("year", r.year).lte("month", r.month).neq("status", "reversed"),
                                            supabase.from("staff_claims").select("amount, paid_at").eq("user_id", r.user_id).eq("paid_via", "early_payment").eq("level2_status", "approved").or(`and(payroll_month.eq.${r.month},payroll_year.eq.${r.year}),and(payroll_month.is.null,claim_date.gte.${format(new Date(r.year, r.month - 1, 1), "yyyy-MM-dd")},claim_date.lte.${format(endOfMonth(new Date(r.year, r.month - 1, 1)), "yyyy-MM-dd")})`),
                                          ]);
                                          const [{ data: salComps }, { data: customItemsRows }] = await Promise.all([
                                            supabase.from("staff_salary_components" as any).select("label,name,type,amount,is_statutory").eq("user_id", r.user_id).eq("is_active", true),
                                            supabase.from("payroll_custom_items").select("label,type,amount").eq("payroll_record_id", r.id),
                                          ]);
                                          const extraEarnings = [
                                            ...((salComps ?? []) as any[]).filter((c: any) => c.type === "earning").map((c: any) => ({ label: c.label || c.name || "Allowance", amount: Number(c.amount) || 0 })),
                                            ...((customItemsRows ?? []) as any[]).filter((c: any) => c.type === "earning").map((c: any) => ({ label: c.label || "Custom Earning", amount: Number(c.amount) || 0 })),
                                          ];
                                          const extraDeductions = [
                                            ...((salComps ?? []) as any[]).filter((c: any) => c.type === "deduction").map((c: any) => ({ label: c.label || c.name || "Deduction", amount: Number(c.amount) || 0 })),
                                            ...((customItemsRows ?? []) as any[]).filter((c: any) => c.type === "deduction").map((c: any) => ({ label: c.label || "Custom Deduction", amount: Number(c.amount) || 0 })),
                                          ];
                                          const ytdArr = ytd ?? [];
                                          const rawDesignation = sd?.custom_designation || sd?.designation || "";
                                          const earlyTotal = (earlyClaims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
                                          const earlyDate = earlyClaims?.[0]?.paid_at ? format(new Date(earlyClaims[0].paid_at), "dd/MM/yyyy") : undefined;
                                          const lateVal = r.late_deduction || 0;
                                          const unpaidVal = r.unpaid_leave_deduction || 0;
                                          let finalLate = lateVal;
                                          let finalUnpaid = unpaidVal;
                                          if (unpaidVal === 0 && lateVal > 0) {
                                            const { count } = await supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("user_id", r.user_id).eq("leave_type", "unpaid").gte("start_date", `${r.year}-${String(r.month).padStart(2,"0")}-01`).lt("start_date", `${r.year}-${String(r.month + 1 > 12 ? 1 : r.month + 1).padStart(2,"0")}-01`).eq("status", "approved");
                                            if ((count || 0) > 0) { finalUnpaid = lateVal; finalLate = 0; }
                                          }
                                          handlePrintPayslip({
                                            staffName: `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim(),
                                            staffEmail: r.profiles?.email || "", branchName: branch?.name || "",
                                            staffIc: sp?.ic_number || "", staffId: rawDesignation, designation: rawDesignation,
                                            employmentType: (sp as any)?.employment_type || "",
                                            epfNumber: sp?.epf_number || "", socsoNumber: sp?.socso_number || "",
                                            companyRegNo: mainBranchSettings?.business_registration_no || "",
                                            companyAddress: mainBranchSettings?.address_line || "",
                                            companyPhone: mainBranchSettings?.phone || "",
                                            companyEmail: mainBranchSettings?.email || "",
                                            month: r.month, year: r.year, basicSalary: r.basic_salary,
                                            allowances: r.allowances, otherAllowances: r.other_allowances || 0,
                                            overtimeHours: r.overtime_hours || 0, overtimeRate: r.overtime_rate || 0, overtimeAmount: r.overtime_amount || 0,
                                            grossSalary: r.gross_salary, epfEmployee: r.epf_employee, epfEmployer: r.epf_employer,
                                            socsoEmployee: r.socso_employee, socsoEmployer: r.socso_employer,
                                            eisEmployee: r.eis_employee, eisEmployer: r.eis_employer, pcbAmount: r.pcb_amount,
                                            lateDeduction: finalLate, unpaidLeaveDeduction: finalUnpaid,
                                            advanceDeduction: r.advance_deduction || 0, otherDeductions: r.other_deductions || 0,
                                            claimsAmount: r.claims_amount || 0, netSalary: r.net_salary,
                                            earlyPaidClaimsAmount: earlyTotal > 0 ? earlyTotal : undefined,
                                            earlyPaidClaimsDate: earlyDate,
                                            extraEarnings,
                                            extraDeductions,
                                            status: r.status || "draft", paidAt: r.paid_at,
                                            logoUrl: mainBranchSettings?.logo_url || "",
                                            schoolName: mainBranchSettings?.school_display_name || "",
                                            ytdGross: ytdArr.reduce((s: number, x: any) => s + Number(x.gross_salary), 0),
                                            ytdEpfEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.epf_employee), 0),
                                            ytdSocsoEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.socso_employee), 0),
                                            ytdEisEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.eis_employee), 0),
                                            ytdPcb: ytdArr.reduce((s: number, x: any) => s + Number(x.pcb_amount), 0),
                                            ytdNet: ytdArr.reduce((s: number, x: any) => s + Number(x.net_salary), 0),
                                          });
                                        }}>
                                          <Printer className="h-4 w-4" />
                                        </Button>
                                        {canManage && (r.status === "draft" || r.status === "reversed" || !r.status) && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button size="icon" variant="ghost" title="Delete draft" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader><AlertDialogTitle>Delete Draft Payroll</AlertDialogTitle><AlertDialogDescription>Delete {r.profiles?.first_name}'s draft payroll for {MONTHS[r.month - 1]} {r.year}?</AlertDialogDescription></AlertDialogHeader>
                                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteDraftMutation.mutate(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                        {canManage && (r.status === "draft" || !r.status) && (
                                          payrollApprovalEnabled ? (
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild><Button size="icon" variant="ghost" title="Submit for approval" onClick={(e) => e.stopPropagation()}><Send className="h-4 w-4 text-warning" /></Button></AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>Submit for Approval</AlertDialogTitle><AlertDialogDescription>Submit {r.profiles?.first_name}'s payroll for approval?</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => submitForApprovalMutation.mutate(r)}>Submit</AlertDialogAction></AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                          ) : (
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild><Button size="icon" variant="ghost" title="Confirm payroll" onClick={(e) => e.stopPropagation()}><CheckCircle2 className="h-4 w-4 text-info" /></Button></AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>Confirm Payroll</AlertDialogTitle><AlertDialogDescription>Confirm {r.profiles?.first_name}'s payroll for {MONTHS[r.month - 1]} {r.year}?</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmMutation.mutate(r)}>Confirm</AlertDialogAction></AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                          )
                                        )}
                                        {isSuperAdmin && r.status === "pending_approval" && (
                                          <>
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild><Button size="icon" variant="ghost" title="Approve" onClick={(e) => e.stopPropagation()}><ThumbsUp className="h-4 w-4 text-success" /></Button></AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>Approve Payroll</AlertDialogTitle><AlertDialogDescription>Approve {r.profiles?.first_name}'s payroll?</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => approvePayrollMutation.mutate(r)}>Approve</AlertDialogAction></AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                            <AlertDialog>
                                              <AlertDialogTrigger asChild><Button size="icon" variant="ghost" title="Reject" onClick={(e) => e.stopPropagation()}><ThumbsDown className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader><AlertDialogTitle>Reject Payroll</AlertDialogTitle><AlertDialogDescription>Reject and return to draft?</AlertDialogDescription></AlertDialogHeader>
                                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => rejectPayrollMutation.mutate(r)}>Reject</AlertDialogAction></AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                          </>
                                        )}
                                        {canManage && (r.status === "confirmed" || r.status === "approved") && (
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild><Button size="icon" variant="ghost" title="Mark as paid" onClick={(e) => e.stopPropagation()}><Banknote className="h-4 w-4 text-success" /></Button></AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader><AlertDialogTitle>Mark as Paid</AlertDialogTitle><AlertDialogDescription>Mark {r.profiles?.first_name}'s payroll as paid?</AlertDialogDescription></AlertDialogHeader>
                                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => markPaidMutation.mutate(r)}>Mark Paid</AlertDialogAction></AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        )}
                                        {canManage && (r.status === "confirmed" || r.status === "approved" || r.status === "paid") && (
                                          <Button size="icon" variant="ghost" title="Reverse payroll" onClick={(e) => { e.stopPropagation(); setReverseTarget(r); }}>
                                            <RotateCcw className="h-4 w-4 text-warning" />
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                </CollapsibleTrigger>
                                <CollapsibleContent asChild>
                                  <tr>
                                    <td colSpan={7} className="p-0">
                                      <InlinePayrollEditor
                                        record={r}
                                        branches={branches ?? []}
                                        onSaved={() => {
                                          queryClient.invalidateQueries({ queryKey: ["payroll-history"] });
                                          queryClient.invalidateQueries({ queryKey: ["payroll-yearly"] });
                                        }}
                                        onPrint={handlePrintPayslip}
                                        user={user}
                                        approvalEnabled={approvalSettings?.payroll_l2_enabled ?? false}
                                      />
                                    </td>
                                  </tr>
                                </CollapsibleContent>
                              </>
                            </Collapsible>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {payslipData && <PayslipPrintView ref={payslipRef} data={payslipData} />}

      {/* Reverse Payroll Dialog */}
      <Dialog open={!!reverseTarget} onOpenChange={(open) => { if (!open) { setReverseTarget(null); setReverseReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning"><RotateCcw className="h-5 w-5" /> Reverse Payroll</DialogTitle>
            <DialogDescription>
              Reverse {reverseTarget?.profiles?.first_name}'s payroll for {reverseTarget ? MONTHS[reverseTarget.month - 1] : ""} {reverseTarget?.year}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason for Reversal <span className="text-destructive">*</span></Label>
            <Textarea placeholder="e.g. Incorrect salary amount, wrong month, duplicate entry..." value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReverseTarget(null); setReverseReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={!reverseReason.trim() || reverseMutation.isPending} onClick={() => reverseMutation.mutate({ record: reverseTarget, reason: reverseReason })}>
              {reverseMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Reversing...</> : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}