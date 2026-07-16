import type { PayrollRecord } from "./hr-types";

/**
 * Pure business logic for the read-only Payslips screen. Kept free of any
 * Supabase/React Native imports so it can be unit tested without rendering
 * anything or touching the network.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Formats a 1-indexed month + year into e.g. "January 2026". */
export function formatPayPeriod(month: number, year: number): string {
  const name = MONTH_NAMES[month - 1] ?? String(month);
  return `${name} ${year}`;
}

export interface PayslipLine {
  label: string;
  amount: number;
}

export interface PayslipSummary {
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  net: number;
}

/**
 * Groups a payroll_records row into display-ready earnings/deductions
 * lines, dropping any line whose amount is falsy (0, null, or undefined)
 * — most of these columns are 0/null in practice for any given payslip.
 */
export function summarizePayslip(record: PayrollRecord): PayslipSummary {
  const earningsSource: [string, number | null | undefined][] = [
    ["Basic Salary", record.basic_salary],
    ["Allowances", record.allowances],
    ["Other Allowances", record.other_allowances],
    ["Overtime", record.overtime_amount],
    ["Claims", record.claims_amount],
  ];

  const deductionsSource: [string, number | null | undefined][] = [
    ["EPF (Employee)", record.epf_employee],
    ["SOCSO (Employee)", record.socso_employee],
    ["EIS (Employee)", record.eis_employee],
    ["PCB", record.pcb_amount],
    ["Late Deduction", record.late_deduction],
    ["Advance Deduction", record.advance_deduction],
    ["Other Deductions", record.other_deductions],
    ["Unpaid Leave Deduction", record.unpaid_leave_deduction],
    ["Absent Deduction", record.absent_deduction],
  ];

  const toLines = (source: [string, number | null | undefined][]): PayslipLine[] =>
    source
      .filter(([, amount]) => !!amount)
      .map(([label, amount]) => ({ label, amount: amount as number }));

  return {
    earnings: toLines(earningsSource),
    deductions: toLines(deductionsSource),
    net: record.net_salary,
  };
}

/** Formats an amount as Ringgit currency, e.g. `25.5` -> `"RM 25.50"`. */
export function formatAmount(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

/**
 * Payslips visible to the staff member: only records that have progressed
 * past draft/pending payroll processing into a state they can rely on.
 */
export function isVisiblePayslipStatus(status: string | null | undefined): boolean {
  return status === "confirmed" || status === "paid";
}

/**
 * Sorts payroll_records rows for the history list: most recent pay period
 * first (year desc, then month desc).
 */
export function sortPayslipsDescending(records: PayrollRecord[]): PayrollRecord[] {
  return [...records].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}
