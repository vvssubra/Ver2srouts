import { buildShiftTimestamps, computeHours } from "../../overtime";

describe("computeHours", () => {
  it("computes a whole-hour shift", () => {
    expect(computeHours("2026-07-16T09:00:00", "2026-07-16T17:00:00")).toBe(8);
  });

  it("computes a fractional shift rounded to 2 decimal places", () => {
    expect(computeHours("2026-07-16T09:00:00", "2026-07-16T11:30:00")).toBe(2.5);
  });

  it("rounds to 2 decimal places for odd minute spans", () => {
    // 100 minutes = 1.6666... hours -> 1.67
    expect(computeHours("2026-07-16T09:00:00", "2026-07-16T10:40:00")).toBe(1.67);
  });

  it("computes an overnight shift whose end datetime already encodes the next day", () => {
    expect(computeHours("2026-07-16T22:00:00", "2026-07-17T02:00:00")).toBe(4);
  });

  it("returns 0 when end is not after start (invalid input, per this module's documented assumption)", () => {
    // Caller is required to pass full datetimes that already encode the
    // correct day. If end <= start, that's invalid input — this returns 0
    // rather than throwing, so render logic can call it before a full
    // shift has been entered without needing a try/catch.
    expect(computeHours("2026-07-16T22:00:00", "2026-07-16T02:00:00")).toBe(0);
    expect(computeHours("2026-07-16T09:00:00", "2026-07-16T09:00:00")).toBe(0);
  });

  it("returns 0 for unparseable datetime strings", () => {
    expect(computeHours("not-a-date", "2026-07-16T17:00:00")).toBe(0);
    expect(computeHours("2026-07-16T09:00:00", "also-not-a-date")).toBe(0);
  });
});

describe("buildShiftTimestamps", () => {
  it("keeps the same calendar day when end time is after start time", () => {
    expect(buildShiftTimestamps("2026-07-16", "09:00", "17:00")).toEqual({
      startDateTime: "2026-07-16T09:00:00",
      endDateTime: "2026-07-16T17:00:00",
    });
  });

  it("rolls the end date to the next day for an overnight shift", () => {
    expect(buildShiftTimestamps("2026-07-16", "22:00", "02:00")).toEqual({
      startDateTime: "2026-07-16T22:00:00",
      endDateTime: "2026-07-17T02:00:00",
    });
  });

  it("rolls over across a month/year boundary", () => {
    expect(buildShiftTimestamps("2026-12-31", "23:00", "01:00")).toEqual({
      startDateTime: "2026-12-31T23:00:00",
      endDateTime: "2027-01-01T01:00:00",
    });
  });
});
