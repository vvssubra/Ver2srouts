import { format, subDays } from "date-fns";
import type { StaffAttendanceInsert, StaffAttendanceUpdate } from "./hr-types";

/**
 * Pure business logic for the Attendance (clock in/out) screen. Kept free
 * of any Supabase/React Native/expo-location imports so it can be unit
 * tested without rendering anything, touching the network, or requesting
 * device permissions.
 *
 * Note on `deriveClockStatus`/`todayDateString`: the Home screen's
 * `src/lib/home.ts` defines near-identical helpers, but that file is owned
 * by another agent working concurrently in this same repo. Rather than
 * import across module boundaries mid-build (and risk breaking if its
 * signature changes under me), the tiny amount of logic is duplicated
 * locally here, per this module's own instructions allowing either choice.
 */

// ---------------------------------------------------------------------------
// Geofence math
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

/** A branch-wide geofence location (table `geofence_locations`). */
export interface GeofenceLocation {
  id: string;
  lat: number;
  lng: number;
  radius_meters: number;
  is_active: boolean;
}

/**
 * A staff-specific geofence override, already resolved/joined against its
 * `geofence_locations` row (the `staff_geofence_assignments` table itself
 * only stores a `geofence_location_id` foreign key and has no `is_active`
 * column of its own — "active" here means the joined location is active).
 */
export interface StaffGeofenceAssignment {
  lat: number;
  lng: number;
  radius_meters: number;
  is_active: boolean;
}

export interface ResolvedGeofence {
  lat: number;
  lng: number;
  radius_meters: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Standard haversine great-circle distance between two lat/lng points, in
 * meters, assuming a spherical Earth of radius 6,371km.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return EARTH_RADIUS_METERS * c;
}

export function isWithinRadius(distanceMeters: number, radiusMeters: number): boolean {
  return distanceMeters <= radiusMeters;
}

/**
 * Staff-specific overrides take priority over branch-wide locations: if any
 * active override rows exist, ALL of them become candidates (branch
 * locations are ignored); otherwise every active branch-wide location is a
 * candidate. Returns every candidate rather than picking just one — a
 * branch can legitimately have more than one active location (e.g. "Main
 * Center" and "Annex"), and a staff member can legitimately have more than
 * one active override row (there is no DB constraint limiting either to a
 * single row), so `evaluateGeofence` below checks the position against all
 * of them rather than an arbitrarily-picked single one.
 */
export function resolveApplicableGeofences(
  branchLocations: GeofenceLocation[],
  staffOverrides: StaffGeofenceAssignment[]
): ResolvedGeofence[] {
  const activeOverrides = staffOverrides.filter((override) => override.is_active);
  if (activeOverrides.length > 0) {
    return activeOverrides.map((override) => ({
      lat: override.lat,
      lng: override.lng,
      radius_meters: override.radius_meters,
    }));
  }

  return branchLocations
    .filter((location) => location.is_active)
    .map((location) => ({
      lat: location.lat,
      lng: location.lng,
      radius_meters: location.radius_meters,
    }));
}

export interface GeofenceCheckResult {
  /** Whether a geofence applies at all (branch or staff override). */
  configured: boolean;
  /** True when no geofence is configured, or the position is inside ANY candidate. */
  withinRadius: boolean;
  distanceMeters: number | null;
  radiusMeters: number | null;
}

/**
 * Combines geofence resolution + haversine distance + radius check into a
 * single result the screen/mutation layer can branch on (block silently,
 * or require a selfie). Checks the position against every candidate
 * geofence and considers it "within radius" if it's inside ANY of them —
 * being at a valid alternate work location must not be treated as outside
 * the geofence just because a different location happened to be evaluated.
 * For display, reports whichever geofence actually matched (or, if none
 * matched, the nearest one, so the "you are Nm away" message is useful).
 */
export function evaluateGeofence(
  position: LatLng,
  geofences: ResolvedGeofence[]
): GeofenceCheckResult {
  if (geofences.length === 0) {
    return { configured: false, withinRadius: true, distanceMeters: null, radiusMeters: null };
  }

  const evaluated = geofences.map((geofence) => {
    const distanceMeters = haversineMeters(position, { lat: geofence.lat, lng: geofence.lng });
    return {
      distanceMeters,
      radiusMeters: geofence.radius_meters,
      withinRadius: isWithinRadius(distanceMeters, geofence.radius_meters),
    };
  });

  const matched = evaluated.find((candidate) => candidate.withinRadius);
  const nearest = evaluated.reduce((closest, candidate) =>
    candidate.distanceMeters < closest.distanceMeters ? candidate : closest
  );
  const chosen = matched ?? nearest;

  return {
    configured: true,
    withinRadius: !!matched,
    distanceMeters: chosen.distanceMeters,
    radiusMeters: chosen.radiusMeters,
  };
}

// ---------------------------------------------------------------------------
// Branch resolution
// ---------------------------------------------------------------------------

export { resolveBranchId } from "./branch";

// ---------------------------------------------------------------------------
// Clock status (today) + attendance day rollups
// ---------------------------------------------------------------------------

export type ClockStatus = "not_clocked_in" | "clocked_in" | "clocked_out";
export type DayStatus = "absent" | "present" | "completed" | "pending";

