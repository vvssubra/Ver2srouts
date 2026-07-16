import {
  buildClockInInsert,
  buildClockOutUpdate,
  buildGeofenceNote,
  buildLastSevenDays,
  ClockActionError,
  deriveClockStatus,
  deriveDayStatus,
  formatTimeOfDay,
  resolveBranchId,
  todayDateString,
  type GeofenceCheckResult,
} from "../../attendance";

describe("deriveClockStatus", () => {
  it("is not_clocked_in when there is no row", () => {
    expect(deriveClockStatus(null)).toBe("not_clocked_in");
    expect(deriveClockStatus(undefined)).toBe("not_clocked_in");
  });

  it("is not_clocked_in when the row has no clock_in yet", () => {
    expect(deriveClockStatus({ date: "2026-07-16", clock_in: null, clock_out: null })).toBe(
      "not_clocked_in"
    );
  });

  it("is clocked_in once clock_in is set but clock_out is not", () => {
    expect(
      deriveClockStatus({ date: "2026-07-16", clock_in: "2026-07-16T01:00:00Z", clock_out: null })
    ).toBe("clocked_in");
  });

  it("is clocked_out once both are set", () => {
    expect(
      deriveClockStatus({
        date: "2026-07-16",
        clock_in: "2026-07-16T01:00:00Z",
        clock_out: "2026-07-16T09:00:00Z",
      })
    ).toBe("clocked_out");
  });
});

describe("deriveDayStatus", () => {
  it("maps missing/no-clock-in rows to absent", () => {
    expect(deriveDayStatus(null)).toBe("absent");
    expect(deriveDayStatus({ date: "2026-07-16", clock_in: null, clock_out: null })).toBe("absent");
  });

  it("maps an open shift to present", () => {
    expect(
      deriveDayStatus({ date: "2026-07-16", clock_in: "2026-07-16T01:00:00Z", clock_out: null })
    ).toBe("present");
  });

  it("maps a closed shift to completed", () => {
    expect(
      deriveDayStatus({
        date: "2026-07-16",
        clock_in: "2026-07-16T01:00:00Z",
        clock_out: "2026-07-16T09:00:00Z",
      })
    ).toBe("completed");
  });
});

describe("buildLastSevenDays", () => {
  const today = new Date("2026-07-16T12:00:00");

  it("returns 7 entries, today first, most recent to oldest", () => {
    const days = buildLastSevenDays([], today);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-07-16");
    expect(days[6].date).toBe("2026-07-10");
  });

  it("marks past days with no matching row as absent", () => {
    const days = buildLastSevenDays([], today);
    expect(days.slice(1).every((d) => d.status === "absent")).toBe(true);
  });

  it("marks today with no matching row as pending, not absent (the day isn't over yet)", () => {
    // Regression: showing "Absent" for a day still in progress directly
    // contradicts the status card above this list, which correctly says
    // "Not clocked in yet" for the same day.
    const days = buildLastSevenDays([], today);
    expect(days[0]).toMatchObject({ date: "2026-07-16", status: "pending" });
  });

  it("merges in existing rows and derives their status", () => {
    const days = buildLastSevenDays(
      [
        { date: "2026-07-16", clock_in: "2026-07-16T01:00:00Z", clock_out: null },
        {
          date: "2026-07-15",
          clock_in: "2026-07-15T01:00:00Z",
          clock_out: "2026-07-15T09:00:00Z",
        },
      ],
      today
    );
    expect(days[0]).toMatchObject({ date: "2026-07-16", status: "present" });
    expect(days[1]).toMatchObject({ date: "2026-07-15", status: "completed" });
    expect(days[2]).toMatchObject({ date: "2026-07-14", status: "absent" });
  });
});

describe("resolveBranchId", () => {
  it("returns null when there are no memberships", () => {
    expect(resolveBranchId([])).toBeNull();
  });

  it("takes the first membership's branch_id (v1 single-branch assumption)", () => {
    expect(resolveBranchId([{ branch_id: "b1" }, { branch_id: "b2" }])).toBe("b1");
  });
});

describe("todayDateString", () => {
  it("formats a Date as yyyy-MM-dd", () => {
    expect(todayDateString(new Date("2026-07-16T23:30:00"))).toBe("2026-07-16");
  });
});

