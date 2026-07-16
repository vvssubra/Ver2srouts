/**
 * Pricing & Billing Rules Engine — Service Layer
 *
 * Manages fee package versioning, student billing profiles,
 * and pricing audit trail. All mutations are auditable.
 *
 * NOTE: Tables fee_package_versions, student_billing_profiles,
 * billing_profile_items, pricing_audit_log are not yet in the
 * generated types. We use `as any` on table names and cast
 * results through `unknown`.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeePackageVersion {
  id: string;
  fee_package_id: string;
  version_number: number;
  amount: number;
  effective_from: string;
  effective_until: string | null;
  change_reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface BillingProfile {
  id: string;
  student_id: string;
  branch_id: string;
  billing_cycle: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingProfileItem {
  id: string;
  profile_id: string;
  fee_package_id: string;
  fee_version_id: string | null;
  discount_amount: number;
  discount_type: string;
  discount_reason: string | null;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PricingAuditEntry {
  id: string;
  branch_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  old_values: any;
  new_values: any;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (name: string) => name as any;

async function writePricingAudit(params: {
  branchId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName?: string;
  oldValues?: any;
  newValues?: any;
}) {
  await supabase.from(tbl("pricing_audit_log")).insert({
    branch_id: params.branchId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    actor_id: params.actorId,
    actor_name: params.actorName ?? null,
    old_values: params.oldValues ?? null,
    new_values: params.newValues ?? null,
  } as any);
}

// ─── Fee Package Versioning ──────────────────────────────────────────────────

export async function createFeePackageVersion(params: {
  packageId: string;
  amount: number;
  effectiveFrom: string;
  reason: string;
  actorId: string;
  actorName?: string;
  branchId: string;
}): Promise<FeePackageVersion> {
  const { data: existing } = await supabase
    .from(tbl("fee_package_versions"))
    .select("version_number")
    .eq("fee_package_id", params.packageId)
    .order("version_number", { ascending: false })
    .limit(1);

  const rows = existing as unknown as { version_number: number }[] | null;
  const nextVersion = (rows?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from(tbl("fee_package_versions"))
    .insert({
      fee_package_id: params.packageId,
      version_number: nextVersion,
      amount: params.amount,
      effective_from: params.effectiveFrom,
      change_reason: params.reason,
      changed_by: params.actorId,
    } as any)
    .select()
    .single();

  if (error) throw error;
  const row = data as unknown as FeePackageVersion;

  await writePricingAudit({
    branchId: params.branchId,
    entityType: "fee_package_version",
    entityId: row.id,
    action: "version_added",
    actorId: params.actorId,
    actorName: params.actorName,
    newValues: { version: nextVersion, amount: params.amount, effective_from: params.effectiveFrom, reason: params.reason },
  });

  return row;
}

export async function getFeePackageHistory(packageId: string): Promise<FeePackageVersion[]> {
  const { data, error } = await supabase
    .from(tbl("fee_package_versions"))
    .select("*")
    .eq("fee_package_id", packageId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as FeePackageVersion[];
}

export async function getEffectiveRate(packageId: string, asOfDate: string): Promise<FeePackageVersion | null> {
  const { data, error } = await supabase
    .from(tbl("fee_package_versions"))
    .select("*")
    .eq("fee_package_id", packageId)
    .lte("effective_from", asOfDate)
    .or(`effective_until.is.null,effective_until.gte.${asOfDate}`)
    .order("version_number", { ascending: false })
    .limit(1);

  if (error) throw error;
  const rows = (data ?? []) as unknown as FeePackageVersion[];
  return rows[0] ?? null;
}

// ─── Student Billing Profiles ────────────────────────────────────────────────

export async function getOrCreateBillingProfile(params: {
  studentId: string;
  branchId: string;
  actorId: string;
}): Promise<BillingProfile> {
  const { data: existing } = await supabase
    .from(tbl("student_billing_profiles"))
    .select("*")
    .eq("student_id", params.studentId)
    .single();

  if (existing && !(existing as any).error) return existing as unknown as BillingProfile;

  const { data, error } = await supabase
    .from(tbl("student_billing_profiles"))
    .insert({
      student_id: params.studentId,
      branch_id: params.branchId,
      created_by: params.actorId,
    } as any)
    .select()
    .single();

  if (error) throw error;
  const row = data as unknown as BillingProfile;

  await writePricingAudit({
    branchId: params.branchId,
    entityType: "billing_profile",
    entityId: row.id,
    action: "created",
    actorId: params.actorId,
    newValues: { student_id: params.studentId, billing_cycle: "monthly" },
  });

  return row;
}

export async function getStudentBillingProfile(studentId: string) {
  const { data: profile } = await supabase
    .from(tbl("student_billing_profiles"))
    .select("*")
    .eq("student_id", studentId)
    .single();

  if (!profile || (profile as any).error) return null;
  const p = profile as unknown as BillingProfile;

  const { data: items } = await supabase
    .from(tbl("billing_profile_items"))
    .select(`
      *,
      fee_packages:fee_package_id(id, name, amount, fee_type, is_active),
      fee_version:fee_version_id(id, version_number, amount, effective_from)
    `)
    .eq("profile_id", p.id)
    .order("sort_order");

  return { ...p, items: (items ?? []) as unknown as any[] };
}

export async function addBillingProfileItem(params: {
  profileId: string;
  packageId: string;
  versionId?: string;
  discountAmount?: number;
  discountType?: string;
  discountReason?: string;
  effectiveFrom: string;
  actorId: string;
  branchId: string;
}): Promise<BillingProfileItem> {
  const { data, error } = await supabase
    .from(tbl("billing_profile_items"))
    .insert({
      profile_id: params.profileId,
      fee_package_id: params.packageId,
      fee_version_id: params.versionId ?? null,
      discount_amount: params.discountAmount ?? 0,
      discount_type: params.discountType ?? "fixed",
      discount_reason: params.discountReason ?? null,
      effective_from: params.effectiveFrom,
    } as any)
    .select()
    .single();

  if (error) throw error;
  const row = data as unknown as BillingProfileItem;

  await writePricingAudit({
    branchId: params.branchId,
    entityType: "billing_profile_item",
    entityId: row.id,
    action: "item_added",
    actorId: params.actorId,
    newValues: { package_id: params.packageId, discount: params.discountAmount, effective_from: params.effectiveFrom },
  });

  return row;
}

export async function deactivateBillingProfileItem(params: {
  itemId: string;
  actorId: string;
  branchId: string;
}) {
  const { data, error } = await supabase
    .from(tbl("billing_profile_items"))
    .update({ is_active: false, effective_until: new Date().toISOString().split("T")[0] } as any)
    .eq("id", params.itemId)
    .select()
    .single();

  if (error) throw error;

  await writePricingAudit({
    branchId: params.branchId,
    entityType: "billing_profile_item",
    entityId: params.itemId,
    action: "deactivated",
    actorId: params.actorId,
    oldValues: { is_active: true },
    newValues: { is_active: false },
  });

  return data;
}

export async function getBranchBillingProfiles(branchId: string) {
  const { data, error } = await supabase
    .from(tbl("student_billing_profiles"))
    .select(`
      *,
      students:student_id(id, first_name, last_name, class_name, is_active),
      items:billing_profile_items(
        id, fee_package_id, discount_amount, discount_type, is_active, effective_from, effective_until,
        fee_packages:fee_package_id(id, name, amount, fee_type)
      )
    `)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as any[];
}

// ─── Pricing Audit Log ───────────────────────────────────────────────────────

export async function getPricingAuditLog(branchId: string, limit = 100) {
  const { data, error } = await supabase
    .from(tbl("pricing_audit_log"))
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as PricingAuditEntry[];
}

// ─── Legacy Migration Utility ────────────────────────────────────────────────

export async function migrateStudentFeesToProfiles(branchId: string, actorId: string) {
  const { data: studentFees } = await supabase
    .from("student_fees")
    .select(`
      id, student_id, fee_package_id, discount_amount, is_active,
      students:student_id(branch_id),
      fee_packages:fee_package_id(id, name, amount)
    `)
    .eq("is_active", true);

  const branchFees = (studentFees ?? []).filter(
    (sf: any) => (sf.students as any)?.branch_id === branchId
  );

  let migrated = 0;
  const seen = new Set<string>();

  for (const sf of branchFees) {
    const sid = (sf as any).student_id;
    if (seen.has(sid)) continue;
    seen.add(sid);

    const profile = await getOrCreateBillingProfile({ studentId: sid, branchId, actorId });

    const studentItems = branchFees.filter((f: any) => (f as any).student_id === sid);

    for (const item of studentItems) {
      const { data: latestVersion } = await supabase
        .from(tbl("fee_package_versions"))
        .select("id")
        .eq("fee_package_id", (item as any).fee_package_id)
        .order("version_number", { ascending: false })
        .limit(1);

      const verRows = (latestVersion ?? []) as unknown as { id: string }[];

      await addBillingProfileItem({
        profileId: profile.id,
        packageId: (item as any).fee_package_id,
        versionId: verRows[0]?.id,
        discountAmount: (item as any).discount_amount ?? 0,
        effectiveFrom: new Date().toISOString().split("T")[0],
        actorId,
        branchId,
      });
    }
    migrated++;
  }

  return { migrated };
}
