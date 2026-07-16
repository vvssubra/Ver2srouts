import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Unified status badge for Finance / Attendance / HR / Learning across the app.
 * Falls back to neutral styling for unknown statuses.
 */
export type StatusKey =
  // finance
  | "paid" | "pending" | "overdue" | "partial" | "partially_paid" | "refunded" | "disputed" | "draft" | "cancelled" | "void"
  // attendance
  | "present" | "absent" | "late" | "checked_in" | "checked_out" | "excused"
  // hr
  | "approved" | "rejected"
  // learning
  | "published" | "reviewed" | "needs_attention" | "in_progress" | "completed";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  // finance
  paid:            { label: "Paid",            className: "bg-success/10 text-success border-success/20" },
  pending:         { label: "Pending",         className: "bg-warning/10 text-warning border-warning/20" },
  overdue:         { label: "Overdue",         className: "bg-destructive/10 text-destructive border-destructive/20" },
  partial:         { label: "Partially Paid",  className: "bg-info/10 text-info border-info/20" },
  partially_paid:  { label: "Partially Paid",  className: "bg-info/10 text-info border-info/20" },
  refunded:        { label: "Refunded",        className: "bg-muted text-muted-foreground border-border" },
  disputed:        { label: "Disputed",        className: "bg-destructive/10 text-destructive border-destructive/20" },
  draft:           { label: "Draft",           className: "bg-muted text-muted-foreground border-border" },
  cancelled:       { label: "Cancelled",       className: "bg-muted text-muted-foreground border-border" },
  void:            { label: "Void",            className: "bg-muted text-muted-foreground border-border" },
  // attendance
  present:         { label: "Present",         className: "bg-success/10 text-success border-success/20" },
  absent:          { label: "Absent",          className: "bg-destructive/10 text-destructive border-destructive/20" },
  late:            { label: "Late",            className: "bg-warning/10 text-warning border-warning/20" },
  checked_in:      { label: "Checked In",      className: "bg-success/10 text-success border-success/20" },
  checked_out:     { label: "Checked Out",     className: "bg-muted text-muted-foreground border-border" },
  excused:         { label: "Excused",         className: "bg-info/10 text-info border-info/20" },
  // hr
  approved:        { label: "Approved",        className: "bg-success/10 text-success border-success/20" },
  rejected:        { label: "Rejected",        className: "bg-destructive/10 text-destructive border-destructive/20" },
  // learning
  published:       { label: "Published",       className: "bg-success/10 text-success border-success/20" },
  reviewed:        { label: "Reviewed",        className: "bg-info/10 text-info border-info/20" },
  needs_attention: { label: "Needs Attention", className: "bg-warning/10 text-warning border-warning/20" },
  in_progress:     { label: "In Progress",     className: "bg-info/10 text-info border-info/20" },
  completed:       { label: "Completed",       className: "bg-success/10 text-success border-success/20" },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = status?.toLowerCase().replace(/\s+/g, "_");
  const cfg = STATUS_STYLES[key] ?? { label: label ?? status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <Badge variant="outline" className={cn("font-medium border", cfg.className, className)}>
      {label ?? cfg.label}
    </Badge>
  );
}

export default StatusBadge;