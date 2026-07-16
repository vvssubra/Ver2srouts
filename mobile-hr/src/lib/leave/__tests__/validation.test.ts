import { validateLeaveRequest } from "../../leave";

const baseInput = {
  leaveType: "annual",
  startDate: "2026-07-16",
  endDate: "2026-07-17",
  days: 2,
  reason: "Family trip",
  hasAttachment: false,
  customType: null as { requires_attachment: boolean } | null,
};

describe("validateLeaveRequest", () => {
  it("passes on a valid annual leave request within balance", () => {
    expect(validateLeaveRequest(baseInput, 10)).toBeNull();
  });

  it("allows reason to be omitted entirely", () => {
    const { reason, ...rest } = baseInput;
    expect(validateLeaveRequest(rest, 10)).toBeNull();
  });

  it("rejects a missing start date", () => {
    expect(validateLeaveRequest({ ...baseInput, startDate: "" }, 10)).toEqual(
      expect.any(String)
    );
  });

  it("rejects a missing end date", () => {
    expect(validateLeaveRequest({ ...baseInput, endDate: "" }, 10)).toEqual(expect.any(String));
  });

  it("rejects an end date before the start date", () => {
    expect(
      validateLeaveRequest({ ...baseInput, startDate: "2026-07-17", endDate: "2026-07-16" }, 10)
    ).toEqual(expect.any(String));
  });

  it("rejects a request that exceeds the remaining balance", () => {
    expect(validateLeaveRequest({ ...baseInput, days: 11 }, 10)).toEqual(expect.any(String));
  });

  it("allows a request that exactly matches the remaining balance", () => {
    expect(validateLeaveRequest({ ...baseInput, days: 10 }, 10)).toBeNull();
  });

  it("skips the balance check entirely when remaining is Infinity (unpaid leave)", () => {
    expect(
      validateLeaveRequest({ ...baseInput, leaveType: "unpaid", days: 365 }, Infinity)
    ).toBeNull();
  });

  it("rejects a medical leave request with no attachment", () => {
    expect(
      validateLeaveRequest({ ...baseInput, leaveType: "medical", hasAttachment: false }, 10)
    ).toEqual(expect.any(String));
  });

  it("passes a medical leave request once an attachment is attached", () => {
    expect(
      validateLeaveRequest({ ...baseInput, leaveType: "medical", hasAttachment: true }, 10)
    ).toBeNull();
  });

  it("rejects a custom leave type flagged requires_attachment with no attachment", () => {
    expect(
      validateLeaveRequest(
        {
          ...baseInput,
          leaveType: "custom",
          hasAttachment: false,
          customType: { requires_attachment: true },
        },
        10
      )
    ).toEqual(expect.any(String));
  });
});
