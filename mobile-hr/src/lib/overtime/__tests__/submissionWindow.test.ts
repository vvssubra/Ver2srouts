import { isWithinSubmissionWindow } from "../../overtime";

// Mirrors the server-side `enforce_ot_submission_window` trigger: an
// overtime request's date must fall in the previous, same, or next
// calendar month relative to the submission date.
describe("isWithinSubmissionWindow", () => {
  const referenceDate = "2026-07-16";

  it("allows a date in the previous calendar month", () => {
    expect(isWithinSubmissionWindow("2026-06-01", referenceDate)).toBe(true);
    expect(isWithinSubmissionWindow("2026-06-30", referenceDate)).toBe(true);
  });

  it("allows a date in the same calendar month", () => {
    expect(isWithinSubmissionWindow("2026-07-01", referenceDate)).toBe(true);
    expect(isWithinSubmissionWindow("2026-07-16", referenceDate)).toBe(true);
  });

  it("allows a date in the next calendar month", () => {
    expect(isWithinSubmissionWindow("2026-08-01", referenceDate)).toBe(true);
    expect(isWithinSubmissionWindow("2026-08-31", referenceDate)).toBe(true);
  });

  it("rejects a date two months away", () => {
    expect(isWithinSubmissionWindow("2026-09-01", referenceDate)).toBe(false);
    expect(isWithinSubmissionWindow("2026-05-01", referenceDate)).toBe(false);
  });

  it("handles the window correctly across a year boundary", () => {
    expect(isWithinSubmissionWindow("2027-01-05", "2026-12-20")).toBe(true);
    expect(isWithinSubmissionWindow("2026-11-05", "2026-12-20")).toBe(true);
    expect(isWithinSubmissionWindow("2027-02-01", "2026-12-20")).toBe(false);
  });

  it("returns false for a malformed date string rather than throwing", () => {
    expect(isWithinSubmissionWindow("not-a-date", referenceDate)).toBe(false);
  });
});
