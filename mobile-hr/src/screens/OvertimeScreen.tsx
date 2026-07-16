import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card } from "../components/ui/Card";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { StatusPill, toneForStatus } from "../components/ui/StatusPill";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import {
  buildOvertimeInsert,
  buildShiftTimestamps,
  computeHours,
  deriveOvertimeDisplayStatus,
  isValidDateString,
  isValidTimeString,
  isWithinSubmissionWindow,
  resolveBranchId,
  validateOvertimeRequest,
} from "../lib/overtime";
import type { OvertimeRequest } from "../lib/hr-types";
import { color, font, radius, space } from "../theme/tokens";

function todayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

type OvertimeData = {
  branchId: string | null;
  requests: OvertimeRequest[];
};

async function fetchOvertimeData(userId: string): Promise<OvertimeData> {
  const { data: memberships, error: membershipError } = await supabase
    .from("branch_memberships")
    .select("branch_id")
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const branchId = resolveBranchId(memberships ?? []);

  const { data: requests, error: requestsError } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (requestsError) throw new Error(requestsError.message);

  return { branchId, requests: requests ?? [] };
}

function useOvertimeData(userId: string | undefined) {
  return useQuery({
    queryKey: ["overtime", userId],
    queryFn: () => fetchOvertimeData(userId as string),
    enabled: !!userId,
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type SubmitVariables = {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export function OvertimeScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(todayDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isPending, isError, refetch, isRefetching } = useOvertimeData(user?.id);

  const submitMutation = useMutation({
    mutationFn: async (vars: SubmitVariables) => {
      if (!user || !data?.branchId) {
        throw new Error("No branch assigned — contact your administrator.");
      }
      const { startDateTime, endDateTime } = buildShiftTimestamps(
        vars.date,
        vars.startTime,
        vars.endTime
      );
      const hours = computeHours(startDateTime, endDateTime);
      const insert = buildOvertimeInsert({
        userId: user.id,
        branchId: data.branchId,
        date: vars.date,
        startDateTime,
        endDateTime,
        hours,
        reason: vars.reason,
        submittedAt: new Date().toISOString(),
      });
      // The server enforces the submission window independently (via the
      // enforce_ot_submission_window trigger) — the client-side check in
      // handleSubmit is just a fast, friendly pre-check. If the two ever
      // disagree, surface whatever Postgres says rather than pretending
      // the insert always succeeds.
      const { error } = await supabase.from("overtime_requests").insert(insert);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setStartTime("");
      setEndTime("");
      setReason("");
      setDate(todayDateString());
      queryClient.invalidateQueries({ queryKey: ["overtime", user?.id] });
    },
  });

  function handleSubmit() {
    setFormError(null);

    if (!isValidDateString(date)) {
      setFormError("Enter a valid date (YYYY-MM-DD).");
      return;
    }
    if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
      setFormError("Enter valid start and end times (HH:MM, 24-hour).");
      return;
    }

    const { startDateTime, endDateTime } = buildShiftTimestamps(date, startTime, endTime);
    const hours = computeHours(startDateTime, endDateTime);

    const validationError = validateOvertimeRequest({ date, startTime, endTime, hours, reason });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!isWithinSubmissionWindow(date, todayDateString())) {
      setFormError(
        "Overtime can only be submitted for the previous, current, or next calendar month."
      );
      return;
    }

    submitMutation.mutate({ date, startTime, endTime, reason });
  }

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Overtime" subtitle="Requests and history" />
        <LoadingState label="Loading your overtime requests…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Overtime" subtitle="Requests and history" />
        <ErrorState
          message="Couldn't load your overtime requests. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!data.branchId) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Overtime" subtitle="Requests and history" />
        <EmptyState
          icon="business-outline"
          title="No branch assigned"
          message="You're not assigned to a branch yet, so overtime requests aren't available. Contact your administrator."
        />
      </ScreenContainer>
    );
  }

  const previewHours =
    isValidTimeString(startTime) && isValidTimeString(endTime)
      ? (() => {
          const { startDateTime, endDateTime } = buildShiftTimestamps(date, startTime, endTime);
          return computeHours(startDateTime, endDateTime);
        })()
      : null;

  const submitError = submitMutation.error instanceof Error ? submitMutation.error.message : null;

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Overtime" subtitle="Requests and history" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Submit a request</Text>
        <Card>
          <TextField
            label="Date"
            icon="calendar-outline"
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={(t) => {
              setDate(t);
              if (formError) setFormError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <TextField
                label="Start time"
                icon="time-outline"
                placeholder="HH:MM"
                value={startTime}
                onChangeText={(t) => {
                  setStartTime(t);
                  if (formError) setFormError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
            <View style={styles.timeCol}>
              <TextField
                label="End time"
                icon="time-outline"
                placeholder="HH:MM"
                value={endTime}
                onChangeText={(t) => {
                  setEndTime(t);
                  if (formError) setFormError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>
          </View>

          {previewHours !== null ? (
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Hours</Text>
              <Text style={styles.previewValue}>
                {previewHours > 0 ? previewHours : "—"}
                {previewHours > 0 ? <Text style={styles.previewUnit}> h</Text> : null}
              </Text>
            </View>
          ) : null}

          <TextField
            label="Reason"
            icon="chatbubble-ellipses-outline"
            placeholder="What did the extra hours cover?"
            value={reason}
            onChangeText={(t) => {
              setReason(t);
              if (formError) setFormError(null);
            }}
            returnKeyType="done"
          />

          {formError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color={color.danger} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}
          {submitError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color={color.danger} />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}

          <Button
            label="Submit request"
            loading={submitMutation.isPending}
            onPress={handleSubmit}
            style={styles.submit}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History</Text>
        {data.requests.length === 0 ? (
          <Card>
            <EmptyState
              icon="time-outline"
              title="No overtime requests yet"
              message="Requests you submit will show up here with their status."
            />
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {data.requests.map((row, index) => {
              const displayStatus = deriveOvertimeDisplayStatus(row);
              const tone = toneForStatus(row.status);
              return (
                <View key={row.id} style={[styles.historyRow, index > 0 && styles.historyRowDivider]}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyDate}>
                      {format(new Date(`${row.date}T00:00:00`), "d MMM yyyy")}
                    </Text>
                    <StatusPill label={displayStatus} tone={tone} />
                  </View>
                  <Text style={styles.historyTimes}>
                    {row.start_time.slice(11, 16)} → {row.end_time.slice(11, 16)} · {row.hours} h
                  </Text>
                  {row.reason ? <Text style={styles.historyReason}>{row.reason}</Text> : null}
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  timeRow: {
    flexDirection: "row",
    gap: space.md,
  },
  timeCol: {
    flex: 1,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: color.paper,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginBottom: space.lg,
    marginTop: -space.xs,
  },
  previewLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.ink,
  },
  previewValue: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  previewUnit: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: space.md,
  },
  errorText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.danger,
  },
  submit: {
    marginTop: space.xs,
  },
  listCard: {
    padding: 0,
  },
  historyRow: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 6,
  },
  historyRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyDate: {
    fontFamily: font.semibold,
    fontSize: 14.5,
    color: color.ink,
  },
  historyTimes: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  historyReason: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
    fontStyle: "italic",
  },
});
