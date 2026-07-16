import { computeDays } from "../../leave";

describe("computeDays", () => {
  it("counts a same-day request as 1 day", () => {
    expect(computeDays("2026-07-16", "2026-07-16", false)).toBe(1);
  });

  it("counts an inclusive multi-day range", () => {
    // 16th, 17th, 18th -> 3 days
    expect(computeDays("2026-07-16", "2026-07-18", false)).toBe(3);
  });

  it("counts a range spanning a month boundary inclusively", () => {
    // June 30th, July 1st -> 2 days
    expect(computeDays("2026-06-30", "2026-07-01", false)).toBe(2);
  });

  it("forces 0.5 for a half day regardless of the date range", () => {
    expect(computeDays("2026-07-16", "2026-07-16", true)).toBe(0.5);
    // Even a multi-day range collapses to 0.5 when isHalfDay is true — the
    // half-day flag always wins over the date span.
    expect(computeDays("2026-07-16", "2026-07-20", true)).toBe(0.5);
  });

  it("returns 0 when the end date is before the start date", () => {
    // Documented choice: an inverted range is treated as "no days" rather
    // than throwing, so callers (validateLeaveRequest) can surface a
    // friendly validation message instead of catching an exception.
    expect(computeDays("2026-07-16", "2026-07-15", false)).toBe(0);
  });
});
