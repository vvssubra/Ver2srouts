/**
 * Centralized Billing Service — Facade
 * 
 * This file re-exports all billing operations from focused modules.
 * Existing imports from "@/lib/billing-service" continue to work.
 * 
 * For new code, prefer importing from "@/lib/finance" directly.
 * 
 * Module structure:
 * - src/lib/finance/ledger-core.ts    — append-only ledger & audit writes
 * - src/lib/finance/invoice-service.ts — create, issue, cancel invoices
 * - src/lib/finance/payment-service.ts — record & reverse payments
 * - src/lib/finance/constants.ts      — shared types, configs, formatters
 */

export {
  writeLedgerEntry,
  writeAuditEntry,
  issueInvoice,
  cancelInvoice,
  createInvoice,
  voidInvoice,
  recordPayment,
  reversePayment,
  getWalletBalance,
  creditWalletFromOverpayment,
  creditWalletFromCreditNote,
  adminWalletAdjustment,
  applyWalletToInvoice,
} from "./finance";

export type {
  LedgerEntry,
  AuditEntry,
  CreateInvoiceParams,
} from "./finance";
