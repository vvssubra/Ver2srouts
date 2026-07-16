/**
 * Approval Matrix Engine — lifecycle operations.
 *
 * Gate-checking, request creation, and decision management.
 * Types/constants live in ./approval-types.ts for clean imports.
 *
 * Integration pattern:
 * 1. UI calls checkApprovalRequired() before executing a controlled action
 * 2. If required → createApprovalRequest() and show "awaiting approval" state
 * 3. If not required → proceed with the action immediately
 * 4. When approved → execute the action with approval_request_id in metadata
 */

import { supabase } from "@/integrations/supabase/client";
import { writeAuditEntry } from "./ledger-core";
import type {
  ApprovalActionType,
  ApprovalCheckResult,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalRule,
  ApprovalStatus,
  CreateApprovalRequestParams,
} from "./approval-types";

// Re-export types for backward compatibility
export type {
  ApprovalActionType,
  ApprovalCheckResult,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalRule,
  ApprovalStatus,
  CreateApprovalRequestParams,
} from "./approval-types";

export {
  APPROVAL_ACTION_TYPES,
  APPROVAL_ACTION_LABELS,
  APPROVAL_STATUSES,
  APPROVAL_STATUS_CONFIG,
  PRIORITY_OPTIONS,
} from "./approval-types";

export type { Priority } from "./approval-types";

// ─── Gate Check ───────────────────────────────────────────────────────────────

/**
 * Check if an action requires approval based on configured rules.
 * Returns the matched rule (if any) and how many approval steps are needed.
 *
 * Rule matching: most restrictive first (highest threshold that the amount meets).
 * Branch-specific rules take priority over global (null branch_id) rules.
 */
export async function checkApprovalRequired(
  branchId: string,
  actionType: ApprovalActionType,
  amount: number
): Promise<ApprovalCheckResult> {
  const { data: rules } = await supabase
    .from("approval_rules")
    .select("*")
    .eq("action_type", actionType as any)
    .eq("is_active", true)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order("amount_threshold", { ascending: false });

  if (!rules?.length) return { requiresApproval: false, matchedRule: null, maxSteps: 0 };

  // Prefer branch-specific rules over global ones at the same threshold
  const branchRules = rules.filter((r: any) => r.branch_id === branchId);
  const globalRules = rules.filter((r: any) => r.branch_id === null);
  const orderedRules = [...branchRules, ...globalRules];

  const matched = orderedRules.find((r: any) => amount >= r.amount_threshold);
  if (!matched) return { requiresApproval: false, matchedRule: null, maxSteps: 0 };

  return {
    requiresApproval: true,
    matchedRule: matched as unknown as ApprovalRule,
    maxSteps: (matched as any).requires_second_approval ? 2 : 1,
  };
}

// ─── Request Lifecycle ────────────────────────────────────────────────────────

