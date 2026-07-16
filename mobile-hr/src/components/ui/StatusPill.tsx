import { StyleSheet, Text, View } from "react-native";
import { color, font, radius } from "../../theme/tokens";

export type StatusTone = "neutral" | "pending" | "positive" | "negative" | "info";

/**
 * Exported so screens that build a bespoke banner/badge in a status tone
 * (rather than rendering a `<StatusPill>` itself) still pull the same
 * colors instead of hardcoding a second copy that can drift from this one.
 */
export const TONE_STYLES: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: "#F1F0F6", fg: color.inkMuted },
  pending: { bg: "#FEF3E2", fg: "#B5680A" },
  positive: { bg: color.accentSoft, fg: color.accent },
  negative: { bg: color.dangerSoft, fg: color.danger },
  info: { bg: color.primarySoft, fg: color.primaryDark },
};

/**
 * Maps the many raw status strings used across HR tables (leave_requests,
 * staff_claims, overtime_requests, payroll_records all use slightly
 * different vocabularies) to one consistent visual tone.
 */
export function toneForStatus(status: string | null | undefined): StatusTone {
  switch (status) {
    case "approved":
    case "paid":
    case "confirmed":
    case "completed":
    case "present":
      return "positive";
    case "rejected":
    case "cancelled":
    case "reversed":
      return "negative";
    case "pending":
    case "pending_payroll":
    case "pending_approval":
    case "level1_approved":
    case "assigned_next_payroll":
    case "late":
    case "absent":
      return "pending";
    case "draft":
      return "neutral";
    default:
      return "info";
  }
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  const palette = TONE_STYLES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11.5,
  },
});
