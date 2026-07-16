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
 * Staff-specific override takes priority over branch-wide locations. If
 * neither is configured (or active), returns null — meaning no geofence
 * is configured for this person, so clock-in should not be blocked.
 */
export function resolveApplicableGeofence(
  branchLocations: GeofenceLocation[],
  staffOverride: StaffGeofenceAssignment | null
): ResolvedGeofence | null {
  if (staffOverride && staffOverride.is_active) {
    return {
      lat: staffOverride.lat,
      lng: staffOverride.lng,
      radius_meters: staffOverride.radius_meters,
    };
  }

  const activeBranchLocation = branchLocations.find((location) => location.is_active);
  if (activeBranchLocation) {
    return {
      lat: activeBranchLocation.lat,
      lng: activeBranchLocation.lng,
      radius_meters: activeBranchLocation.radius_meters,
    };
  }

  return null;
}

export interface GeofenceCheckResult {
  /** Whether a geofence applies at all (branch or staff override). */
  configured: boolean;
  /** True when no geofence is configured, or the position is inside it. */
  withinRadius: boolean;
  distanceMeters: number | null;
  radiusMeters: number | null;
}

/**
 * Combines geofence resolution + haversine distance + radius check into a
 * single result the screen/mutation layer can branch on (block silently,
 * or require a selfie).
 */
export function evaluateGeofence(
  position: LatLng,
  geofence: ResolvedGeofence | null
): GeofenceCheckResult {
  if (!geofence) {
    return { configured: false, withinRadius: true, distanceMeters: null, radiusMeters: null };
  }

  const distanceMeters = haversineMeters(position, { lat: geofence.lat, lng: geofence.lng });
  return {
    configured: true,
    withinRadius: isWithinRadius(distanceMeters, geofence.radius_meters),
    distanceMeters,
    radiusMeters: geofence.radius_meters,
  };
}

// ---------------------------------------------------------------------------
// Branch resolution
// ---------------------------------------------------------------------------

/**
 * v1 simplifying assumption: a staff member may in principle belong to
 * more than one branch, but this app only clocks in/out against the first
 * `branch_memberships` row returned for them. Multi-branch staff are out
 * of scope for this phase.
 */
export function resolveBranchId(memberships: { branch_id: string }[]): string | null {
  return memberships[0]?.branch_id ?? null;
}

// ---------------------------------------------------------------------------
// Clock status (today) + attendance day rollups
// ---------------------------------------------------------------------------

export type ClockStatus = "not_clocked_in" | "clocked_in" | "clocked_out";
export type DayStatus = "absent" | "present" | "completed";

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
 * days with no row at all (shown as "absent").
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
    days.push({
      date,
      clock_in: row?.clock_in ?? null,
      clock_out: row?.clock_out ?? null,
      status: deriveDayStatus(row),
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
