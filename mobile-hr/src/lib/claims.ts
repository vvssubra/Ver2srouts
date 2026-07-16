import type { ClaimType, StaffClaim, StaffClaimInsert } from "./hr-types";

export { resolveBranchId } from "./branch";

/**
 * Pure business logic for the Claims (self-service) screen. Kept free of
 * any Supabase/React Native imports so it can be unit tested without
 * rendering anything or touching the network.
 */

// ---------------------------------------------------------------------------
// Claim types
// ---------------------------------------------------------------------------

export const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: "transport", label: "Transport" },
  { value: "meal", label: "Meal" },
  { value: "medical", label: "Medical" },
  { value: "training", label: "Training" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

const CLAIM_TYPE_VALUES = new Set<string>(CLAIM_TYPES.map((t) => t.value));

/** Display label for a claim type, falling back to the raw value for anything unrecognized. */
export function claimTypeLabel(claimType: string): string {
  return CLAIM_TYPES.find((t) => t.value === claimType)?.label ?? claimType;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ClaimFormInput {
  claimType: string;
  description: string;
  amount: number;
}

/**
 * Validates a claim submission before it's sent to the server. Returns a
 * human-readable error message, or `null` when the input is valid.
 *
 * Rules:
 * 1. `claimType` must be one of the known claim types.
 * 2. `description` must be non-empty once trimmed.
 * 3. `amount` must be a finite number greater than 0.
 */
export function validateClaimInput(input: ClaimFormInput): string | null {
  if (!CLAIM_TYPE_VALUES.has(input.claimType)) {
    return "Choose a claim type.";
  }
  if (!input.description.trim()) {
    return "Enter a description.";
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "Enter an amount greater than 0.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export type ClaimDisplayStatusRow = Pick<
  StaffClaim,
  "level1_status" | "level2_status" | "paid_at"
>;

/**
 * Human-readable status for the claims history list, reconciling the
 * row's two-stage approval workflow with whether it's actually been paid
 * out yet.
 *
 * - `rejected` wins outright if either approval level rejected the claim.
 * - `paid` comes next: once `paid_at` is set the claim is settled,
 *   regardless of how the approval columns read.
 * - `approved` requires both levels to read `approved`. Branches that
 *   don't require a second-level review have the backend mirror level 1's
 *   approval onto `level2_status`, so this single check covers both
 *   one-level and two-level workflows without needing a separate
 *   "requires level 2" flag on the row.
 * - Anything else (not yet decided, or level 1 approved but level 2
 *   hasn't decided yet) is `pending`.
 */
export function deriveClaimDisplayStatus(row: ClaimDisplayStatusRow): string {
  if (row.level1_status === "rejected" || row.level2_status === "rejected") {
    return "rejected";
  }
  if (row.paid_at) {
    return "paid";
  }
  if (row.level1_status === "approved" && row.level2_status === "approved") {
    return "approved";
  }
  return "pending";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Formats an amount as Ringgit currency, e.g. `25.5` -> `"RM 25.50"`. */
export function formatAmount(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Insert payload builder
// ---------------------------------------------------------------------------

export interface ClaimInsertInput {
  userId: string;
  branchId: string;
  claimType: string;
  description: string;
  amount: number;
  claimDate: string;
  receiptUrl: string | null;
}

/** Builds the `staff_claims` insert payload for a new self-service claim. */
export function buildClaimInsert(input: ClaimInsertInput): StaffClaimInsert {
  return {
    user_id: input.userId,
    branch_id: input.branchId,
    claim_type: input.claimType,
    description: input.description.trim(),
    amount: input.amount,
    claim_date: input.claimDate,
    receipt_url: input.receiptUrl,
    status: "pending",
  };
}
