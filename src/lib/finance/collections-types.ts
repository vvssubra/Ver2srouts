/**
 * Collections & AR Aging — Types, Constants, Pure Functions.
 * 
 * No side-effects, no Supabase imports.
 * Shared across aging engine, collection operations, and write-off service.
 */

// ─── Collection Status ───────────────────────────────────────────────────────

export const COLLECTION_STATUSES = [
  { value: "none", label: "No Action", color: "bg-muted text-muted-foreground border-border" },
  { value: "monitoring", label: "Monitoring", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "active", label: "Active Collection", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "escalated", label: "Escalated", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "legal", label: "Legal Action", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "written_off", label: "Written Off", color: "bg-gray-100 text-gray-500 border-gray-200" },
  { value: "recovered", label: "Recovered", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]["value"];

// ─── Note & Contact Types ────────────────────────────────────────────────────

export const COLLECTION_NOTE_TYPES = [
  { value: "contact_attempt", label: "Contact Attempt" },
  { value: "promise_to_pay", label: "Promise to Pay" },
  { value: "reminder_sent", label: "Reminder Sent" },
  { value: "escalation", label: "Escalation" },
  { value: "write_off", label: "Write-Off" },
  { value: "recovery", label: "Recovery" },
  { value: "broken_promise", label: "Broken Promise" },
  { value: "general", label: "General Note" },
] as const;

export const CONTACT_METHODS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "in_person", label: "In Person" },
  { value: "letter", label: "Formal Letter" },
] as const;

export const WRITE_OFF_REASON_CODES = [
  { value: "bad_debt", label: "Bad Debt — Unrecoverable" },
  { value: "student_withdrawn", label: "Student Withdrawn — Balance Waived" },
  { value: "hardship", label: "Financial Hardship" },
  { value: "dispute_settlement", label: "Dispute Settlement" },
  { value: "admin_error", label: "Administrative Error" },
  { value: "small_balance", label: "Small Balance Write-Off" },
  { value: "other", label: "Other" },
] as const;

// ─── Aging Buckets ───────────────────────────────────────────────────────────

export interface AgingBucket {
  label: string;
  min: number;
  max: number | null;
  key: string;
}

export const AGING_BUCKETS: AgingBucket[] = [
  { label: "Current", min: 0, max: 0, key: "current" },
  { label: "1–30 days", min: 1, max: 30, key: "1_30" },
  { label: "31–60 days", min: 31, max: 60, key: "31_60" },
  { label: "61–90 days", min: 61, max: 90, key: "61_90" },
  { label: "90+ days", min: 91, max: null, key: "90_plus" },
];

// ─── Shared Interfaces ──────────────────────────────────────────────────────

export interface InvoiceWithAging {
  id: string;
  invoice_number: string;
  student_id: string;
  student_name: string;
  branch_id: string;
  branch_name: string;
  payer_account_id: string | null;
  payer_name: string | null;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  due_date: string;
  status: string;
  days_overdue: number;
  aging_bucket: string;
  collection_status: string;
  collection_owner_id: string | null;
  promise_to_pay_date: string | null;
  next_followup_at: string | null;
  last_contacted_at: string | null;
  broken_promise_count: number;
  written_off_amount: number;
  recovery_amount: number;
  /** Net outstanding after ledger write-offs and recoveries */
  net_outstanding: number;
  /** True if any active dispute exists for this invoice */
  has_active_dispute: boolean;
}

export interface AgingSummary {
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
  total: number;
  invoiceCount: number;
}

// ─── Pure Functions (no side-effects) ────────────────────────────────────────

export function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1_30";
  if (daysOverdue <= 60) return "31_60";
  if (daysOverdue <= 90) return "61_90";
  return "90_plus";
}

export function getAgingBucketLabel(key: string): string {
  return AGING_BUCKETS.find((b) => b.key === key)?.label ?? key;
}

export function computeAgingSummary(invoices: InvoiceWithAging[]): AgingSummary {
  const summary: AgingSummary = {
    current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0,
    total: 0, invoiceCount: invoices.length,
  };
  for (const inv of invoices) {
    const bucket = inv.aging_bucket as keyof AgingSummary;
    if (bucket in summary && typeof summary[bucket] === "number") {
      (summary as any)[bucket] += inv.net_outstanding;
    }
    summary.total += inv.net_outstanding;
  }
  return summary;
}