export async function createApprovalRequest(params: CreateApprovalRequestParams): Promise<string> {
  const { data, error } = await supabase
    .from("approval_requests")
    .insert({
      branch_id: params.branchId,
      action_type: params.actionType as any,
      amount: params.amount,
      entity_type: params.entityType,
      entity_id: params.entityId,
      request_summary: params.requestSummary,
      request_details: params.requestDetails as any,
      supporting_notes: params.supportingNotes ?? null,
      financial_impact_preview: params.financialImpact as any ?? null,
      priority: params.priority ?? "normal",
      requester_id: params.requesterId,
      matched_rule_id: params.matchedRuleId ?? null,
      max_steps: params.maxSteps ?? 1,
      status: "pending" as any,
    } as any)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create approval request: ${error.message}`);

  await writeAuditEntry({
    branch_id: params.branchId,
    entity_type: "approval_request",
    entity_id: (data as any).id,
    action: "approval_requested",
    actor_id: params.requesterId,
    new_values: {
      action_type: params.actionType,
      amount: params.amount,
      entity: `${params.entityType}:${params.entityId}`,
    },
  });

  return (data as any).id;
}

export async function approveRequest(
  requestId: string,
  decidedBy: string,
  reason?: string,
  conditions?: string
) {
  const { data: request } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!request) throw new Error("Approval request not found");
  const req = request as any;

  if (req.status !== "pending" && req.status !== "escalated") {
    throw new Error("Request is not in an approvable state");
  }

  await supabase.from("approval_decisions").insert({
    request_id: requestId,
    step_number: req.current_step,
    decision: "approved",
    decided_by: decidedBy,
    reason: reason ?? null,
    conditions: conditions ?? null,
  } as any);

  const nextStep = req.current_step + 1;
  const isFullyApproved = nextStep > req.max_steps;

  await supabase
    .from("approval_requests")
    .update({
      status: isFullyApproved ? ("approved" as any) : ("escalated" as any),
      current_step: isFullyApproved ? req.current_step : nextStep,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", requestId);

  await writeAuditEntry({
    branch_id: req.branch_id,
    entity_type: "approval_request",
    entity_id: requestId,
    action: isFullyApproved ? "approval_granted" : "approval_step_completed",
    actor_id: decidedBy,
    new_values: { step: req.current_step, reason, conditions },
  });

  return isFullyApproved;
}

export async function rejectRequest(
  requestId: string,
  decidedBy: string,
  reason: string
) {
  const { data: request } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!request) throw new Error("Approval request not found");
  const req = request as any;

  await supabase.from("approval_decisions").insert({
    request_id: requestId,
    step_number: req.current_step,
    decision: "rejected",
    decided_by: decidedBy,
    reason,
  } as any);

  await supabase
    .from("approval_requests")
    .update({ status: "rejected" as any, updated_at: new Date().toISOString() } as any)
    .eq("id", requestId);

  await writeAuditEntry({
    branch_id: req.branch_id,
    entity_type: "approval_request",
    entity_id: requestId,
    action: "approval_rejected",
    actor_id: decidedBy,
    new_values: { reason },
  });
}

export async function cancelRequest(requestId: string, cancelledBy: string) {
  const { data: request } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!request) throw new Error("Approval request not found");
  const req = request as any;

  await supabase
    .from("approval_requests")
    .update({ status: "cancelled" as any, updated_at: new Date().toISOString() } as any)
    .eq("id", requestId);

  await writeAuditEntry({
    branch_id: req.branch_id,
    entity_type: "approval_request",
    entity_id: requestId,
    action: "approval_cancelled",
    actor_id: cancelledBy,
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getApprovalRules(branchIds: string[]) {
  const { data } = await supabase
    .from("approval_rules")
    .select("*")
    .or(branchIds.map((id) => `branch_id.eq.${id}`).join(",") + ",branch_id.is.null")
    .order("action_type")
    .order("amount_threshold", { ascending: true });
  return (data ?? []) as unknown as ApprovalRule[];
}

export async function getApprovalRequests(branchIds: string[], filters?: {
  status?: ApprovalStatus;
  actionType?: ApprovalActionType;
}) {
  let query = supabase
    .from("approval_requests")
    .select("*")
    .in("branch_id", branchIds)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status as any);
  if (filters?.actionType) query = query.eq("action_type", filters.actionType as any);

  const { data } = await query;
  return (data ?? []) as unknown as ApprovalRequest[];
}

export async function getApprovalDecisions(requestId: string) {
  const { data } = await supabase
    .from("approval_decisions")
    .select("*")
    .eq("request_id", requestId)
    .order("decided_at", { ascending: true });
  return (data ?? []) as unknown as ApprovalDecision[];
}

export async function getPendingApprovalCount(branchIds: string[]) {
  const { count } = await supabase
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .in("branch_id", branchIds)
    .eq("status", "pending" as any);
  return count ?? 0;
}

/**
 * Check if a pending approval request already exists for a given entity + action type.
 * Prevents duplicate requests for the same controlled action.
 */
export async function findPendingRequest(
  entityType: string,
  entityId: string,
  actionType: ApprovalActionType
): Promise<ApprovalRequest | null> {
  const { data } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("action_type", actionType as any)
    .in("status", ["pending", "escalated"] as any[])
    .limit(1)
    .maybeSingle();
  return data as unknown as ApprovalRequest | null;
}
