import {
  evaluateGeofence,
  haversineMeters,
  isWithinRadius,
  resolveApplicableGeofence,
  type GeofenceLocation,
  type StaffGeofenceAssignment,
} from "../../attendance";

describe("haversineMeters", () => {
  it("returns 0 for identical coordinates", () => {
    const point = { lat: 1.3521, lng: 103.8198 };
    expect(haversineMeters(point, point)).toBe(0);
  });

  it("matches the closed-form distance for two points ~1km apart along a meridian (equator)", () => {
    // At the equator, moving 0.01 degrees of latitude is a pure north-south
    // arc: distance = R * radians(0.01), independent of the haversine
    // formula's own longitude handling.
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0.01, lng: 0 };
    const expected = 6371000 * ((0.01 * Math.PI) / 180); // ~1111.95m
    expect(haversineMeters(a, b)).toBeCloseTo(expected, 1);
  });

  it("matches the closed-form distance for two points ~1km apart along the equator", () => {
    // At the equator, moving 0.01 degrees of longitude is likewise a pure
    // east-west arc of the same closed-form length.
    const a = { lat: 0, lng: 103.8 };
    const b = { lat: 0, lng: 103.81 };
    const expected = 6371000 * ((0.01 * Math.PI) / 180); // ~1111.95m
    expect(haversineMeters(a, b)).toBeCloseTo(expected, 1);
  });

  it("scales east-west distance by cos(latitude) away from the equator", () => {
    // A common haversine bug is forgetting the cos(lat) term, which would
    // make this equal the equatorial case above instead of ~692m.
    const londonLat = 51.5;
    const a = { lat: londonLat, lng: -0.1 };
    const b = { lat: londonLat, lng: -0.09 };
    const expected = 6371000 * Math.cos(toRad(londonLat)) * ((0.01 * Math.PI) / 180); // ~692m
    expect(haversineMeters(a, b)).toBeCloseTo(expected, 1);
  });
});

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

describe("isWithinRadius", () => {
  it("is true when distance is less than radius", () => {
    expect(isWithinRadius(40, 50)).toBe(true);
  });

  it("is true exactly at the boundary", () => {
    expect(isWithinRadius(50, 50)).toBe(true);
  });

  it("is false when distance exceeds radius", () => {
    expect(isWithinRadius(51, 50)).toBe(false);
  });
});

describe("resolveApplicableGeofence", () => {
  const branchLocation: GeofenceLocation = {
    id: "loc-1",
    lat: 1.3,
    lng: 103.8,
    radius_meters: 100,
    is_active: true,
  };

  const override: StaffGeofenceAssignment = {
    lat: 1.35,
    lng: 103.9,
    radius_meters: 25,
    is_active: true,
  };

  it("prefers an active staff override over an active branch location", () => {
    const result = resolveApplicableGeofence([branchLocation], override);
    expect(result).toEqual({ lat: 1.35, lng: 103.9, radius_meters: 25 });
  });

  it("falls back to the active branch location when there is no override", () => {
    const result = resolveApplicableGeofence([branchLocation], null);
    expect(result).toEqual({ lat: 1.3, lng: 103.8, radius_meters: 100 });
  });

  it("falls back to the active branch location when the override is inactive", () => {
    const inactiveOverride: StaffGeofenceAssignment = { ...override, is_active: false };
    const result = resolveApplicableGeofence([branchLocation], inactiveOverride);
    expect(result).toEqual({ lat: 1.3, lng: 103.8, radius_meters: 100 });
  });

  it("returns null when neither an override nor an active branch location exists", () => {
    const inactiveBranch: GeofenceLocation = { ...branchLocation, is_active: false };
    expect(resolveApplicableGeofence([inactiveBranch], null)).toBeNull();
    expect(resolveApplicableGeofence([], null)).toBeNull();
  });
});

describe("evaluateGeofence", () => {
  it("does not block clock-in when no geofence is configured", () => {
    const result = evaluateGeofence({ lat: 1, lng: 1 }, null);
    expect(result).toEqual({
      configured: false,
      withinRadius: true,
      distanceMeters: null,
      radiusMeters: null,
    });
  });

  it("reports within-radius when close enough", () => {
    const geofence = { lat: 1.3, lng: 103.8, radius_meters: 200 };
    const result = evaluateGeofence({ lat: 1.3, lng: 103.8 }, geofence);
    expect(result.configured).toBe(true);
    expect(result.withinRadius).toBe(true);
    expect(result.distanceMeters).toBeCloseTo(0, 3);
    expect(result.radiusMeters).toBe(200);
  });

  it("reports outside-radius when far enough away", () => {
    const geofence = { lat: 0, lng: 0, radius_meters: 50 };
    const result = evaluateGeofence({ lat: 0.01, lng: 0 }, geofence); // ~1112m away
    expect(result.configured).toBe(true);
    expect(result.withinRadius).toBe(false);
    expect(result.distanceMeters).toBeGreaterThan(1000);
    expect(result.radiusMeters).toBe(50);
  });
});
