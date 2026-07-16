import { describe, it, expect } from "vitest";
import { isScheduledWorkDay } from "../expected-staff";

describe("isScheduledWorkDay", () => {
  const mon = new Date("2026-07-13"); // Monday
  const sat = new Date("2026-07-11"); // Saturday
  const sun = new Date("2026-07-12"); // Sunday

  it("defaults weekdays on, weekends off when no schedule", () => {
    expect(isScheduledWorkDay(null, null, mon)).toBe(true);
    expect(isScheduledWorkDay(null, null, sat)).toBe(false);
    expect(isScheduledWorkDay(null, null, sun)).toBe(false);
  });

  it("intern is never scheduled on Sat/Sun", () => {
    expect(isScheduledWorkDay({ "6": { start: "08:00", end: "17:00" } }, "intern", sat)).toBe(false);
    expect(isScheduledWorkDay(null, "intern", sun)).toBe(false);
    expect(isScheduledWorkDay(null, "intern", mon)).toBe(true);
  });

  it("respects explicit false / null in schedule", () => {
    expect(isScheduledWorkDay({ "1": false }, null, mon)).toBe(false);
    expect(isScheduledWorkDay({ monday: null }, null, mon)).toBe(false);
  });

  it("counts Saturday shifts (including half-days) as scheduled", () => {
    expect(isScheduledWorkDay({ "6": { start: "08:00", end: "13:00" } }, "full_time", sat)).toBe(true);
  });
});
