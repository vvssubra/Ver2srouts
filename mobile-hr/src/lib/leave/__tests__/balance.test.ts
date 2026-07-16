import { remainingBalance, remainingCustomBalance } from "../../leave";
import type { LeaveBalance, CustomLeaveBalance } from "../../hr-types";

function makeBalance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  return {
    id: "bal-1",
    user_id: "user-1",
    branch_id: "branch-1",
    year: 2026,
    annual_total: 14,
    annual_used: 4,
    birthday_total: 1,
    birthday_used: 0,
    compassionate_total: 3,
    compassionate_used: 0,
    emergency_total: 3,
    emergency_used: 0,
    hospitalisation_total: 60,
    hospitalisation_used: 0,
    maternity_total: 98,
    maternity_used: 0,
    medical_total: 14,
    medical_used: 14,
    paternity_total: 7,
    paternity_used: 0,
    replacement_total: 0,
    replacement_used: 0,
    unpaid_total: null,
    unpaid_used: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("remainingBalance", () => {
  it("returns total minus used for annual leave", () => {
    expect(remainingBalance("annual", makeBalance())).toBe(10);
  });

  it("floors at 0 when used has exceeded total (e.g. medical fully used)", () => {
    expect(remainingBalance("medical", makeBalance())).toBe(0);
  });

  it("floors at 0 rather than going negative when used somehow exceeds total", () => {
    expect(remainingBalance("annual", makeBalance({ annual_total: 5, annual_used: 9 }))).toBe(0);
  });

  it("returns Infinity for unpaid leave regardless of the balance row, since unpaid leave isn't balance-limited", () => {
    expect(remainingBalance("unpaid", makeBalance())).toBe(Infinity);
    expect(remainingBalance("unpaid", null)).toBe(Infinity);
  });

  it("falls back to 0 for a null balance row instead of crashing", () => {
    expect(remainingBalance("annual", null)).toBe(0);
  });
});

function makeCustomBalance(overrides: Partial<CustomLeaveBalance> = {}): CustomLeaveBalance {
  return {
    id: "cbal-1",
    user_id: "user-1",
    branch_id: "branch-1",
    custom_leave_type_id: "ct-1",
    year: 2026,
    total: 5,
    used: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("remainingCustomBalance", () => {
  it("returns total minus used when a balance row exists", () => {
    expect(remainingCustomBalance(makeCustomBalance(), 5)).toBe(3);
  });

  it("floors at 0 when used exceeds total", () => {
    expect(remainingCustomBalance(makeCustomBalance({ total: 2, used: 5 }), 2)).toBe(0);
  });

  it("falls back to the custom type's default_days when no balance row has been assigned yet", () => {
    expect(remainingCustomBalance(null, 4)).toBe(4);
  });

  it("falls back to 0 when there's no balance row and no default either", () => {
    expect(remainingCustomBalance(null, 0)).toBe(0);
  });
});
