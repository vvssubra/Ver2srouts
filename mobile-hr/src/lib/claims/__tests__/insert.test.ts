import { buildClaimInsert, resolveBranchId, claimTypeLabel, formatAmount } from "../../claims";

describe("resolveBranchId", () => {
  it("returns null when there are no memberships", () => {
    expect(resolveBranchId([])).toBeNull();
  });

  it("returns the first membership's branch id", () => {
    expect(resolveBranchId([{ branch_id: "branch-1" }, { branch_id: "branch-2" }])).toBe(
      "branch-1"
    );
  });
});

describe("buildClaimInsert", () => {
  it("builds an insert payload with status pending", () => {
    expect(
      buildClaimInsert({
        userId: "user-1",
        branchId: "branch-1",
        claimType: "transport",
        description: "  Grab to training  ",
        amount: 25.5,
        claimDate: "2026-07-16",
        receiptUrl: null,
      })
    ).toEqual({
      user_id: "user-1",
      branch_id: "branch-1",
      claim_type: "transport",
      description: "Grab to training",
      amount: 25.5,
      claim_date: "2026-07-16",
      receipt_url: null,
      status: "pending",
    });
  });

  it("carries a receipt url through untouched", () => {
    const insert = buildClaimInsert({
      userId: "user-1",
      branchId: "branch-1",
      claimType: "meal",
      description: "Lunch with visiting inspector",
      amount: 40,
      claimDate: "2026-07-16",
      receiptUrl: "https://example.com/receipt.jpg",
    });
    expect(insert.receipt_url).toBe("https://example.com/receipt.jpg");
  });
});

describe("claimTypeLabel", () => {
  it("labels every known claim type", () => {
    expect(claimTypeLabel("transport")).toBe("Transport");
    expect(claimTypeLabel("meal")).toBe("Meal");
    expect(claimTypeLabel("medical")).toBe("Medical");
    expect(claimTypeLabel("training")).toBe("Training");
    expect(claimTypeLabel("equipment")).toBe("Equipment");
    expect(claimTypeLabel("other")).toBe("Other");
  });

  it("falls back to the raw value for an unrecognized type", () => {
    expect(claimTypeLabel("flight")).toBe("flight");
  });
});

describe("formatAmount", () => {
  it("formats to two decimal places with an RM prefix", () => {
    expect(formatAmount(25.5)).toBe("RM 25.50");
    expect(formatAmount(3)).toBe("RM 3.00");
    expect(formatAmount(1234.5)).toBe("RM 1234.50");
  });
});
