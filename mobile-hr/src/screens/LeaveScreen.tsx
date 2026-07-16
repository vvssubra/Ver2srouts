import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { StatusPill, type StatusTone } from "../components/ui/StatusPill";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { CustomLeaveBalance, CustomLeaveType, LeaveBalance, LeaveRequest } from "../lib/hr-types";
import {
  buildCancelLeaveRequestUpdate,
  buildLeaveRequestInsert,
  computeDays,
  deriveLeaveDisplayStatus,
  isValidDateString,
  leaveTypeLabel,
  remainingBalance,
  remainingCustomBalance,
  requiresAttachment,
  resolveBranchId,
  STANDARD_LEAVE_TYPES,
  validateLeaveRequest,
} from "../lib/leave";
import { color, font, radius, space } from "../theme/tokens";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

type LeaveContext = {
  branchId: string | null;
  balance: LeaveBalance | null;
  customTypes: CustomLeaveType[];
  customBalances: CustomLeaveBalance[];
  requests: LeaveRequest[];
};

async function fetchCustomTypes(branchId: string | null): Promise<CustomLeaveType[]> {
  if (!branchId) return [];
  const { data, error } = await supabase
    .from("custom_leave_types")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchLeaveContext(userId: string, year: number): Promise<LeaveContext> {
  const { data: memberships, error: membershipError } = await supabase
    .from("branch_memberships")
    .select("branch_id")
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const branchId = resolveBranchId(memberships ?? []);

  const [balanceRes, requestsRes, customTypes, customBalancesRes] = await Promise.all([
    supabase.from("leave_balances").select("*").eq("user_id", userId).eq("year", year).maybeSingle(),
    supabase
      .from("leave_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    fetchCustomTypes(branchId),
    supabase.from("custom_leave_balances").select("*").eq("user_id", userId).eq("year", year),
  ]);

  if (balanceRes.error) throw new Error(balanceRes.error.message);
  if (requestsRes.error) throw new Error(requestsRes.error.message);
  if (customBalancesRes.error) throw new Error(customBalancesRes.error.message);

  return {
    branchId,
    balance: balanceRes.data ?? null,
    requests: requestsRes.data ?? [],
    customTypes,
    customBalances: customBalancesRes.data ?? [],
  };
}

async function uploadAttachment(userId: string, asset: PickedAttachment): Promise<string> {
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("leave-attachments")
    .upload(path, arrayBuffer, { contentType: asset.mimeType ?? "application/octet-stream" });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("leave-attachments").getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type LeaveTypeOption =
  | { kind: "standard"; value: string; label: string }
  | { kind: "custom"; id: string; label: string; requiresAttachment: boolean; defaultDays: number };

type PickedAttachment = { uri: string; name: string; mimeType: string | null };

type SubmitVariables = {
  leaveType: string;
  customLeaveTypeId: string | null;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  reason: string;
  days: number;
  attachment: PickedAttachment | null;
};

const DISPLAY_STATUS_TONE: Record<string, StatusTone> = {
  Approved: "positive",
  Rejected: "negative",
  Cancelled: "negative",
  Pending: "pending",
  "Awaiting final approval": "pending",
};

function useLeaveContext(userId: string | undefined, year: number) {
  return useQuery({
    queryKey: ["leave", userId, year],
    queryFn: () => fetchLeaveContext(userId as string, year),
    enabled: !!userId,
  });
}

export function LeaveScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const year = new Date().getFullYear();

  const { data, isPending, isError, refetch, isRefetching } = useLeaveContext(user?.id, year);

  const [selectedOption, setSelectedOption] = useState<LeaveTypeOption | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [attachmentPickError, setAttachmentPickError] = useState<string | null>(null);

  function resetForm() {
    setSelectedOption(null);
    setStartDate("");
    setEndDate("");
    setIsHalfDay(false);
    setReason("");
    setAttachment(null);
    setFormError(null);
    setAttachmentPickError(null);
  }

  const submitMutation = useMutation({
    mutationFn: async (vars: SubmitVariables) => {
      if (!user || !data?.branchId) {
        throw new Error("No branch assigned — contact your administrator.");
      }
      let attachmentUrl: string | null = null;
      if (vars.attachment) {
        attachmentUrl = await uploadAttachment(user.id, vars.attachment);
      }
      const insert = buildLeaveRequestInsert({
        userId: user.id,
        branchId: data.branchId,
        leaveType: vars.leaveType,
        customLeaveTypeId: vars.customLeaveTypeId,
        startDate: vars.startDate,
        endDate: vars.endDate,
        days: vars.days,
        isHalfDay: vars.isHalfDay,
        reason: vars.reason,
        attachmentUrl,
      });
      const { error } = await supabase.from("leave_requests").insert(insert);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["leave", user?.id] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (!user) throw new Error("Not signed in.");
      const update = buildCancelLeaveRequestUpdate(user.id);
      const { error } = await supabase.from("leave_requests").update(update).eq("id", requestId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave", user?.id] });
    },
  });

  async function handlePickAttachment() {
    setAttachmentPickError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setAttachment({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null });
    } catch {
      setAttachmentPickError("Couldn't open the file picker. Please try again.");
    }
  }

  function handleSubmit() {
    setFormError(null);

    if (!selectedOption) {
      setFormError("Select a leave type.");
      return;
    }
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      setFormError("Enter valid start and end dates (YYYY-MM-DD).");
      return;
    }

    const leaveType = selectedOption.kind === "custom" ? "custom" : selectedOption.value;
    const customTypeInfo =
      selectedOption.kind === "custom" ? { requires_attachment: selectedOption.requiresAttachment } : null;
    const days = computeDays(startDate, endDate, isHalfDay);

    const remaining =
      selectedOption.kind === "custom"
        ? remainingCustomBalance(
            data?.customBalances.find((b) => b.custom_leave_type_id === selectedOption.id) ?? null,
            selectedOption.defaultDays
          )
        : remainingBalance(selectedOption.value, data?.balance ?? null);

    const error = validateLeaveRequest(
      {
        leaveType,
        startDate,
        endDate,
        days,
        reason,
        hasAttachment: !!attachment,
        customType: customTypeInfo,
      },
      remaining
    );

    if (error) {
      setFormError(error);
      return;
    }

    submitMutation.mutate({
      leaveType,
      customLeaveTypeId: selectedOption.kind === "custom" ? selectedOption.id : null,
      startDate,
      endDate,
      isHalfDay,
      reason,
      days,
      attachment,
    });
  }

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Leave" subtitle="Balance, requests, and history" />
        <LoadingState label="Loading your leave details…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Leave" subtitle="Balance, requests, and history" />
        <ErrorState
          message="Couldn't load your leave details. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!data.branchId) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Leave" subtitle="Balance, requests, and history" />
        <EmptyState
          icon="business-outline"
          title="No branch assigned"
          message="You're not assigned to a branch yet, so leave requests aren't available. Contact your administrator."
        />
      </ScreenContainer>
    );
  }

  const options: LeaveTypeOption[] = [
    ...STANDARD_LEAVE_TYPES.map((t) => ({ kind: "standard" as const, value: t.value, label: t.label })),
    ...data.customTypes.map((ct) => ({
      kind: "custom" as const,
      id: ct.id,
      label: ct.name,
      requiresAttachment: ct.requires_attachment,
      defaultDays: ct.default_days,
    })),
  ];

  const previewDays =
    isValidDateString(startDate) && isValidDateString(endDate)
      ? computeDays(startDate, endDate, isHalfDay)
      : null;

  const needsAttachment = selectedOption
    ? requiresAttachment(
        selectedOption.kind === "custom" ? "custom" : selectedOption.value,
        selectedOption.kind === "custom" ? { requires_attachment: selectedOption.requiresAttachment } : null
      )
    : false;

  const submitError = submitMutation.error instanceof Error ? submitMutation.error.message : null;

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Leave" subtitle="Balance, requests, and history" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Balance ({year})</Text>
        <Card style={styles.balanceCard}>
          {STANDARD_LEAVE_TYPES.map((type, index) => {
            const remaining = remainingBalance(type.value, data.balance);
            const balanceRow = data.balance as Record<string, unknown> | null;
            const total = type.value === "unpaid" ? null : Number(balanceRow?.[`${type.value}_total`] ?? 0);
            const used = type.value === "unpaid" ? null : Number(balanceRow?.[`${type.value}_used`] ?? 0);
            return (
              <View key={type.value} style={[styles.balanceRow, index > 0 && styles.balanceRowDivider]}>
                <View style={styles.balanceLabelCol}>
                  <Text style={styles.balanceLabel}>{type.label}</Text>
                  <Text style={styles.balanceSub}>
                    {remaining === Infinity ? "No cap on unpaid leave" : `${used ?? 0} used of ${total ?? 0}`}
                  </Text>
                </View>
                <Text style={styles.balanceValue}>
                  {remaining === Infinity ? "—" : remaining}
                  {remaining !== Infinity ? <Text style={styles.balanceUnit}> left</Text> : null}
                </Text>
              </View>
            );
          })}
          {data.customTypes.map((ct) => {
            const bal = data.customBalances.find((b) => b.custom_leave_type_id === ct.id) ?? null;
            const remaining = remainingCustomBalance(bal, ct.default_days);
            return (
              <View key={ct.id} style={[styles.balanceRow, styles.balanceRowDivider]}>
                <View style={styles.balanceLabelCol}>
                  <Text style={styles.balanceLabel}>{ct.name}</Text>
                  <Text style={styles.balanceSub}>
                    {bal ? `${bal.used} used of ${bal.total}` : "Not yet assigned"}
                  </Text>
                </View>
                <Text style={styles.balanceValue}>
                  {remaining}
                  <Text style={styles.balanceUnit}> left</Text>
                </Text>
              </View>
            );
          })}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Request leave</Text>
        <Card>
          <Text style={styles.fieldLabel}>Leave type</Text>
          <View style={styles.chipsWrap}>
            {options.map((option) => {
              const key = option.kind === "standard" ? option.value : option.id;
              const isSelected = !!(
                selectedOption &&
                ((selectedOption.kind === "standard" &&
                  option.kind === "standard" &&
                  selectedOption.value === option.value) ||
                  (selectedOption.kind === "custom" && option.kind === "custom" && selectedOption.id === option.id))
              );
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelectedOption(option)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <TextField
                label="Start date"
                icon="calendar-outline"
                placeholder="YYYY-MM-DD"
                value={startDate}
                onChangeText={(t) => {
                  setStartDate(t);
                  if (isHalfDay) setEndDate(t);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.dateCol}>
              <TextField
                label="End date"
                icon="calendar-outline"
                placeholder="YYYY-MM-DD"
                value={endDate}
                onChangeText={setEndDate}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isHalfDay}
              />
            </View>
          </View>

          <View style={styles.halfDayRow}>
            <View>
              <Text style={styles.halfDayLabel}>Half day</Text>
              {previewDays !== null ? (
                <Text style={styles.halfDaySub}>
                  {previewDays} day{previewDays === 1 ? "" : "s"} total
                </Text>
              ) : null}
            </View>
            <Switch
              value={isHalfDay}
              onValueChange={(v) => {
                setIsHalfDay(v);
                if (v) setEndDate(startDate);
              }}
              trackColor={{ false: color.border, true: color.primarySoft }}
              thumbColor={isHalfDay ? color.primary : "#FFFFFF"}
              ios_backgroundColor={color.border}
            />
          </View>

          <TextField
            label="Reason (optional)"
            icon="chatbubble-ellipses-outline"
            placeholder="Add a short note"
            value={reason}
            onChangeText={setReason}
            returnKeyType="done"
          />

          <View style={styles.attachmentSection}>
            <Text style={styles.fieldLabel}>Attachment{needsAttachment ? " (required)" : " (optional)"}</Text>
            {attachment ? (
              <View style={styles.attachmentRow}>
                <Ionicons name="document-attach-outline" size={17} color={color.primary} />
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {attachment.name}
                </Text>
                <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={color.inkFaint} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handlePickAttachment} style={styles.attachmentButton}>
                <Ionicons name="attach-outline" size={17} color={color.primary} />
                <Text style={styles.attachmentButtonText}>Attach document</Text>
              </Pressable>
            )}
            {attachmentPickError ? <Text style={styles.errorText}>{attachmentPickError}</Text> : null}
          </View>

          {formError ? (
            <View style={styles.formErrorRow}>
              <Ionicons name="alert-circle" size={15} color={color.danger} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}
          {submitError ? (
            <View style={styles.formErrorRow}>
              <Ionicons name="alert-circle" size={15} color={color.danger} />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}

          <Button label="Submit request" onPress={handleSubmit} loading={submitMutation.isPending} style={styles.submit} />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History</Text>
        {data.requests.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="No leave requests yet"
              message="Requests you submit will show up here with their approval status."
            />
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {data.requests.map((row, index) => {
              const displayStatus = deriveLeaveDisplayStatus(row);
              const tone = DISPLAY_STATUS_TONE[displayStatus] ?? "neutral";
              const canCancel = row.status === "pending";
              return (
                <View key={row.id} style={[styles.historyRow, index > 0 && styles.historyRowDivider]}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyType}>{leaveTypeLabel(row, data.customTypes)}</Text>
                    <StatusPill label={displayStatus} tone={tone} />
                  </View>
                  <Text style={styles.historyDates}>
                    {row.start_date} → {row.end_date} · {row.days} day{row.days === 1 ? "" : "s"}
                  </Text>
                  {row.reason ? <Text style={styles.historyReason}>{row.reason}</Text> : null}
                  {canCancel ? (
                    <Pressable onPress={() => cancelMutation.mutate(row.id)} hitSlop={6} style={styles.cancelLink}>
                      <Text style={styles.cancelLinkText}>
                        {cancelMutation.isPending && cancelMutation.variables === row.id
                          ? "Cancelling…"
                          : "Cancel request"}
                      </Text>
                    </Pressable>
                  ) : null}
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
  balanceCard: {
    padding: 0,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  balanceRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  balanceLabelCol: {
    gap: 2,
  },
  balanceLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.ink,
  },
  balanceSub: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkMuted,
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
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: space.sm,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.lg,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipSelected: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  chipLabel: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  chipLabelSelected: {
    color: "#FFFFFF",
  },
  dateRow: {
    flexDirection: "row",
    gap: space.md,
  },
  dateCol: {
    flex: 1,
  },
  halfDayRow: {
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
  halfDayLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: color.ink,
  },
  halfDaySub: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 2,
  },
  attachmentSection: {
    marginBottom: space.lg,
  },
  attachmentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: color.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  attachmentButtonText: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.primary,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  attachmentName: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13,
    color: color.ink,
  },
  formErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  historyType: {
    fontFamily: font.semibold,
    fontSize: 14.5,
    color: color.ink,
  },
  historyDates: {
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
  cancelLink: {
    marginTop: 2,
    alignSelf: "flex-start",
  },
  cancelLinkText: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    color: color.danger,
  },
});
