import { StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { Card } from "../components/ui/Card";
import { TONE_STYLES } from "../components/ui/StatusPill";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { LeaveBalance, StaffAttendance } from "../lib/hr-types";
import {
  clockStatusCopy,
  deriveClockStatus,
  pendingRequestsMessage,
  remainingDays,
  todayDateString,
} from "../lib/home";
import { color, font, radius, space } from "../theme/tokens";

type HomeDashboard = {
  attendance: StaffAttendance | null;
  leaveBalance: LeaveBalance | null;
  pendingCount: number;
};

async function fetchHomeDashboard(userId: string, now: Date): Promise<HomeDashboard> {
  const dateStr = todayDateString(now);
  const year = now.getFullYear();

  const [attendanceRes, balanceRes, leaveCountRes, claimsCountRes, overtimeCountRes] =
    await Promise.all([
      supabase
        .from("staff_attendance")
        .select("*")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .maybeSingle(),
      supabase
        .from("leave_balances")
        .select("*")
        .eq("user_id", userId)
        .eq("year", year)
        .maybeSingle(),
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending"),
      supabase
        .from("staff_claims")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending"),
      supabase
        .from("overtime_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["pending", "late_pending_approval"]),
    ]);

  if (attendanceRes.error) throw attendanceRes.error;
  if (balanceRes.error) throw balanceRes.error;
  if (leaveCountRes.error) throw leaveCountRes.error;
  if (claimsCountRes.error) throw claimsCountRes.error;
  if (overtimeCountRes.error) throw overtimeCountRes.error;

  return {
    attendance: attendanceRes.data,
    leaveBalance: balanceRes.data,
    pendingCount:
      (leaveCountRes.count ?? 0) + (claimsCountRes.count ?? 0) + (overtimeCountRes.count ?? 0),
  };
}

function formatClockTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return null;
  }
}

