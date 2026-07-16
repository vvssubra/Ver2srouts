import { resolveBranchId, validateOvertimeRequest } from "../../overtime";

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

describe("validateOvertimeRequest", () => {
  const validInput = {
    date: "2026-07-16",
    startTime: "18:00",
    endTime: "20:30",
    hours: 2.5,
    reason: "Covered late pickup for delayed parents",
  };

  it("accepts a fully valid submission", () => {
    expect(validateOvertimeRequest(validInput)).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(validateOvertimeRequest({ ...validInput, date: "16-07-2026" })).toMatch(/date/i);
  });

  it("rejects a malformed time", () => {
    expect(validateOvertimeRequest({ ...validInput, startTime: "6pm" })).toMatch(/time/i);
    expect(validateOvertimeRequest({ ...validInput, endTime: "25:00" })).toMatch(/time/i);
  });

  it("rejects when computed hours are not positive (end not after start)", () => {
    expect(validateOvertimeRequest({ ...validInput, hours: 0 })).toMatch(/after/i);
    expect(validateOvertimeRequest({ ...validInput, hours: -1 })).toMatch(/after/i);
  });

  it("rejects a blank reason", () => {
    expect(validateOvertimeRequest({ ...validInput, reason: "   " })).toMatch(/reason/i);
  });
});
