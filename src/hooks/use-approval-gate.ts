/**
 * useApprovalGate — React hook for gating controlled financial actions.
 *
 * Usage pattern:
 *   const gate = useApprovalGate();
 *   const handleAction = async () => {
 *     const result = await gate.check({ branchId, actionType, amount, ... });
 *     if (result === "submitted") return; // approval request created, UI shows pending state
 *     // result === "proceed" → execute the action
 *   };
 *
 * This hook encapsulates the full approval gate flow:
 * 1. Check if a pending request already exists (prevents duplicates)
 * 2. Check approval rules for the action
 * 3. If required → create request and return "submitted"
 * 4. If not required → return "proceed"
 *
 * Integration with ledger: When an action proceeds (either no approval needed
 * or after approval), the caller should include `approval_request_id` in the
 * ledger metadata for full traceability.
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  checkApprovalRequired,
  createApprovalRequest,
  findPendingRequest,
} from "@/lib/finance/approval-service";
import type { ApprovalActionType, Priority } from "@/lib/finance/approval-types";

export type GateResult = "proceed" | "submitted" | "already_pending";

export interface ApprovalGateParams {
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
}

export function useApprovalGate() {
  const [checking, setChecking] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const check = useCallback(async (params: ApprovalGateParams): Promise<GateResult> => {
    setChecking(true);
    try {
      // 1. Check for existing pending request (idempotency guard)
      const existing = await findPendingRequest(
        params.entityType,
        params.entityId,
        params.actionType
      );
      if (existing) {
        setPendingRequestId(existing.id);
        toast.info("An approval request for this action is already pending.", {
          description: "Please wait for it to be processed.",
        });
        return "already_pending";
      }

      // 2. Check if approval is required
      const { requiresApproval, matchedRule, maxSteps } = await checkApprovalRequired(
        params.branchId,
        params.actionType,
        params.amount
      );

      if (!requiresApproval) {
        return "proceed";
      }

      // 3. Create approval request
      const requestId = await createApprovalRequest({
        ...params,
        matchedRuleId: matchedRule?.id,
        maxSteps,
      });

      setPendingRequestId(requestId);
      toast.info("Approval required", {
        description: "Your request has been submitted for review. The action will be executed once approved.",
      });
      return "submitted";
    } catch (err: any) {
      toast.error("Approval check failed", { description: err.message });
      throw err;
    } finally {
      setChecking(false);
    }
  }, []);

  return {
    check,
    checking,
    pendingRequestId,
  };
}
