import { formatPayPeriod } from "../../payslips";

describe("formatPayPeriod", () => {
  it("formats a mid-year month", () => {
    expect(formatPayPeriod(6, 2026)).toBe("June 2026");
  });

  it("formats January correctly (1-indexed month)", () => {
    expect(formatPayPeriod(1, 2026)).toBe("January 2026");
  });

  it("formats December correctly, distinct from the January rollover", () => {
    expect(formatPayPeriod(12, 2025)).toBe("December 2025");
    expect(formatPayPeriod(1, 2026)).toBe("January 2026");
  });
});