export interface AttendanceDayRow {
  date: string;
  clock_in: string | null;
  clock_out: string | null;
}

/** Three-state model for today's clock button/status card. */
export function deriveClockStatus(row: AttendanceDayRow | null | undefined): ClockStatus {
  if (!row || !row.clock_in) return "not_clocked_in";
  if (!row.clock_out) return "clocked_in";
  return "clocked_out";
}

const CLOCK_TO_DAY_STATUS: Record<ClockStatus, DayStatus> = {
  not_clocked_in: "absent",
  clocked_in: "present",
  clocked_out: "completed",
};

/** Same three states, relabeled to the present/completed/absent vocabulary StatusPill's `toneForStatus` understands. */
export function deriveDayStatus(row: AttendanceDayRow | null | undefined): DayStatus {
  return CLOCK_TO_DAY_STATUS[deriveClockStatus(row)];
}

export interface AttendanceDayView extends AttendanceDayRow {
  status: DayStatus;
}

/**
 * Builds a fixed 7-entry list (today first, then the preceding 6 days)
 * merging whatever `staff_attendance` rows exist with placeholders for
 * days with no row at all (shown as "absent" — except today, which is
 * still in progress and shown as "pending" instead: a not-yet-clocked-in
 * day that hasn't ended yet is not the same thing as a day that ended
 * with no attendance, and showing both as "Absent" directly contradicts
 * the status card above this list, which correctly says "Not clocked in
 * yet" rather than implying the day is already over).
 */
export function buildLastSevenDays(
  rows: AttendanceDayRow[],
  today: Date = new Date()
): AttendanceDayView[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  const days: AttendanceDayView[] = [];
  for (let i = 0; i < 7; i++) {
    const date = format(subDays(today, i), "yyyy-MM-dd");
    const row = byDate.get(date) ?? null;
    const status = deriveDayStatus(row);
    days.push({
      date,
      clock_in: row?.clock_in ?? null,
      clock_out: row?.clock_out ?? null,
      status: i === 0 && status === "absent" ? "pending" : status,
    });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function todayDateString(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/** e.g. "9:04 AM", or an em dash placeholder when there's no timestamp yet. */
export function formatTimeOfDay(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "h:mm a");
}

/**
 * Short human-readable note describing how far outside the geofence a
 * clock event was, plus an optional user-entered reason.
 */
export function buildGeofenceNote(
  distanceMeters: number,
  radiusMeters: number,
  reason?: string
): string {
  const base = `${Math.round(distanceMeters)}m away (outside the ${radiusMeters}m geofence)`;
  const trimmedReason = reason?.trim();
  return trimmedReason ? `${base} — ${trimmedReason}` : base;
}

// ---------------------------------------------------------------------------
// Insert/update payload builders
// ---------------------------------------------------------------------------

export interface ClockInInput {
  userId: string;
  branchId: string;
  date: string;
  clockInIso: string;
  latitude: number;
  longitude: number;
  geofence: GeofenceCheckResult;
  selfieUrl?: string | null;
  reason?: string;
}

export function buildClockInInsert(input: ClockInInput): StaffAttendanceInsert {
  const outsideGeofence = input.geofence.configured && !input.geofence.withinRadius;

  return {
    user_id: input.userId,
    branch_id: input.branchId,
    date: input.date,
    clock_in: input.clockInIso,
    clock_in_latitude: input.latitude,
    clock_in_longitude: input.longitude,
    is_outside_geofence: outsideGeofence,
    selfie_url: outsideGeofence ? input.selfieUrl ?? null : null,
    geofence_note:
      outsideGeofence && input.geofence.distanceMeters != null && input.geofence.radiusMeters != null
        ? buildGeofenceNote(input.geofence.distanceMeters, input.geofence.radiusMeters, input.reason)
        : null,
  };
}

/**
 * Typed error the screen can branch on to show the right ErrorState copy
 * (a denied permission needs different guidance than a server failure).
 */
export type ClockActionErrorKind = "location" | "camera" | "selfie_cancelled" | "server";

export class ClockActionError extends Error {
  kind: ClockActionErrorKind;

  constructor(kind: ClockActionErrorKind, message: string) {
    super(message);
    this.name = "ClockActionError";
    this.kind = kind;
  }
}

export interface ClockOutInput {
  clockOutIso: string;
  latitude: number;
  longitude: number;
  geofence: GeofenceCheckResult;
  selfieUrl?: string | null;
  reason?: string;
}

export function buildClockOutUpdate(input: ClockOutInput): StaffAttendanceUpdate {
  const outsideGeofence = input.geofence.configured && !input.geofence.withinRadius;

  const update: StaffAttendanceUpdate = {
    clock_out: input.clockOutIso,
    clock_out_latitude: input.latitude,
    clock_out_longitude: input.longitude,
  };

  if (outsideGeofence) {
    update.is_outside_geofence = true;
    update.selfie_url = input.selfieUrl ?? null;
    update.geofence_note =
      input.geofence.distanceMeters != null && input.geofence.radiusMeters != null
        ? buildGeofenceNote(input.geofence.distanceMeters, input.geofence.radiusMeters, input.reason)
        : null;
  }

  return update;
}
