/**
 * Approval Matrix Engine — shared types and constants.
 * Separated from lifecycle logic for clean imports and tree-shaking.
 */

// ─── Action Types ─────────────────────────────────────────────────────────────

export const APPROVAL_ACTION_TYPES = [
  "payment_reversal",
  "refund",
  "discount_override",
  "write_off",
  "invoice_cancellation",
  "backdated_payment",
  "manual_wallet_adjustment",
  "due_date_override",
] as const;

export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export const APPROVAL_ACTION_LABELS: Record<ApprovalActionType, string> = {
  payment_reversal: "Payment Reversal",
  refund: "Refund",
  discount_override: "Discount Override",
  write_off: "Write-Off",
  invoice_cancellation: "Invoice Cancellation",
  backdated_payment: "Backdated Payment",
  manual_wallet_adjustment: "Manual Wallet Adjustment",
  due_date_override: "Due Date Override",
};

// ─── Statuses ─────────────────────────────────────────────────────────────────

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "escalated", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_STATUS_CONFIG: Record<ApprovalStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:  { label: "Rejected",  color: "bg-red-50 text-red-700 border-red-200" },
  escalated: { label: "Escalated", color: "bg-violet-50 text-violet-700 border-violet-200" },
  cancelled: { label: "Cancelled", color: "bg-muted text-muted-foreground border-border" },
};

// ─── Priority ─────────────────────────────────────────────────────────────────

export const PRIORITY_OPTIONS = ["normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number];

// ─── Data Shapes ──────────────────────────────────────────────────────────────

export interface ApprovalRule {
  id: string;
  branch_id: string | null;
  action_type: ApprovalActionType;
  amount_threshold: number;
  required_approver_role: string;
  requires_second_approval: boolean;
  second_approver_role: string | null;
  is_active: boolean;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  branch_id: string;
  action_type: ApprovalActionType;
  status: ApprovalStatus;
  requester_id: string;
  amount: number;
  entity_type: string;
  entity_id: string;
  request_summary: string;
  request_details: Record<string, unknown> | null;
  supporting_notes: string | null;
  financial_impact_preview: Record<string, unknown> | null;
  priority: string;
  matched_rule_id: string | null;
  current_step: number;
  max_steps: number;
  created_at: string;
  updated_at: string;
}

export interface ApprovalDecision {
  id: string;
  request_id: string;
  step_number: number;
  decision: string;
  decided_by: string;
  decided_at: string;
  reason: string | null;
  conditions: string | null;
}

export interface ApprovalCheckResult {
  requiresApproval: boolean;
  matchedRule: ApprovalRule | null;
  maxSteps: number;
}

export interface CreateApprovalRequestParams {
  branchId: string;
  actionType: ApprovalActionType;
  amount: number;
  entityType: string;
  entityId: string;
  requestSummary: string;
  requestDetails?: Record<string, unknown>;
  supportingNotes?: string;
  financialImpact?: Record<string, unknown>;
  priority?: Priority;
  requesterId: string;
  matchedRuleId?: string;
  maxSteps?: number;
}
