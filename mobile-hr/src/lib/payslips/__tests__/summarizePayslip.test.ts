import { summarizePayslip } from "../../payslips";
import type { PayrollRecord } from "../../hr-types";

/**
 * Builds a minimally-valid PayrollRecord. Most amount columns default to 0
 * / null the way a freshly-generated payroll row typically looks — tests
 * override only the fields they care about.
 */
function makeRecord(overrides: Partial<PayrollRecord> = {}): PayrollRecord {
  return {
    id: "payroll-1",
    user_id: "user-1",
    branch_id: "branch-1",
    month: 6,
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
    created_at: "2026-06-01T00:00:00Z",
    created_by: "admin-1",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarizePayslip", () => {
  it("excludes zero/null lines for a record with only basic salary populated", () => {
    const record = makeRecord({ basic_salary: 3000, net_salary: 3000 });
    const summary = summarizePayslip(record);

    expect(summary.earnings).toEqual([{ label: "Basic Salary", amount: 3000 }]);
    expect(summary.deductions).toEqual([]);
    expect(summary.net).toBe(3000);
  });

  it("includes several populated earnings and deduction lines for a fuller record", () => {
    const record = makeRecord({
      basic_salary: 3000,
      allowances: 200,
      other_allowances: 50,
      overtime_amount: 120,
      claims_amount: 80,
      epf_employee: 330,
      socso_employee: 24.75,
      eis_employee: 6.3,
      pcb_amount: 45,
      late_deduction: 15,
      unpaid_leave_deduction: 100,
      net_salary: 2828.95,
    });

    const summary = summarizePayslip(record);

    expect(summary.earnings).toEqual([
      { label: "Basic Salary", amount: 3000 },
      { label: "Allowances", amount: 200 },
      { label: "Other Allowances", amount: 50 },
      { label: "Overtime", amount: 120 },
      { label: "Claims", amount: 80 },
    ]);
    expect(summary.deductions).toEqual([
      { label: "EPF (Employee)", amount: 330 },
      { label: "SOCSO (Employee)", amount: 24.75 },
      { label: "EIS (Employee)", amount: 6.3 },
      { label: "PCB", amount: 45 },
      { label: "Late Deduction", amount: 15 },
      { label: "Unpaid Leave Deduction", amount: 100 },
    ]);
    expect(summary.net).toBe(2828.95);
  });

  it("excludes an advance/other/absent deduction line when its amount is zero", () => {
    const record = makeRecord({
      advance_deduction: 0,
      other_deductions: 0,
      absent_deduction: 0,
    });
    const summary = summarizePayslip(record);
    expect(summary.deductions).toEqual([]);
  });
});
