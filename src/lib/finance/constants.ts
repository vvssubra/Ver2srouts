/**
 * Shared financial constants for the Billing & Receivables module.
 * Single source of truth for entry types, status configs, and formatters.
 *
 * EXTENSION POINTS (do NOT remove):
 * - dispute_locked / dispute_released: When disputes feature lands
 * - allocation_applied: When N:N payment allocation lands
 */

// ─── Currency ─────────────────────────────────────────────────────────────────

export const CURRENCY = "RM";

export function formatCurrency(amount: number): string {
  return `${CURRENCY} ${Math.abs(amount).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Ledger Entry Types ───────────────────────────────────────────────────────

export interface EntryTypeConfig {
  label: string;
  color: string;
  /** Whether this entry type represents a reversal / compensating action */
  isCompensating: boolean;
}

export const LEDGER_ENTRY_TYPES: Record<string, EntryTypeConfig> = {
  invoice_issued:    { label: "Invoice Charge",    color: "bg-blue-50 text-blue-700 border-blue-200",       isCompensating: false },
  invoice_cancelled: { label: "Invoice Cancelled", color: "bg-red-50 text-red-700 border-red-200",         isCompensating: true },
  payment_received:  { label: "Payment",           color: "bg-emerald-50 text-emerald-700 border-emerald-200", isCompensating: false },
  payment_reversed:  { label: "Payment Reversal",  color: "bg-red-50 text-red-700 border-red-200",         isCompensating: true },
  credit_note_issued:{ label: "Credit Note",       color: "bg-amber-50 text-amber-700 border-amber-200",   isCompensating: false },
  credit_applied:    { label: "Credit Applied",    color: "bg-purple-50 text-purple-700 border-purple-200", isCompensating: false },
  refund:            { label: "Refund",            color: "bg-orange-50 text-orange-700 border-orange-200", isCompensating: false },
  // Wallet entry types (current)
  wallet_credit_overpayment:  { label: "Overpayment → Wallet", color: "bg-emerald-50 text-emerald-700 border-emerald-200", isCompensating: false },
  wallet_credit_cn:           { label: "Credit Note → Wallet", color: "bg-purple-50 text-purple-700 border-purple-200", isCompensating: false },
  wallet_admin_adjustment:    { label: "Admin Adjustment",     color: "bg-amber-50 text-amber-700 border-amber-200", isCompensating: false },
  auto_offset:                { label: "Wallet Offset",        color: "bg-indigo-50 text-indigo-700 border-indigo-200", isCompensating: false },
  // Legacy compat (kept for existing ledger data)
  wallet_credit_from_overpayment: { label: "Overpayment → Wallet", color: "bg-emerald-50 text-emerald-700 border-emerald-200", isCompensating: false },
  wallet_credit_from_cn:          { label: "Credit Note → Wallet", color: "bg-purple-50 text-purple-700 border-purple-200", isCompensating: false },
  wallet_adjustment:              { label: "Wallet Adjustment",    color: "bg-sky-50 text-sky-700 border-sky-200", isCompensating: false },
  // Allocation engine
  allocation_applied:  { label: "Allocation Applied", color: "bg-blue-50 text-blue-700 border-blue-200",     isCompensating: false },
  allocation_reversed: { label: "Allocation Reversed",color: "bg-red-50 text-red-700 border-red-200",       isCompensating: true },
  // Dispute / locked funds
  dispute_locked:      { label: "Funds Locked",       color: "bg-amber-50 text-amber-700 border-amber-200", isCompensating: false },
  dispute_released:    { label: "Funds Released",     color: "bg-teal-50 text-teal-700 border-teal-200",    isCompensating: true },
  // General
  write_off:         { label: "Write-Off",         color: "bg-gray-100 text-gray-600 border-gray-200",     isCompensating: false },
  recovery:          { label: "Recovery",          color: "bg-teal-50 text-teal-700 border-teal-200",       isCompensating: false },
  adjustment:        { label: "Adjustment",        color: "bg-muted text-muted-foreground border-border",  isCompensating: false },
  // FUTURE: write_off_reversal
};

export function getEntryTypeConfig(entryType: string): EntryTypeConfig {
  return LEDGER_ENTRY_TYPES[entryType] || { label: entryType.replace(/_/g, " "), color: "", isCompensating: false };
}

/** All entry types for filter dropdowns (deduped, no legacy) */
export const LEDGER_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "invoice_issued", label: "Invoice Charge" },
  { value: "invoice_cancelled", label: "Invoice Cancelled" },
  { value: "payment_received", label: "Payment" },
  { value: "payment_reversed", label: "Payment Reversal" },
  { value: "credit_note_issued", label: "Credit Note" },
  { value: "credit_applied", label: "Credit Applied" },
  { value: "refund", label: "Refund" },
  { value: "wallet_credit_overpayment", label: "Overpayment → Wallet" },
  { value: "wallet_credit_cn", label: "Credit Note → Wallet" },
  { value: "wallet_admin_adjustment", label: "Admin Adjustment" },
  { value: "auto_offset", label: "Wallet Offset" },
  { value: "allocation_applied", label: "Allocation Applied" },
  { value: "allocation_reversed", label: "Allocation Reversed" },
  { value: "dispute_locked", label: "Funds Locked" },
  { value: "dispute_released", label: "Funds Released" },
  { value: "write_off", label: "Write-Off" },
  { value: "recovery", label: "Recovery" },
];

// ─── Invoice Statuses ─────────────────────────────────────────────────────────

export interface InvoiceStatusConfig {
  label: string;
  className: string;
}

export const INVOICE_STATUSES: Record<string, InvoiceStatusConfig> = {
  draft:     { label: "Draft",          className: "bg-muted text-muted-foreground border-border" },
  issued:    { label: "Issued",         className: "bg-blue-50 text-blue-700 border-blue-200" },
  partial:   { label: "Partially Paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  paid:      { label: "Paid",           className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overdue:   { label: "Overdue",        className: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled",      className: "bg-gray-100 text-gray-400 border-gray-200 line-through" },
  // FUTURE: disputed, write_off
};

export const INVOICE_STATUS_OPTIONS = ["all", ...Object.keys(INVOICE_STATUSES)];

// ─── Payment Methods ──────────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: "cash",              label: "Cash" },
  { value: "bank_transfer",     label: "Bank Transfer" },
  { value: "cheque",            label: "Cheque" },
  { value: "billplz",           label: "BillPlz (FPX)" },
  { value: "online",            label: "Online Payment" },
  { value: "wallet",            label: "Wallet Credit" },
  { value: "dispute_reversal",  label: "Dispute Reversal" },
] as const;

// ─── Audit Action Types ───────────────────────────────────────────────────────

export interface AuditActionConfig {
  label: string;
  color: string;
  bgColor: string;
}

export const AUDIT_ACTIONS: Record<string, AuditActionConfig> = {
  invoice_created:           { label: "Invoice Created",        color: "text-blue-600",    bgColor: "bg-blue-100" },
  invoice_issued:            { label: "Invoice Issued",         color: "text-primary",     bgColor: "bg-primary/10" },
  invoice_cancelled:         { label: "Invoice Cancelled",      color: "text-red-600",     bgColor: "bg-red-100" },
  invoice_updated:           { label: "Invoice Updated",        color: "text-amber-600",   bgColor: "bg-amber-100" },
  payment_recorded:          { label: "Payment Recorded",       color: "text-emerald-600", bgColor: "bg-emerald-100" },
  payment_reversed:          { label: "Payment Reversed",       color: "text-red-600",     bgColor: "bg-red-100" },
  credit_note_issued:        { label: "Credit Note Issued",     color: "text-purple-600",  bgColor: "bg-purple-100" },
  write_off:                 { label: "Write-Off",              color: "text-gray-600",    bgColor: "bg-gray-100" },
  write_off_recovery:        { label: "Write-Off Recovery",     color: "text-teal-600",    bgColor: "bg-teal-100" },
  // Granular wallet audit actions
  wallet_credited_overpayment: { label: "Wallet Credited (Overpayment)", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  wallet_credited_cn:          { label: "Wallet Credited (Credit Note)", color: "text-purple-600",  bgColor: "bg-purple-100" },
  wallet_adjusted:             { label: "Wallet Adjusted",               color: "text-amber-600",   bgColor: "bg-amber-100" },
  wallet_offset_applied:       { label: "Wallet Offset Applied",         color: "text-indigo-600",  bgColor: "bg-indigo-100" },
  // Legacy compat
  wallet_credit:             { label: "Wallet Credit",          color: "text-sky-600",     bgColor: "bg-sky-100" },
  webhook_payment:           { label: "Gateway Payment",        color: "text-indigo-600",  bgColor: "bg-indigo-100" },
  payment_allocated:         { label: "Payment Allocated",      color: "text-blue-600",    bgColor: "bg-blue-100" },
  allocation_reversed:       { label: "Allocation Reversed",    color: "text-red-600",     bgColor: "bg-red-100" },
  // Dispute actions
  dispute_opened:            { label: "Dispute Opened",         color: "text-amber-600",   bgColor: "bg-amber-100" },
  dispute_status_changed:    { label: "Dispute Updated",        color: "text-blue-600",    bgColor: "bg-blue-100" },
  dispute_won:               { label: "Dispute Won",            color: "text-emerald-600", bgColor: "bg-emerald-100" },
  dispute_lost:              { label: "Dispute Lost",           color: "text-red-600",     bgColor: "bg-red-100" },
  dispute_resolved:          { label: "Dispute Resolved",       color: "text-muted-foreground", bgColor: "bg-muted" },
  // Approval actions
  approval_requested:        { label: "Approval Requested",     color: "text-amber-600",   bgColor: "bg-amber-100" },
  approval_granted:          { label: "Approval Granted",       color: "text-emerald-600", bgColor: "bg-emerald-100" },
  approval_rejected:         { label: "Approval Rejected",      color: "text-red-600",     bgColor: "bg-red-100" },
};

export function getAuditActionConfig(action: string): AuditActionConfig {
  return AUDIT_ACTIONS[action] || {
    label: action.replace(/_/g, " "),
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  };
}
