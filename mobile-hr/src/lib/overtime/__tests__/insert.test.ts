import { buildOvertimeInsert, deriveOvertimeInsertStatus, firstOfMonthDateString } from "../../overtime";

describe("buildOvertimeInsert", () => {
  it("builds an on-time insert payload with a trimmed reason", () => {
    const insert = buildOvertimeInsert({
      userId: "user-1",
      branchId: "branch-1",
      date: "2026-07-16",
      startDateTime: "2026-07-16T18:00:00",
      endDateTime: "2026-07-16T20:30:00",
      hours: 2.5,
      reason: "  Covered late pickup  ",
      submittedAt: "2026-07-16T12:00:00.000Z",
      payrollMonth: "2026-07-01",
      isLateSubmission: false,
    });

    expect(insert).toEqual({
      user_id: "user-1",
      branch_id: "branch-1",
      date: "2026-07-16",
      start_time: "2026-07-16T18:00:00",
      end_time: "2026-07-16T20:30:00",
      hours: 2.5,
      reason: "Covered late pickup",
      status: "pending_approval",
      ot_month: "2026-07-01",
      payroll_month: "2026-07-01",
      is_late_submission: false,
      submitted_at: "2026-07-16T12:00:00.000Z",
    });
  });

  it("uses late_pending_approval and the RPC's payroll_month when the submission is late", () => {
    const insert = buildOvertimeInsert({
      userId: "user-1",
      branchId: "branch-1",
      date: "2026-06-30",
      startDateTime: "2026-06-30T18:00:00",
      endDateTime: "2026-06-30T20:00:00",
      hours: 2,
      reason: "Late OT",
      submittedAt: "2026-07-16T12:00:00.000Z",
      payrollMonth: "2026-07-01",
      isLateSubmission: true,
    });

    expect(insert.status).toBe("late_pending_approval");
    expect(insert.is_late_submission).toBe(true);
    expect(insert.payroll_month).toBe("2026-07-01");
    expect(insert.ot_month).toBe("2026-06-01");
  });
});

describe("deriveOvertimeInsertStatus", () => {
  it("returns pending_approval when not late", () => {
    expect(deriveOvertimeInsertStatus(false)).toBe("pending_approval");
  });

  it("returns late_pending_approval when late", () => {
    expect(deriveOvertimeInsertStatus(true)).toBe("late_pending_approval");
  });
});

describe("firstOfMonthDateString", () => {
  it("returns the first of the month for a valid date", () => {
    expect(firstOfMonthDateString("2026-07-16")).toBe("2026-07-01");
  });

  it("returns null for an invalid date", () => {
    expect(firstOfMonthDateString("not-a-date")).toBeNull();
  });
});
