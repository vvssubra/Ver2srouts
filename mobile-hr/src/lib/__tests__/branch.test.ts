import { resolveBranchId } from "../branch";

describe("resolveBranchId", () => {
  it("returns the first membership's branch_id", () => {
    expect(
      resolveBranchId([{ branch_id: "branch-1" }, { branch_id: "branch-2" }])
    ).toBe("branch-1");
  });

  it("returns null for an empty membership list", () => {
    expect(resolveBranchId([])).toBeNull();
  });
});
