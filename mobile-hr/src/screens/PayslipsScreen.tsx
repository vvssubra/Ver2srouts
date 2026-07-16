import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { StatusPill, toneForStatus, formatStatusLabel } from "../components/ui/StatusPill";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import {
  formatAmount,
  formatPayPeriod,
  isVisiblePayslipStatus,
  sortPayslipsDescending,
  summarizePayslip,
} from "../lib/payslips";
import type { PayrollRecord } from "../lib/hr-types";
import { color, font, radius, space } from "../theme/tokens";

async function fetchPayslips(userId: string): Promise<PayrollRecord[]> {
  const { data, error } = await supabase
    .from("payroll_records")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["confirmed", "paid"]);
  if (error) throw new Error(error.message);
  // Belt-and-braces client-side filter in case of any status drift, plus
  // the year/month-desc ordering the business logic defines.
  return sortPayslipsDescending((data ?? []).filter((r) => isVisiblePayslipStatus(r.status)));
}

function usePayslips(userId: string | undefined) {
  return useQuery({
    queryKey: ["payslips", userId],
    queryFn: () => fetchPayslips(userId as string),
    enabled: !!userId,
  });
}

export function PayslipsScreen() {
  const { user } = useAuth();
  const { data, isPending, isError, refetch, isRefetching } = usePayslips(user?.id);
  const [selected, setSelected] = useState<PayrollRecord | null>(null);

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Payslips" subtitle="Your pay history" />
        <LoadingState label="Loading your payslips…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Payslips" subtitle="Your pay history" />
        <ErrorState
          message="Couldn't load your payslips. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  if (selected) {
    return <PayslipDetail record={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Payslips" subtitle="Your pay history" />

      <View style={styles.section}>
        {data.length === 0 ? (
          <Card>
            <EmptyState
              icon="document-text-outline"
              title="No payslips yet"
              message="Once a pay period is confirmed by payroll, it will show up here."
            />
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {data.map((record, index) => (
              <Pressable
                key={record.id}
                onPress={() => setSelected(record)}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowPeriod}>{formatPayPeriod(record.month, record.year)}</Text>
                  <Text style={styles.rowNet}>{formatAmount(record.net_salary)} net</Text>
                </View>
                <View style={styles.rowMetaCol}>
                  <StatusPill
                    label={formatStatusLabel(record.status)}
                    tone={toneForStatus(record.status)}
                  />
                  <Ionicons name="chevron-forward" size={16} color={color.inkFaint} />
                </View>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

function PayslipDetail({ record, onBack }: { record: PayrollRecord; onBack: () => void }) {
  const summary = summarizePayslip(record);

  return (
    <ScreenContainer>
      <ScreenHeader
        title={formatPayPeriod(record.month, record.year)}
        subtitle="Payslip detail"
        right={
          <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
            <Ionicons name="close" size={20} color={color.inkMuted} />
          </Pressable>
        }
      />

      <View style={styles.section}>
        <Card>
          <View style={styles.statusRow}>
            <StatusPill
              label={formatStatusLabel(record.status)}
              tone={toneForStatus(record.status)}
            />
          </View>

          <Text style={styles.groupTitle}>Earnings</Text>
          {summary.earnings.length === 0 ? (
            <Text style={styles.emptyLine}>No earnings recorded for this period.</Text>
          ) : (
            summary.earnings.map((line) => (
              <View key={line.label} style={styles.lineRow}>
                <Text style={styles.lineLabel}>{line.label}</Text>
                <Text style={styles.lineAmount}>{formatAmount(line.amount)}</Text>
              </View>
            ))
          )}

          <Text style={[styles.groupTitle, styles.groupTitleSpaced]}>Deductions</Text>
          {summary.deductions.length === 0 ? (
            <Text style={styles.emptyLine}>No deductions for this period.</Text>
          ) : (
            summary.deductions.map((line) => (
              <View key={line.label} style={styles.lineRow}>
                <Text style={styles.lineLabel}>{line.label}</Text>
                <Text style={[styles.lineAmount, styles.deductionAmount]}>
                  −{formatAmount(line.amount)}
                </Text>
              </View>
            ))
          )}

          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net pay</Text>
            <Text style={styles.netAmount}>{formatAmount(summary.net)}</Text>
          </View>
        </Card>

        <Text style={styles.footnote}>
          PDF export isn't available yet — come back to this screen any time to check the numbers.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: space.xl,
    marginBottom: space.xl,
  },
  listCard: {
    padding: 0,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  rowPressed: {
    backgroundColor: color.paper,
  },
  rowTextCol: {
    gap: 3,
  },
  rowPeriod: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  rowNet: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.inkMuted,
  },
  rowMetaCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.paper,
    borderWidth: 1,
    borderColor: color.border,
  },
  statusRow: {
    marginBottom: space.lg,
  },
  groupTitle: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    color: color.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: space.sm,
  },
  groupTitleSpaced: {
    marginTop: space.lg,
  },
  emptyLine: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.inkFaint,
    marginBottom: space.xs,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  lineLabel: {
    fontFamily: font.regular,
    fontSize: 14,
    color: color.ink,
  },
  lineAmount: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.ink,
  },
  deductionAmount: {
    color: color.danger,
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  netLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  netAmount: {
    fontFamily: font.extrabold,
    fontSize: 18,
    color: color.accent,
  },
  footnote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkFaint,
    marginTop: space.md,
    textAlign: "center",
  },
});
