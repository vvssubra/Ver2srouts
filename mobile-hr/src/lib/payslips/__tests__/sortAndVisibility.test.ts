import { isVisiblePayslipStatus, sortPayslipsDescending } from "../../payslips";
import type { PayrollRecord } from "../../hr-types";

function makeRecord(overrides: Partial<PayrollRecord>): PayrollRecord {
  return {
    id: "payroll-1",
    user_id: "user-1",
    branch_id: "branch-1",
    month: 1,
    year: 2026,
    basic_salary: 3000,
    allowances: 0,
    other_allowances: null,
    other_allowance_notes: null,
    overtime_hours: null,
    overtime_rate: null,
    overtime_amount: null,
    claims_amount: 0,
    gross_salary: 3000,
    epf_employee: 0,
    epf_employer: 0,
    socso_employee: 0,
    socso_employer: 0,
    eis_employee: 0,
    eis_employer: 0,
    pcb_amount: 0,
    late_deduction: null,
    advance_deduction: null,
    other_deductions: null,
    other_deduction_notes: null,
    unpaid_leave_deduction: null,
    absent_deduction: 0,
    days_worked: null,
    net_salary: 3000,
    notes: null,
    status: "confirmed",
    submitted_at: null,
    submitted_by: null,
    approved_at: null,
    approved_by: null,
    paid_at: null,
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: "admin-1",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isVisiblePayslipStatus", () => {
  it("shows confirmed and paid", () => {
    expect(isVisiblePayslipStatus("confirmed")).toBe(true);
    expect(isVisiblePayslipStatus("paid")).toBe(true);
  });

  it("hides draft, pending, reversed, and null/undefined", () => {
    expect(isVisiblePayslipStatus("draft")).toBe(false);
    expect(isVisiblePayslipStatus("pending_payroll")).toBe(false);
    expect(isVisiblePayslipStatus("reversed")).toBe(false);
    expect(isVisiblePayslipStatus(null)).toBe(false);
    expect(isVisiblePayslipStatus(undefined)).toBe(false);
  });
});

describe("sortPayslipsDescending", () => {
  it("orders by year desc, then month desc, without mutating the input", () => {
    const records = [
      makeRecord({ id: "a", year: 2025, month: 11 }),
      makeRecord({ id: "b", year: 2026, month: 1 }),
      makeRecord({ id: "c", year: 2026, month: 6 }),
      makeRecord({ id: "d", year: 2025, month: 12 }),
    ];
    const sorted = sortPayslipsDescending(records);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
    expect(records.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});
