import type { Profile, StaffProfile } from "./hr-types";
import type { Database } from "./database.types";

/**
 * Pure business logic for the Profile (self-service) screen. Kept free of
 * React/Supabase so it's unit-testable without rendering anything.
 *
 * v1 scope is deliberately limited: staff may only edit their own contact
 * details (phone, address, emergency contact). IC/tax/EPF/SOCSO/bank/
 * statutory numbers stay admin-managed on the web app for now.
 */

export type ProfileEditInput = {
  phone?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * Validates the editable-contact-info form.
 *
 * Rules:
 * - Every field is optional on its own.
 * - Emergency contact name and phone are paired: providing one without the
 *   other is rejected (can't reach "Jane Doe" with no phone number, and a
 *   bare phone number with no name is not useful in an emergency).
 * - Any field that is provided must be non-empty after trimming (no
 *   whitespace-only values).
 *
 * Returns a user-facing error message, or null when the input is valid.
 */
export function validateProfileEdit(input: ProfileEditInput): string | null {
  const hasName = !isBlank(input.emergencyContactName);
  const hasPhone = !isBlank(input.emergencyContactPhone);

  if (input.emergencyContactName !== undefined && isBlank(input.emergencyContactName)) {
    return "Emergency contact name can't be empty.";
  }
  if (input.emergencyContactPhone !== undefined && isBlank(input.emergencyContactPhone)) {
    return "Emergency contact phone can't be empty.";
  }
  if (hasName && !hasPhone) {
    return "Add a phone number for your emergency contact.";
  }
  if (hasPhone && !hasName) {
    return "Add a name for your emergency contact.";
  }

  if (input.phone !== undefined && isBlank(input.phone)) {
    return "Phone number can't be empty.";
  }
  if (input.address !== undefined && isBlank(input.address)) {
    return "Address can't be empty.";
  }

  return null;
}

/**
 * Builds the `staff_profiles` update payload for a validated edit. `phone`
 * lives on both `profiles` and `staff_profiles` (see database.types.ts) —
 * this only covers the staff_profiles side; the caller is responsible for
 * also mirroring phone onto `profiles` if it changed.
 */
export function buildStaffProfileUpdate(
  input: ProfileEditInput
): Database["public"]["Tables"]["staff_profiles"]["Update"] {
  const update: Database["public"]["Tables"]["staff_profiles"]["Update"] = {};
  if (input.phone !== undefined) update.phone = input.phone.trim();
  if (input.address !== undefined) update.address = input.address.trim();
  if (input.emergencyContactName !== undefined) {
    update.emergency_contact_name = input.emergencyContactName.trim();
  }
  if (input.emergencyContactPhone !== undefined) {
    update.emergency_contact_phone = input.emergencyContactPhone.trim();
  }
  return update;
}

export function displayName(profile: Profile | null): string {
  if (!profile) return "—";
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : profile.email;
}

export function formatEmploymentType(staffProfile: StaffProfile | null): string {
  if (!staffProfile?.employment_type) return "Not set";
  return staffProfile.employment_type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value;
}

export function maskedOrNotSet(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) return "Not set";
  return value;
}
