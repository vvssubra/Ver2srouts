import { deriveClaimDisplayStatus } from "../../claims";
import type { StaffClaim } from "../../hr-types";

function makeRow(overrides: Partial<StaffClaim>): StaffClaim {
  return {
    id: "claim-1",
    user_id: "user-1",
    branch_id: "branch-1",
    claim_type: "transport",
    description: "Test claim",
    amount: 10,
    claim_date: "2026-07-16",
    receipt_url: null,
    status: "pending",
    level1_status: "pending",
    level1_approved_by: null,
    level1_approved_at: null,
    level1_notes: null,
    level2_status: "pending",
    level2_approved_by: null,
    level2_approved_at: null,
    level2_notes: null,
    paid_at: null,
    paid_by: null,
    paid_via: null,
    payment_notes: null,
    payroll_month: null,
    payroll_year: null,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  } as StaffClaim;
}

describe("deriveClaimDisplayStatus", () => {
  it("returns pending while still awaiting first-level approval", () => {
    const row = makeRow({ level1_status: "pending", level2_status: "pending" });
    expect(deriveClaimDisplayStatus(row)).toBe("pending");
  });

  it("returns rejected when level1 rejected it", () => {
    const row = makeRow({ level1_status: "rejected", level2_status: "pending" });
    expect(deriveClaimDisplayStatus(row)).toBe("rejected");
  });

  it("returns rejected when level2 rejected it (even though level1 approved)", () => {
    const row = makeRow({ level1_status: "approved", level2_status: "rejected" });
    expect(deriveClaimDisplayStatus(row)).toBe("rejected");
  });

  it("returns approved when fully approved and no second level was needed", () => {
    // Branches that don't require L2 review have the backend mirror
    // level1's approval onto level2_status, so this is indistinguishable
    // from a real two-level approval from the row's point of view.
    const row = makeRow({ level1_status: "approved", level2_status: "approved" });
    expect(deriveClaimDisplayStatus(row)).toBe("approved");
  });

  it("returns pending when level1 approved but level2 hasn't decided yet", () => {
    const row = makeRow({ level1_status: "approved", level2_status: "pending" });
    expect(deriveClaimDisplayStatus(row)).toBe("pending");
  });

  it("returns paid once paid_at is set, even if statuses are approved", () => {
    const row = makeRow({
      level1_status: "approved",
      level2_status: "approved",
      paid_at: "2026-07-20T00:00:00.000Z",
    });
    expect(deriveClaimDisplayStatus(row)).toBe("paid");
  });

  it("prioritizes rejected over paid_at when both are somehow set", () => {
    const row = makeRow({
      level1_status: "rejected",
      paid_at: "2026-07-20T00:00:00.000Z",
    });
    expect(deriveClaimDisplayStatus(row)).toBe("rejected");
  });
});
