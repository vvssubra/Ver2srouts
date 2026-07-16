import { buildLeaveRequestInsert, buildCancelLeaveRequestUpdate, leaveTypeLabel } from "../../leave";
import type { CustomLeaveType } from "../../hr-types";

describe("buildLeaveRequestInsert", () => {
  it("builds an insert payload for a standard leave type", () => {
    expect(
      buildLeaveRequestInsert({
        userId: "user-1",
        branchId: "branch-1",
        leaveType: "annual",
        startDate: "2026-07-16",
        endDate: "2026-07-17",
        days: 2,
        isHalfDay: false,
        reason: "  Family trip  ",
        attachmentUrl: null,
      })
    ).toEqual({
      user_id: "user-1",
      branch_id: "branch-1",
      leave_type: "annual",
      custom_leave_type_id: null,
      start_date: "2026-07-16",
      end_date: "2026-07-17",
      days: 2,
      is_half_day: false,
      reason: "Family trip",
      attachment_url: null,
      status: "pending",
    });
  });

  it("trims whitespace-only reason down to null", () => {
    const insert = buildLeaveRequestInsert({
      userId: "user-1",
      branchId: "branch-1",
      leaveType: "annual",
      startDate: "2026-07-16",
      endDate: "2026-07-16",
      days: 1,
      isHalfDay: false,
      reason: "   ",
    });
    expect(insert.reason).toBeNull();
  });

  it("carries the custom_leave_type_id when the leave type is custom", () => {
    const insert = buildLeaveRequestInsert({
      userId: "user-1",
      branchId: "branch-1",
      leaveType: "custom",
      customLeaveTypeId: "ct-1",
      startDate: "2026-07-16",
      endDate: "2026-07-16",
      days: 1,
      isHalfDay: false,
      attachmentUrl: "https://example.com/doc.pdf",
    });
    expect(insert.custom_leave_type_id).toBe("ct-1");
    expect(insert.attachment_url).toBe("https://example.com/doc.pdf");
    expect(insert.status).toBe("pending");
  });
});

describe("buildCancelLeaveRequestUpdate", () => {
  it("sets status to cancelled and stamps cancelled_by/cancelled_at", () => {
    const update = buildCancelLeaveRequestUpdate("user-1", "2026-07-16T10:00:00.000Z");
    expect(update).toEqual({
      status: "cancelled",
      cancelled_by: "user-1",
      cancelled_at: "2026-07-16T10:00:00.000Z",
    });
  });
});

describe("leaveTypeLabel", () => {
  const customTypes: CustomLeaveType[] = [
    {
      id: "ct-1",
      branch_id: "branch-1",
      code: "volunteer",
      name: "Volunteer Day",
      default_days: 2,
      paid: true,
      requires_attachment: false,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      created_by: null,
    },
  ];

  it("labels a standard leave type", () => {
    expect(leaveTypeLabel({ leave_type: "annual", custom_leave_type_id: null }, customTypes)).toBe(
      "Annual"
    );
  });

  it("looks up a custom leave type's name by id", () => {
    expect(
      leaveTypeLabel({ leave_type: "custom", custom_leave_type_id: "ct-1" }, customTypes)
    ).toBe("Volunteer Day");
  });

  it("falls back gracefully when a custom type can't be found", () => {
    expect(
      leaveTypeLabel({ leave_type: "custom", custom_leave_type_id: "missing" }, customTypes)
    ).toBe("Custom");
  });
});
