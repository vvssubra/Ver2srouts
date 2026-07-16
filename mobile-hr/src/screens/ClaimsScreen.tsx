import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card } from "../components/ui/Card";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { StatusPill, toneForStatus, formatStatusLabel } from "../components/ui/StatusPill";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import {
  buildClaimInsert,
  claimTypeLabel,
  CLAIM_TYPES,
  deriveClaimDisplayStatus,
  formatAmount,
  resolveBranchId,
  validateClaimInput,
} from "../lib/claims";
import type { StaffClaim } from "../lib/hr-types";
import { color, font, radius, space } from "../theme/tokens";

function todayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

type ClaimsData = {
  branchId: string | null;
  claims: StaffClaim[];
};

async function fetchClaimsData(userId: string): Promise<ClaimsData> {
  const { data: memberships, error: membershipError } = await supabase
    .from("branch_memberships")
    .select("branch_id")
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const branchId = resolveBranchId(memberships ?? []);

  const { data: claims, error: claimsError } = await supabase
    .from("staff_claims")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (claimsError) throw new Error(claimsError.message);

  return { branchId, claims: claims ?? [] };
}

async function uploadReceipt(userId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from("staff-claims")
    .upload(path, arrayBuffer, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("staff-claims").getPublicUrl(path);
  return data.publicUrl;
}

type SubmitVariables = {
  claimType: string;
  description: string;
  amount: number;
  claimDate: string;
  receiptUri: string | null;
};

function useClaimsData(userId: string | undefined) {
  return useQuery({
    queryKey: ["claims", userId],
    queryFn: () => fetchClaimsData(userId as string),
    enabled: !!userId,
  });
}

export function ClaimsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [claimType, setClaimType] = useState<string>(CLAIM_TYPES[0].value);
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [claimDate, setClaimDate] = useState(todayDateString());
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isPending, isError, refetch, isRefetching } = useClaimsData(user?.id);

  const submitMutation = useMutation({
    mutationFn: async (vars: SubmitVariables) => {
      if (!user || !data?.branchId) {
        throw new Error("No branch assigned — contact your administrator.");
      }
      let receiptUrl: string | null = null;
      if (vars.receiptUri) {
        receiptUrl = await uploadReceipt(user.id, vars.receiptUri);
      }
      const insert = buildClaimInsert({
        userId: user.id,
        branchId: data.branchId,
        claimType: vars.claimType,
        description: vars.description,
        amount: vars.amount,
        claimDate: vars.claimDate,
        receiptUrl,
      });
      const { error } = await supabase.from("staff_claims").insert(insert);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDescription("");
      setAmountText("");
      setClaimDate(todayDateString());
      setReceiptUri(null);
      setClaimType(CLAIM_TYPES[0].value);
      queryClient.invalidateQueries({ queryKey: ["claims", user?.id] });
    },
  });

  async function handlePickReceipt() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setFormError("Enable photo library access for Sprout Staff to attach a receipt.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  }

  function handleSubmit() {
    const amount = parseFloat(amountText);
    const validationError = validateClaimInput({ claimType, description, amount });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    submitMutation.mutate({ claimType, description, amount, claimDate, receiptUri });
  }

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Claims" subtitle="Expense reimbursements" />
        <LoadingState label="Loading your claims…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Claims" subtitle="Expense reimbursements" />
        <ErrorState
          message="Couldn't load your claims. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!data.branchId) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Claims" subtitle="Expense reimbursements" />
        <EmptyState
          icon="business-outline"
          title="No branch assigned"
          message="You're not assigned to a branch yet, so submitting claims isn't available. Contact your administrator."
        />
      </ScreenContainer>
    );
  }

  const submitError = submitMutation.error as Error | null;

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Claims" subtitle="Expense reimbursements" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Submit a claim</Text>
        <Card>
          <Text style={styles.fieldLabel}>Claim type</Text>
          <View style={styles.chipRow}>
            {CLAIM_TYPES.map((type) => {
              const selected = type.value === claimType;
              return (
                <Pressable
                  key={type.value}
                  onPress={() => setClaimType(type.value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {type.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="Description"
            icon="document-text-outline"
            placeholder="e.g. Grab rides to branch training"
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              if (formError) setFormError(null);
            }}
            returnKeyType="next"
          />

          <TextField
            label="Amount (RM)"
            icon="cash-outline"
            placeholder="0.00"
            value={amountText}
            onChangeText={(t) => {
              setAmountText(t);
              if (formError) setFormError(null);
            }}
            keyboardType="decimal-pad"
            returnKeyType="next"
          />

          <TextField
            label="Claim date"
            icon="calendar-outline"
            placeholder="yyyy-MM-dd"
            value={claimDate}
            onChangeText={setClaimDate}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />

          <Pressable onPress={handlePickReceipt} style={styles.receiptRow}>
            <Ionicons
              name={receiptUri ? "checkmark-circle" : "camera-outline"}
              size={18}
              color={receiptUri ? color.accent : color.inkMuted}
            />
            <Text style={styles.receiptText}>
              {receiptUri ? "Receipt photo attached" : "Attach receipt photo (optional)"}
            </Text>
          </Pressable>

          {formError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color={color.danger} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}

          {submitError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={13} color={color.danger} />
              <Text style={styles.errorText}>{submitError.message}</Text>
            </View>
          ) : null}

          <Button
            label="Submit claim"
            loading={submitMutation.isPending}
            onPress={handleSubmit}
            style={styles.submit}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>History</Text>
        {data.claims.length === 0 ? (
          <Card>
            <EmptyState
              icon="receipt-outline"
              title="No claims yet"
              message="Claims you submit will show up here with their approval status."
            />
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {data.claims.map((claim, index) => {
              const displayStatus = deriveClaimDisplayStatus(claim);
              return (
                <View
                  key={claim.id}
                  style={[styles.claimRow, index > 0 && styles.claimRowDivider]}
                >
                  <View style={styles.claimTextCol}>
                    <Text style={styles.claimType}>{claimTypeLabel(claim.claim_type)}</Text>
                    <Text style={styles.claimDescription} numberOfLines={1}>
                      {claim.description}
                    </Text>
                    <Text style={styles.claimDate}>
                      {format(parseISO(claim.claim_date), "d MMM yyyy")}
                    </Text>
                  </View>
                  <View style={styles.claimMetaCol}>
                    <Text style={styles.claimAmount}>{formatAmount(claim.amount)}</Text>
                    <StatusPill
                      label={formatStatusLabel(displayStatus)}
                      tone={toneForStatus(displayStatus)}
                    />
                  </View>
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
    fontSize: 13.5,
    color: color.inkMuted,
    marginBottom: space.md,
  },
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: space.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.lg,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chipSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  chipLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
  },
  chipLabelSelected: {
    color: color.primaryDark,
    fontFamily: font.semibold,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
  receiptText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: space.md,
  },
  errorText: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.danger,
    flex: 1,
  },
  submit: {
    marginTop: space.xs,
  },
  listCard: {
    padding: 0,
  },
  claimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  claimRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  claimTextCol: {
    flex: 1,
    gap: 2,
  },
  claimType: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: color.ink,
  },
  claimDescription: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.inkMuted,
  },
  claimDate: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.inkFaint,
  },
  claimMetaCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  claimAmount: {
    fontFamily: font.bold,
    fontSize: 14.5,
    color: color.ink,
  },
});
