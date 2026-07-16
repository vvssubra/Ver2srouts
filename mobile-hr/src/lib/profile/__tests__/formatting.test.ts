import {
  buildStaffProfileUpdate,
  displayName,
  formatEmploymentType,
  maskedOrNotSet,
} from "../../profile";
import type { Profile, StaffProfile } from "../../hr-types";

describe("buildStaffProfileUpdate", () => {
  it("only includes fields that were provided, trimmed", () => {
    expect(
      buildStaffProfileUpdate({
        phone: " 012-345 6789 ",
        emergencyContactName: " Jane Doe ",
        emergencyContactPhone: " 019-888 7777 ",
      })
    ).toEqual({
      phone: "012-345 6789",
      emergency_contact_name: "Jane Doe",
      emergency_contact_phone: "019-888 7777",
    });
  });

  it("returns an empty object when nothing was provided", () => {
    expect(buildStaffProfileUpdate({})).toEqual({});
  });

  it("includes address when provided", () => {
    expect(buildStaffProfileUpdate({ address: " 1 Jalan Contoh " })).toEqual({
      address: "1 Jalan Contoh",
    });
  });
});

describe("displayName", () => {
  it("joins first and last name", () => {
    const profile = { first_name: "Jane", last_name: "Doe", email: "jane@example.com" } as Profile;
    expect(displayName(profile)).toBe("Jane Doe");
  });

  it("falls back to email when no name is set", () => {
    const profile = { first_name: null, last_name: null, email: "jane@example.com" } as Profile;
    expect(displayName(profile)).toBe("jane@example.com");
  });

  it("falls back to an em dash when profile is null", () => {
    expect(displayName(null)).toBe("—");
  });
});

describe("formatEmploymentType", () => {
  it("title-cases underscored employment types", () => {
    const staffProfile = { employment_type: "full_time" } as StaffProfile;
    expect(formatEmploymentType(staffProfile)).toBe("Full Time");
  });

  it("returns 'Not set' when missing", () => {
    expect(formatEmploymentType(null)).toBe("Not set");
  });
});

describe("maskedOrNotSet", () => {
  it("returns the value when present", () => {
    expect(maskedOrNotSet("A123456789")).toBe("A123456789");
  });

  it("returns 'Not set' for null, undefined, or blank", () => {
    expect(maskedOrNotSet(null)).toBe("Not set");
    expect(maskedOrNotSet(undefined)).toBe("Not set");
    expect(maskedOrNotSet("   ")).toBe("Not set");
  });
});