const CLOCK_STATUS_VISUAL: Record<
  ReturnType<typeof deriveClockStatus>,
  { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
> = {
  not_clocked_in: { icon: "time-outline", bg: TONE_STYLES.neutral.bg, fg: color.inkMuted },
  clocked_in: { icon: "radio-button-on", bg: color.primarySoft, fg: color.primary },
  completed: { icon: "checkmark-circle", bg: color.accentSoft, fg: color.accent },
};

type QuickAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function HomeScreen() {
  const { user } = useAuth();
  // The parent of HomeStack is the bottom tab navigator, and one of the
  // quick actions needs to jump into a screen nested inside MoreTab's own
  // stack — neither hop is representable by this stack's own param list,
  // so the parent navigation prop is deliberately loosely typed here.
  const navigation = useNavigation<any>();

  const now = new Date();
  const dashboardQuery = useQuery({
    queryKey: ["home-dashboard", user?.id, todayDateString(now)],
    queryFn: () => fetchHomeDashboard(user!.id, now),
    enabled: !!user?.id,
  });

  const quickActions: QuickAction[] = [
    {
      key: "clock",
      label: "Clock In/Out",
      icon: "location-outline",
      onPress: () => navigation.getParent()?.navigate("AttendanceTab"),
    },
    {
      key: "leave",
      label: "Request Leave",
      icon: "calendar-outline",
      onPress: () => navigation.getParent()?.navigate("LeaveTab"),
    },
    {
      key: "claim",
      label: "Submit Claim",
      icon: "receipt-outline",
      onPress: () => navigation.getParent()?.navigate("MoreTab", { screen: "Claims" }),
    },
    {
      key: "payslips",
      label: "View Payslips",
      icon: "document-text-outline",
      onPress: () => navigation.getParent()?.navigate("MoreTab", { screen: "Payslips" }),
    },
  ];

  const data = dashboardQuery.data;
  const clockStatus = deriveClockStatus(data?.attendance, now);
  const clockCopy = clockStatusCopy(clockStatus);
  const clockVisual = CLOCK_STATUS_VISUAL[clockStatus];
  const clockInTime = formatClockTime(data?.attendance?.clock_in ?? null);
  const clockOutTime = formatClockTime(data?.attendance?.clock_out ?? null);

  const pendingMessage = pendingRequestsMessage(data?.pendingCount ?? 0);

  return (
    <ScreenContainer
      onRefresh={() => dashboardQuery.refetch()}
      refreshing={dashboardQuery.isRefetching}
    >
      <ScreenHeader
        title="Home"
        subtitle={format(now, "EEEE, d MMMM")}
        right={
          <Pressable
            onPress={() => navigation.navigate("Notifications")}
            hitSlop={8}
            style={styles.bellButton}
          >
            <Ionicons name="notifications-outline" size={20} color={color.ink} />
          </Pressable>
        }
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionsRow}>
          {quickActions.map((action) => (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
            >
              <View style={styles.actionIconBadge}>
                <Ionicons name={action.icon} size={19} color={color.primary} />
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {dashboardQuery.isLoading ? (
        <LoadingState label="Loading your dashboard…" />
      ) : dashboardQuery.isError && !dashboardQuery.data ? (
        // `&& !data` (not just `isError`): a failed background refetch
        // shouldn't blank out an already-loaded dashboard.
        <ErrorState
          message="Couldn't load your dashboard. Check your connection and try again."
          onRetry={() => dashboardQuery.refetch()}
        />
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today</Text>
            <Card style={styles.clockCard}>
              <View style={styles.clockRow}>
                <View style={[styles.clockIconBadge, { backgroundColor: clockVisual.bg }]}>
                  <Ionicons name={clockVisual.icon} size={20} color={clockVisual.fg} />
                </View>
                <View style={styles.clockTextCol}>
                  <Text style={styles.clockTitle}>{clockCopy.title}</Text>
                  <Text style={styles.clockMessage}>{clockCopy.message}</Text>
                </View>
              </View>
              {clockInTime ? (
                <View style={styles.clockTimesRow}>
                  <View style={styles.clockTimeItem}>
                    <Text style={styles.clockTimeLabel}>Clock in</Text>
                    <Text style={styles.clockTimeValue}>{clockInTime}</Text>
                  </View>
                  <View style={styles.clockTimeItem}>
                    <Text style={styles.clockTimeLabel}>Clock out</Text>
                    <Text style={styles.clockTimeValue}>{clockOutTime ?? "—"}</Text>
                  </View>
                </View>
              ) : null}
            </Card>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Leave balance</Text>
            {data?.leaveBalance ? (
              <Card style={styles.balanceCard}>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Annual</Text>
                  <Text style={styles.balanceValue}>
                    {remainingDays(data.leaveBalance.annual_total, data.leaveBalance.annual_used)}{" "}
                    <Text style={styles.balanceUnit}>days left</Text>
                  </Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Medical</Text>
                  <Text style={styles.balanceValue}>
                    {remainingDays(data.leaveBalance.medical_total, data.leaveBalance.medical_used)}{" "}
                    <Text style={styles.balanceUnit}>days left</Text>
                  </Text>
                </View>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon="calendar-outline"
                  title="No leave balance yet"
                  message="Your leave allocation for this year hasn't been set up. Contact your center administrator."
                />
              </Card>
            )}
          </View>

          {pendingMessage ? (
            <View style={styles.section}>
              <Pressable
                onPress={() => navigation.getParent()?.navigate("LeaveTab")}
                style={({ pressed }) => [styles.pendingCard, pressed && styles.actionItemPressed]}
              >
                <Ionicons name="alert-circle-outline" size={18} color={TONE_STYLES.pending.fg} />
                <Text style={styles.pendingText}>{pendingMessage}</Text>
                <Ionicons name="chevron-forward" size={16} color={TONE_STYLES.pending.fg} />
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.paper,
  },
  section: {
    paddingHorizontal: space.xl,
    marginBottom: space.xl,
  },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: space.md,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  actionsRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  actionItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    gap: space.sm,
  },
  actionItemPressed: {
    opacity: 0.7,
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: color.ink,
    textAlign: "center",
  },
  clockCard: {
    gap: space.lg,
  },
  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  clockIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  clockTextCol: {
    flex: 1,
    gap: 2,
  },
  clockTitle: {
    fontFamily: font.semibold,
    fontSize: 15.5,
    color: color.ink,
  },
  clockMessage: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.inkMuted,
    lineHeight: 18,
  },
  clockTimesRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.md,
  },
  clockTimeItem: {
    flex: 1,
    gap: 2,
  },
  clockTimeLabel: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: color.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  clockTimeValue: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  balanceCard: {
    gap: space.md,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceDivider: {
    height: 1,
    backgroundColor: color.border,
  },
  balanceLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.ink,
  },
  balanceValue: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  balanceUnit: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: TONE_STYLES.pending.bg,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  pendingText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13.5,
    color: TONE_STYLES.pending.fg,
  },
});
