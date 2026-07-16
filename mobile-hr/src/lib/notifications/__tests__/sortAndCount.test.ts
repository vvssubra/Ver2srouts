import type { NotificationRow } from "../../hr-types";
import { recognizeActionRoute, sortNotificationsByRecency, unreadCount } from "../../notifications";

function makeRow(overrides: Partial<NotificationRow> & { id: string }): NotificationRow {
  return {
    action_url: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    group_key: null,
    is_read: false,
    message: "message",
    priority: "normal",
    reference_id: null,
    title: "title",
    type: "general",
    user_id: "user-1",
    ...overrides,
  };
}

describe("sortNotificationsByRecency", () => {
  it("sorts descending by created_at given an out-of-order input array", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", created_at: "2026-01-10T09:00:00.000Z" }),
      makeRow({ id: "b", created_at: "2026-01-15T09:00:00.000Z" }),
      makeRow({ id: "c", created_at: "2026-01-05T09:00:00.000Z" }),
    ];

    const sorted = sortNotificationsByRecency(rows);

    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("is stable for equal timestamps, preserving original relative order", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", created_at: "2026-01-10T09:00:00.000Z" }),
      makeRow({ id: "b", created_at: "2026-01-10T09:00:00.000Z" }),
      makeRow({ id: "c", created_at: "2026-01-10T09:00:00.000Z" }),
    ];

    const sorted = sortNotificationsByRecency(rows);

    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", created_at: "2026-01-05T09:00:00.000Z" }),
      makeRow({ id: "b", created_at: "2026-01-15T09:00:00.000Z" }),
    ];
    const original = [...rows];

    sortNotificationsByRecency(rows);

    expect(rows).toEqual(original);
  });
});

describe("unreadCount", () => {
  it("counts a mix of read and unread rows", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", is_read: false }),
      makeRow({ id: "b", is_read: true }),
      makeRow({ id: "c", is_read: false }),
    ];

    expect(unreadCount(rows)).toBe(2);
  });

  it("returns 0 for an all-read array", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", is_read: true }),
      makeRow({ id: "b", is_read: true }),
    ];

    expect(unreadCount(rows)).toBe(0);
  });

  it("treats a nullish is_read as unread", () => {
    const rows: NotificationRow[] = [
      makeRow({ id: "a", is_read: null as unknown as boolean }),
      makeRow({ id: "b", is_read: true }),
    ];

    expect(unreadCount(rows)).toBe(1);
  });

  it("returns 0 for an empty array", () => {
    expect(unreadCount([])).toBe(0);
  });
});

describe("recognizeActionRoute", () => {
  it("returns null for a null action_url", () => {
    expect(recognizeActionRoute(null)).toBeNull();
  });

  it("returns null for an unrecognized action_url", () => {
    expect(recognizeActionRoute("/payslips/2026-01")).toBeNull();
  });

  it("recognizes a leave-related action_url", () => {
    expect(recognizeActionRoute("/staff/leave-requests/123")).toEqual({ tab: "LeaveTab" });
  });

  it("recognizes a claim-related action_url", () => {
    expect(recognizeActionRoute("app://claims/abc")).toEqual({ tab: "MoreTab", screen: "Claims" });
  });

  it("recognizes an overtime-related action_url", () => {
    expect(recognizeActionRoute("/overtime/42")).toEqual({ tab: "MoreTab", screen: "Overtime" });
  });

  it("recognizes an attendance-related action_url, case-insensitively", () => {
    expect(recognizeActionRoute("/Attendance/Today")).toEqual({ tab: "AttendanceTab" });
  });
});
