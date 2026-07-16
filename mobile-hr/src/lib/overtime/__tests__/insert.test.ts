import { buildOvertimeInsert } from "../../overtime";

describe("buildOvertimeInsert", () => {
  it("builds an insert payload with status pending and a trimmed reason", () => {
    const insert = buildOvertimeInsert({
      userId: "user-1",
      branchId: "branch-1",
      date: "2026-07-16",
      startDateTime: "2026-07-16T18:00:00",
      endDateTime: "2026-07-16T20:30:00",
      hours: 2.5,
      reason: "  Covered late pickup  ",
      submittedAt: "2026-07-16T12:00:00.000Z",
    });

    expect(insert).toEqual({
      user_id: "user-1",
      branch_id: "branch-1",
      date: "2026-07-16",
      start_time: "2026-07-16T18:00:00",
      end_time: "2026-07-16T20:30:00",
      hours: 2.5,
      reason: "Covered late pickup",
      status: "pending",
      submitted_at: "2026-07-16T12:00:00.000Z",
    });
  });
});