describe("formatTimeOfDay", () => {
  it("shows a placeholder for null", () => {
    expect(formatTimeOfDay(null)).toBe("—");
  });

  it("formats an ISO timestamp as h:mm AM/PM", () => {
    const iso = new Date(2026, 6, 16, 9, 4).toISOString();
    expect(formatTimeOfDay(iso)).toBe("9:04 AM");
  });
});

describe("buildGeofenceNote", () => {
  it("describes the distance and radius, rounded", () => {
    expect(buildGeofenceNote(123.6, 50)).toBe("124m away (outside the 50m geofence)");
  });

  it("appends a trimmed reason when provided", () => {
    expect(buildGeofenceNote(123, 50, "  Delivering supplies to another site  ")).toBe(
      "123m away (outside the 50m geofence) — Delivering supplies to another site"
    );
  });

  it("ignores a blank reason", () => {
    expect(buildGeofenceNote(123, 50, "   ")).toBe("123m away (outside the 50m geofence)");
  });
});

const insideGeofence: GeofenceCheckResult = {
  configured: true,
  withinRadius: true,
  distanceMeters: 5,
  radiusMeters: 50,
};

const outsideGeofence: GeofenceCheckResult = {
  configured: true,
  withinRadius: false,
  distanceMeters: 240,
  radiusMeters: 50,
};

const noGeofence: GeofenceCheckResult = {
  configured: false,
  withinRadius: true,
  distanceMeters: null,
  radiusMeters: null,
};

describe("buildClockInInsert", () => {
  const base = {
    userId: "user-1",
    branchId: "branch-1",
    date: "2026-07-16",
    clockInIso: "2026-07-16T01:00:00.000Z",
    latitude: 1.3,
    longitude: 103.8,
  };

  it("inserts a plain clock-in with no geofence flags when within radius", () => {
    const insert = buildClockInInsert({ ...base, geofence: insideGeofence });
    expect(insert).toMatchObject({
      user_id: "user-1",
      branch_id: "branch-1",
      date: "2026-07-16",
      clock_in: "2026-07-16T01:00:00.000Z",
      clock_in_latitude: 1.3,
      clock_in_longitude: 103.8,
      is_outside_geofence: false,
      selfie_url: null,
      geofence_note: null,
    });
  });

  it("inserts a plain clock-in with no geofence flags when no geofence is configured", () => {
    const insert = buildClockInInsert({ ...base, geofence: noGeofence });
    expect(insert.is_outside_geofence).toBe(false);
    expect(insert.selfie_url).toBeNull();
    expect(insert.geofence_note).toBeNull();
  });

  it("flags outside-geofence clock-ins and attaches the selfie + note", () => {
    const insert = buildClockInInsert({
      ...base,
      geofence: outsideGeofence,
      selfieUrl: "https://example.com/selfie.jpg",
      reason: "Off-site training",
    });
    expect(insert.is_outside_geofence).toBe(true);
    expect(insert.selfie_url).toBe("https://example.com/selfie.jpg");
    expect(insert.geofence_note).toBe("240m away (outside the 50m geofence) — Off-site training");
  });
});

describe("ClockActionError", () => {
  it("carries a kind and message for the screen to branch on", () => {
    const error = new ClockActionError("location", "Location access is required.");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("location");
    expect(error.message).toBe("Location access is required.");
  });
});

describe("buildClockOutUpdate", () => {
  const base = {
    clockOutIso: "2026-07-16T09:00:00.000Z",
    latitude: 1.3,
    longitude: 103.8,
  };

  it("only sets clock_out fields when within radius", () => {
    const update = buildClockOutUpdate({ ...base, geofence: insideGeofence });
    expect(update).toEqual({
      clock_out: "2026-07-16T09:00:00.000Z",
      clock_out_latitude: 1.3,
      clock_out_longitude: 103.8,
    });
  });

  it("adds geofence flags, selfie, and note when outside radius", () => {
    const update = buildClockOutUpdate({
      ...base,
      geofence: outsideGeofence,
      selfieUrl: "https://example.com/selfie-out.jpg",
    });
    expect(update.is_outside_geofence).toBe(true);
    expect(update.selfie_url).toBe("https://example.com/selfie-out.jpg");
    expect(update.geofence_note).toBe("240m away (outside the 50m geofence)");
  });
});
