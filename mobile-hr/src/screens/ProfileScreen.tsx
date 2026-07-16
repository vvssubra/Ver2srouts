import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { format, parseISO } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { TextField } from "../components/ui/TextField";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { Profile, StaffDocument, StaffProfile } from "../lib/hr-types";
import {
  buildStaffProfileUpdate,
  displayName,
  formatEmploymentType,
  maskedOrNotSet,
  validateProfileEdit,
} from "../lib/profile";
import { color, font, radius, space } from "../theme/tokens";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

type ProfileContext = {
  profile: Profile | null;
  staffProfile: StaffProfile | null;
  documents: StaffDocument[];
};

async function fetchProfileContext(userId: string): Promise<ProfileContext> {
  const [profileRes, staffProfileRes, documentsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("staff_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("staff_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);
  if (staffProfileRes.error) throw new Error(staffProfileRes.error.message);
  if (documentsRes.error) throw new Error(documentsRes.error.message);

  return {
    profile: profileRes.data ?? null,
    staffProfile: staffProfileRes.data ?? null,
    documents: documentsRes.data ?? [],
  };
}

async function uploadDocument(
  userId: string,
  asset: { uri: string; name: string; mimeType: string | null },
  documentType: string
): Promise<void> {
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("staff-documents")
    .upload(path, arrayBuffer, { contentType: asset.mimeType ?? "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from("staff-documents").getPublicUrl(path);

  const { error: insertError } = await supabase.from("staff_documents").insert({
    user_id: userId,
    document_type: documentType,
    file_name: asset.name,
    file_url: publicUrlData.publicUrl,
    uploaded_by: userId,
  });
  if (insertError) throw new Error(insertError.message);
}

// ---------------------------------------------------------------------------
// Local types / constants
// ---------------------------------------------------------------------------

type PickedDocument = { uri: string; name: string; mimeType: string | null };

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "ic_copy", label: "IC copy" },
  { value: "contract", label: "Contract" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

function documentTypeLabel(value: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? "Other";
}

function useProfileContext(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfileContext(userId as string),
    enabled: !!userId,
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch, isRefetching } = useProfileContext(user?.id);

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState(DOCUMENT_TYPES[3].value);
  const [pickError, setPickError] = useState<string | null>(null);
  const prefilled = useRef(false);

  useEffect(() => {
    if (!prefilled.current && data) {
      setPhone(data.staffProfile?.phone ?? "");
      setAddress(data.staffProfile?.address ?? "");
      setEmergencyName(data.staffProfile?.emergency_contact_name ?? "");
      setEmergencyPhone(data.staffProfile?.emergency_contact_phone ?? "");
      prefilled.current = true;
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in.");
      const update = buildStaffProfileUpdate({
        phone,
        address,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone,
      });

      const { error: staffError } = await supabase
        .from("staff_profiles")
        .update(update)
        .eq("user_id", user.id);
      if (staffError) throw new Error(staffError.message);

      // `phone` also lives on `profiles` — mirror it there so the rest of
      // the app (which reads profiles.phone) stays in sync.
      if (update.phone !== undefined) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ phone: update.phone })
          .eq("id", user.id);
        if (profileError) throw new Error(profileError.message);
      }
    },
    onSuccess: () => {
      setSaveSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (vars: { asset: PickedDocument; documentType: string }) => {
      if (!user) throw new Error("Not signed in.");
      await uploadDocument(user.id, vars.asset, vars.documentType);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  async function handlePickDocument() {
    setPickError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      uploadMutation.mutate({
        asset: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null },
        documentType: selectedDocType,
      });
    } catch {
      setPickError("Couldn't open the file picker. Please try again.");
    }
  }

  function handleSave() {
    setFormError(null);
    setSaveSuccess(false);
    const error = validateProfileEdit({
      phone,
      address,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
    });
    if (error) {
      setFormError(error);
      return;
    }
    saveMutation.mutate();
  }

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Profile" subtitle="Your details and documents" />
        <LoadingState label="Loading your profile…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Profile" subtitle="Your details and documents" />
        <ErrorState
          message="Couldn't load your profile. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  const { profile, staffProfile, documents } = data;
  const saveError = saveMutation.error instanceof Error ? saveMutation.error.message : null;
  const uploadError = uploadMutation.error instanceof Error ? uploadMutation.error.message : null;

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Profile" subtitle="Your details and documents" />

      <View style={styles.section}>
        <Card>
          <Text style={styles.name}>{displayName(profile)}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Employment type</Text>
            <Text style={styles.metaValue}>{formatEmploymentType(staffProfile)}</Text>
          </View>
          <View style={[styles.metaRow, styles.metaRowDivider]}>
            <Text style={styles.metaLabel}>Start date</Text>
            <Text style={styles.metaValue}>{maskedOrNotSet(staffProfile?.employment_start_date)}</Text>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statutory & payroll details</Text>
        <Card style={styles.listCard}>
          {(
            [
              ["IC number", staffProfile?.ic_number],
              ["Tax number", staffProfile?.tax_number],
              ["EPF number", staffProfile?.epf_number],
              ["SOCSO number", staffProfile?.socso_number],
              ["EIS number", staffProfile?.eis_number],
              ["Bank name", staffProfile?.bank_name],
              ["Bank account", staffProfile?.bank_account],
            ] as [string, string | null | undefined][]
          ).map(([label, value], index) => (
            <View key={label} style={[styles.detailRow, index > 0 && styles.detailRowDivider]}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{maskedOrNotSet(value)}</Text>
            </View>
          ))}
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed-outline" size={14} color={color.inkMuted} />
            <Text style={styles.noteText}>Contact HR to update payroll or statutory details.</Text>
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact details</Text>
        <Card>
          <TextField
            label="Phone"
            icon="call-outline"
            placeholder="e.g. 012-345 6789"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextField
            label="Address"
            icon="home-outline"
            placeholder="Your home address"
            value={address}
            onChangeText={setAddress}
            multiline
          />
          <TextField
            label="Emergency contact name"
            icon="person-outline"
            placeholder="Full name"
            value={emergencyName}
            onChangeText={setEmergencyName}
          />
          <TextField
            label="Emergency contact phone"
            icon="call-outline"
            placeholder="e.g. 019-888 7777"
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
          />

          {formError ? (
            <View style={styles.formErrorRow}>
              <Ionicons name="alert-circle" size={15} color={color.danger} />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}
          {saveError ? (
            <View style={styles.formErrorRow}>
              <Ionicons name="alert-circle" size={15} color={color.danger} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : null}
          {saveSuccess && !saveMutation.isPending ? (
            <View style={styles.formErrorRow}>
              <Ionicons name="checkmark-circle" size={15} color={color.accent} />
              <Text style={styles.successText}>Saved.</Text>
            </View>
          ) : null}

          <Button
            label="Save changes"
            onPress={handleSave}
            loading={saveMutation.isPending}
            style={styles.submit}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Documents</Text>
        <Card style={styles.uploadCard}>
          <Text style={styles.fieldLabel}>Document type</Text>
          <View style={styles.chipsWrap}>
            {DOCUMENT_TYPES.map((t) => {
              const isSelected = t.value === selectedDocType;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setSelectedDocType(t.value)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={handlePickDocument} style={styles.attachmentButton}>
            <Ionicons name="cloud-upload-outline" size={17} color={color.primary} />
            <Text style={styles.attachmentButtonText}>
              {uploadMutation.isPending ? "Uploading…" : "Upload document"}
            </Text>
          </Pressable>
          {pickError ? <Text style={styles.errorText}>{pickError}</Text> : null}
          {uploadError ? <Text style={styles.errorText}>{uploadError}</Text> : null}
        </Card>

        {documents.length === 0 ? (
          <Card>
            <EmptyState
              icon="document-text-outline"
              title="No documents yet"
              message="Documents you upload will show up here."
            />
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {documents.map((doc, index) => (
              <View key={doc.id} style={[styles.docRow, index > 0 && styles.detailRowDivider]}>
                <View style={styles.docIcon}>
                  <Ionicons name="document-text-outline" size={16} color={color.primary} />
                </View>
                <View style={styles.docTextCol}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc.file_name ?? "Document"}
                  </Text>
                  <Text style={styles.docMeta}>
                    {documentTypeLabel(doc.document_type)} · {format(parseISO(doc.created_at), "d MMM yyyy")}
                  </Text>
                </View>
              </View>
            ))}
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
  name: {
    fontFamily: font.bold,
    fontSize: 18,
    color: color.ink,
  },
  email: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.inkMuted,
    marginBottom: space.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
  },
  metaRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  metaLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
  },
  metaValue: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: color.ink,
  },
  listCard: {
    padding: 0,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  detailRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  detailLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
  },
  detailValue: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    color: color.ink,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.paper,
  },
  noteText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkMuted,
  },
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: space.sm,
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
  successText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.accent,
  },
  submit: {
    marginTop: space.xs,
  },
  uploadCard: {
    marginBottom: space.md,
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
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  docIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  docTextCol: {
    flex: 1,
    gap: 2,
  },
  docName: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: color.ink,
  },
  docMeta: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkMuted,
  },
});
