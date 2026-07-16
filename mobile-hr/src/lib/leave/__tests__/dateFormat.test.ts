import { isValidDateString } from "../../leave";

describe("isValidDateString", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidDateString("2026-07-16")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidDateString("")).toBe(false);
  });

  it("rejects a non yyyy-MM-dd shaped string", () => {
    expect(isValidDateString("16/07/2026")).toBe(false);
    expect(isValidDateString("2026-7-16")).toBe(false);
  });

  it("rejects an out-of-range month or day", () => {
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-02-31")).toBe(false);
  });
});
