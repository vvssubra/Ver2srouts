/**
 * Finance module barrel export.
 * 
 * Re-exports all finance services and constants from their focused modules.
 * Import from here for convenience, or from individual modules for tree-shaking.
 */

export { writeLedgerEntry, writeAuditEntry } from "./ledger-core";
export type { LedgerEntry, AuditEntry } from "./ledger-core";

export { issueInvoice, cancelInvoice, createInvoice, voidInvoice, updateInvoiceBillingPeriod } from "./invoice-service";
export type { CreateInvoiceParams } from "./invoice-service";

export { recordPayment, reversePayment } from "./payment-service";

export {
  getWalletBalance,
  creditWalletFromOverpayment,
  creditWalletFromCreditNote,
  adminWalletAdjustment,
  applyWalletToInvoice,
} from "./wallet-service";

export {
  recordAllocatedPayment,
  allocatePayment,
  getPaymentAllocations,
  getInvoiceAllocations,
  getUnallocatedPayments,
} from "./allocation-service";
export type { AllocationItem, PaymentAllocation } from "./allocation-service";

export {
  createDispute,
  resolveDispute,
  updateDisputeStatus,
  getDisputesForPayment,
  getDisputesForInvoice,
  getActiveDisputesByBranch,
  getAllDisputes,
  getInvoiceRiskSummary,
  getBranchCollectionsSummary,
  DISPUTE_REASON_CODES,
  DISPUTE_STATUSES,
} from "./dispute-service";
export type { PaymentDispute } from "./dispute-service";

export {
  getGatewayEvents,
  getGatewayTransactions,
  getGatewayTransactionForPayment,
  getGatewayEventsForPayment,
  getReconciliationSummary,
  manualMatchTransaction,
  markTransactionDuplicate,
  PROCESSING_STATUSES,
  RECONCILIATION_STATUSES,
  SETTLEMENT_STATUSES,
} from "./gateway-service";
export type { GatewayEvent, GatewayTransaction, ReconciliationSummary } from "./gateway-service";

export {
  CURRENCY,
  formatCurrency,
  LEDGER_ENTRY_TYPES,
  getEntryTypeConfig,
  LEDGER_FILTER_OPTIONS,
  INVOICE_STATUSES,
  INVOICE_STATUS_OPTIONS,
  PAYMENT_METHODS,
  AUDIT_ACTIONS,
  getAuditActionConfig,
} from "./constants";

// ─── Approval Engine ─────────────────────────────────────────────────────────

export {
  APPROVAL_ACTION_TYPES,
  APPROVAL_ACTION_LABELS,
  APPROVAL_STATUSES,
  APPROVAL_STATUS_CONFIG,
  PRIORITY_OPTIONS,
} from "./approval-types";
export type {
  ApprovalActionType,
  ApprovalStatus,
  Priority,
  ApprovalRule,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalCheckResult,
  CreateApprovalRequestParams,
} from "./approval-types";

export {
  checkApprovalRequired,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getApprovalRules,
  getApprovalRequests,
  getApprovalDecisions,
  getPendingApprovalCount,
  findPendingRequest,
} from "./approval-service";

// ─── Collections & AR Aging ──────────────────────────────────────────────────

// Types & constants (from collections-types.ts — tree-shakeable)
export {
  COLLECTION_STATUSES,
  COLLECTION_NOTE_TYPES,
  CONTACT_METHODS,
  WRITE_OFF_REASON_CODES,
  AGING_BUCKETS,
  calculateDaysOverdue,
  getAgingBucket,
  getAgingBucketLabel,
  computeAgingSummary,
} from "./collections-types";
export type {
  CollectionStatus,
  InvoiceWithAging,
  AgingSummary,
  AgingBucket,
} from "./collections-types";

// Aging engine (from aging-engine.ts)
export { getOverdueInvoicesWithAging } from "./aging-engine";

// Operations (from collections-service.ts)
export {
  upsertCollectionStatus,
  logContactAttempt,
  recordPromiseToPay,
  recordBrokenPromise,
  getCollectionNotes,
} from "./collections-service";

// Write-off & recovery (from writeoff-service.ts — ledger-critical)
export { executeWriteOff, recordRecovery } from "./writeoff-service";

// Payer / Family profile (from payer-service.ts)
export {
  getPayerFinancialProfile,
  getPayerAccountsList,
  getParentHouseholdSummary,
} from "./payer-service";
export type {
  PayerFinancialProfile,
  PayerAccountRow,
  PayerStudent,
  PayerInvoiceSummary,
} from "./payer-service";

// ─── Pricing & Billing Rules Engine ──────────────────────────────────────────

export {
  createFeePackageVersion,
  getFeePackageHistory,
  getEffectiveRate,
  getOrCreateBillingProfile,
  getStudentBillingProfile,
  addBillingProfileItem,
  deactivateBillingProfileItem,
  getBranchBillingProfiles,
  getPricingAuditLog,
  migrateStudentFeesToProfiles,
} from "./pricing-service";
export type {
  FeePackageVersion,
  BillingProfile,
  BillingProfileItem,
  PricingAuditEntry,
} from "./pricing-service";