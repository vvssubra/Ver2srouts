import { deriveLeaveDisplayStatus, type LeaveDisplayStatusRow } from "../../leave";

function makeRow(overrides: Partial<LeaveDisplayStatusRow> = {}): LeaveDisplayStatusRow {
  return {
    status: "pending",
    level1_status: "pending",
    level2_status: "pending",
    max_approval_level: 1,
    ...overrides,
  };
}

describe("deriveLeaveDisplayStatus", () => {
  it("shows Rejected when the overall status is rejected", () => {
    expect(deriveLeaveDisplayStatus(makeRow({ status: "rejected" }))).toBe("Rejected");
  });

  it("shows Cancelled when the overall status is cancelled", () => {
    expect(deriveLeaveDisplayStatus(makeRow({ status: "cancelled" }))).toBe("Cancelled");
  });

  it("shows Approved once the overall status is approved", () => {
    expect(deriveLeaveDisplayStatus(makeRow({ status: "approved" }))).toBe("Approved");
  });

  it("shows Approved for a single-level workflow once level1 has approved", () => {
    expect(
      deriveLeaveDisplayStatus(
        makeRow({ max_approval_level: 1, level1_status: "approved", status: "pending" })
      )
    ).toBe("Approved");
  });

  it("shows Pending for a single-level workflow still awaiting level1", () => {
    expect(
      deriveLeaveDisplayStatus(makeRow({ max_approval_level: 1, level1_status: "pending" }))
    ).toBe("Pending");
  });

  it("shows 'Awaiting final approval' for a two-level workflow once level1 has approved but level2 hasn't", () => {
    expect(
      deriveLeaveDisplayStatus(
        makeRow({
          max_approval_level: 2,
          level1_status: "approved",
          level2_status: "pending",
          status: "pending",
        })
      )
    ).toBe("Awaiting final approval");
  });

  it("shows Approved for a two-level workflow once level2 has approved", () => {
    expect(
      deriveLeaveDisplayStatus(
        makeRow({
          max_approval_level: 2,
          level1_status: "approved",
          level2_status: "approved",
          status: "pending",
        })
      )
    ).toBe("Approved");
  });

  it("shows Pending for a two-level workflow before level1 has approved", () => {
    expect(
      deriveLeaveDisplayStatus(
        makeRow({ max_approval_level: 2, level1_status: "pending", level2_status: "pending" })
      )
    ).toBe("Pending");
  });
});
