import {
  clockStatusCopy,
  deriveClockStatus,
  pendingRequestsMessage,
  remainingDays,
  todayDateString,
} from "../../home";
import type { StaffAttendance } from "../../hr-types";

function attendance(overrides: Partial<StaffAttendance> = {}): StaffAttendance {
  return {
    id: "att-1",
    user_id: "user-1",
    branch_id: "branch-1",
    date: "2026-07-16",
    clock_in: null,
    clock_in_latitude: null,
    clock_in_longitude: null,
    clock_out: null,
    clock_out_latitude: null,
    clock_out_longitude: null,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    geofence_note: null,
    is_outside_geofence: null,
    notes: null,
    selfie_url: null,
    ...overrides,
  };
}

describe("deriveClockStatus", () => {
  const now = new Date("2026-07-16T09:00:00.000Z");

  it("returns not_clocked_in when there is no row at all", () => {
    expect(deriveClockStatus(null, now)).toBe("not_clocked_in");
  });

  it("returns not_clocked_in when the row exists but clock_in is null", () => {
    expect(deriveClockStatus(attendance({ clock_in: null }), now)).toBe("not_clocked_in");
  });

  it("returns not_clocked_in when the row exists but both clock_in and clock_out are null (boundary)", () => {
    expect(
      deriveClockStatus(attendance({ clock_in: null, clock_out: null }), now)
    ).toBe("not_clocked_in");
  });

  it("returns clocked_in when clock_in is set and clock_out is null", () => {
    expect(
      deriveClockStatus(attendance({ clock_in: "2026-07-16T09:00:00.000Z", clock_out: null }), now)
    ).toBe("clocked_in");
  });

  it("returns completed when both clock_in and clock_out are set", () => {
    expect(
      deriveClockStatus(
        attendance({ clock_in: "2026-07-16T09:00:00.000Z", clock_out: "2026-07-16T17:00:00.000Z" }),
        now
      )
    ).toBe("completed");
  });
});

describe("clockStatusCopy", () => {
  it("has copy for every status", () => {
    expect(clockStatusCopy("not_clocked_in").title).toBeTruthy();
    expect(clockStatusCopy("clocked_in").title).toBeTruthy();
    expect(clockStatusCopy("completed").title).toBeTruthy();
  });
});

describe("remainingDays", () => {
  it("subtracts used from total", () => {
    expect(remainingDays(14, 4)).toBe(10);
  });

  it("floors at 0 when used equals total", () => {
    expect(remainingDays(14, 14)).toBe(0);
  });

  it("never goes negative when used overflows total", () => {
    expect(remainingDays(14, 20)).toBe(0);
  });

  it("handles zero total gracefully", () => {
    expect(remainingDays(0, 0)).toBe(0);
  });
});

describe("todayDateString", () => {
  it("formats as yyyy-MM-dd using local date parts", () => {
    expect(todayDateString(new Date(2026, 6, 16, 23, 30))).toBe("2026-07-16");
  });

  it("zero-pads single digit months and days", () => {
    expect(todayDateString(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });
});

describe("pendingRequestsMessage", () => {
  it("returns null when there are no pending requests", () => {
    expect(pendingRequestsMessage(0)).toBeNull();
  });

  it("returns a singular message for exactly one pending request", () => {
    expect(pendingRequestsMessage(1)).toBe("You have 1 pending request");
  });

  it("returns a plural message for more than one pending request", () => {
    expect(pendingRequestsMessage(3)).toBe("You have 3 pending requests");
  });
});
