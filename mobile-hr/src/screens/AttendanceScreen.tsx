import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  buildClockInInsert,
  buildClockOutUpdate,
  buildLastSevenDays,
  ClockActionError,
  deriveClockStatus,
  evaluateGeofence,
  formatTimeOfDay,
  resolveApplicableGeofence,
  resolveBranchId,
  todayDateString,
  type AttendanceDayRow,
  type ClockStatus,
  type GeofenceLocation,
  type LatLng,
  type ResolvedGeofence,
  type StaffGeofenceAssignment,
} from "../lib/attendance";
import { color, font, radius, space } from "../theme/tokens";

const CLOCK_STATUS_COPY: Record<ClockStatus, { title: string; message: string }> = {
  not_clocked_in: {
    title: "Not clocked in yet",
    message: "Tap Clock In when you start your shift.",
  },
  clocked_in: {
    title: "Clocked in",
    message: "You're on the clock. Clock out when you finish.",
  },
  clocked_out: {
    title: "Shift completed",
    message: "You've clocked in and out for today.",
  },
};

type AttendanceContext = {
  branchId: string | null;
  geofence: ResolvedGeofence | null;
  todayRow: (AttendanceDayRow & { id: string; is_outside_geofence: boolean | null }) | null;
  weekRows: AttendanceDayRow[];
};

async function fetchAttendanceContext(userId: string): Promise<AttendanceContext> {
  const { data: memberships, error: membershipError } = await supabase
    .from("branch_memberships")
    .select("branch_id")
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const branchId = resolveBranchId(memberships ?? []);
  if (!branchId) {
    return { branchId: null, geofence: null, todayRow: null, weekRows: [] };
  }

  const startDate = todayDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const endDate = todayDateString();

  const [locationsRes, overrideRes, attendanceRes] = await Promise.all([
    supabase
      .from("geofence_locations")
      .select("id, latitude, longitude, radius_meters, is_active")
      .eq("branch_id", branchId)
      .eq("is_active", true),
    supabase
      .from("staff_geofence_assignments")
      .select("geofence_locations(latitude, longitude, radius_meters, is_active)")
      .eq("user_id", userId)
      .eq("branch_id", branchId)
      .maybeSingle(),
    supabase
      .from("staff_attendance")
      .select("id, date, clock_in, clock_out, is_outside_geofence")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  if (locationsRes.error) throw new Error(locationsRes.error.message);
  if (overrideRes.error) throw new Error(overrideRes.error.message);
  if (attendanceRes.error) throw new Error(attendanceRes.error.message);

  const branchLocations: GeofenceLocation[] = (locationsRes.data ?? []).map((row) => ({
    id: row.id,
    lat: row.latitude,
    lng: row.longitude,
    radius_meters: row.radius_meters,
    is_active: !!row.is_active,
  }));

  const joinedLocation = overrideRes.data?.geofence_locations as
    | { latitude: number; longitude: number; radius_meters: number; is_active: boolean | null }
    | null
    | undefined;
  const staffOverride: StaffGeofenceAssignment | null = joinedLocation
    ? {
        lat: joinedLocation.latitude,
        lng: joinedLocation.longitude,
        radius_meters: joinedLocation.radius_meters,
        is_active: !!joinedLocation.is_active,
      }
    : null;

  const geofence = resolveApplicableGeofence(branchLocations, staffOverride);

  const weekRows: AttendanceDayRow[] = (attendanceRes.data ?? []).map((row) => ({
    date: row.date,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
  }));

  const todayStr = todayDateString();
  const todayRaw = (attendanceRes.data ?? []).find((row) => row.date === todayStr) ?? null;
  const todayRow = todayRaw
    ? {
        id: todayRaw.id,
        date: todayRaw.date,
        clock_in: todayRaw.clock_in,
        clock_out: todayRaw.clock_out,
        is_outside_geofence: todayRaw.is_outside_geofence,
      }
    : null;

  return { branchId, geofence, todayRow, weekRows };
}

async function uploadSelfie(userId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `attendance-selfies/${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from("staff-documents")
    .upload(path, arrayBuffer, { contentType: "image/jpeg" });
  if (error) throw new ClockActionError("server", error.message);

  const { data } = supabase.storage.from("staff-documents").getPublicUrl(path);
  return data.publicUrl;
}

async function captureSelfie(): Promise<string> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new ClockActionError(
      "camera",
      "You're outside the work location, so a quick selfie is required. Enable camera access for Sprout Staff to continue."
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.5,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new ClockActionError(
      "selfie_cancelled",
      "A selfie is required to clock in/out from outside the work location."
    );
  }

  return result.assets[0].uri;
}

async function getPosition(): Promise<LatLng> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new ClockActionError(
      "location",
      "Clock in/out needs location access to confirm you're at the work location. Enable location permission for Sprout Staff in your device settings."
    );
  }

  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

type ClockVariables = { action: "in" | "out"; reason: string };

function useAttendanceContext(userId: string | undefined) {
  return useQuery({
    queryKey: ["attendance", userId],
    queryFn: () => fetchAttendanceContext(userId as string),
    enabled: !!userId,
  });
}

export function AttendanceScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const { data, isPending, isError, refetch, isRefetching } = useAttendanceContext(user?.id);

  const clockMutation = useMutation({
    mutationFn: async ({ action, reason: enteredReason }: ClockVariables) => {
      if (!user || !data?.branchId) {
        throw new ClockActionError("server", "No branch assigned — contact your administrator.");
      }

      const position = await getPosition();
      const geofenceCheck = evaluateGeofence(position, data.geofence);

      let selfieUrl: string | null = null;
      if (geofenceCheck.configured && !geofenceCheck.withinRadius) {
        const uri = await captureSelfie();
        selfieUrl = await uploadSelfie(user.id, uri);
      }

      const nowIso = new Date().toISOString();

      if (action === "in") {
        const insert = buildClockInInsert({
          userId: user.id,
          branchId: data.branchId,
          date: todayDateString(),
          clockInIso: nowIso,
          latitude: position.lat,
          longitude: position.lng,
          geofence: geofenceCheck,
          selfieUrl,
          reason: enteredReason,
        });
        const { error } = await supabase.from("staff_attendance").insert(insert);
        if (error) throw new ClockActionError("server", error.message);
      } else {
        if (!data.todayRow) {
          throw new ClockActionError("server", "No clock-in found for today yet.");
        }
        const update = buildClockOutUpdate({
          clockOutIso: nowIso,
          latitude: position.lat,
          longitude: position.lng,
          geofence: geofenceCheck,
          selfieUrl,
          reason: enteredReason,
        });
        const { error } = await supabase
          .from("staff_attendance")
          .update(update)
          .eq("id", data.todayRow.id);
        if (error) throw new ClockActionError("server", error.message);
      }
    },
    onSuccess: () => {
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["attendance", user?.id] });
    },
  });

  if (isPending) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Attendance" subtitle="Clock in and out" />
        <LoadingState label="Loading today's attendance…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Attendance" subtitle="Clock in and out" />
        <ErrorState
          message="Couldn't load your attendance. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!data.branchId) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Attendance" subtitle="Clock in and out" />
        <EmptyState
          icon="business-outline"
          title="No branch assigned"
          message="You're not assigned to a branch yet, so clock-in isn't available. Contact your administrator."
        />
      </ScreenContainer>
    );
  }

  const clockStatus = deriveClockStatus(data.todayRow);
  const copy = CLOCK_STATUS_COPY[clockStatus];
  const week = buildLastSevenDays(data.weekRows);
  const actionError = clockMutation.error as ClockActionError | null;

  return (
    <ScreenContainer onRefresh={() => refetch()} refreshing={isRefetching}>
      <ScreenHeader title="Attendance" subtitle="Clock in and out" />

      <View style={styles.section}>
        <Card>
          <View style={styles.statusRow}>
            <View style={styles.statusIconBadge}>
              <Ionicons
                name={clockStatus === "clocked_in" ? "time" : "location"}
                size={20}
                color={color.primary}
              />
            </View>
            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>{copy.title}</Text>
              <Text style={styles.statusMessage}>{copy.message}</Text>
            </View>
          </View>

          <View style={styles.timesRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Clock in</Text>
              <Text style={styles.timeValue}>{formatTimeOfDay(data.todayRow?.clock_in ?? null)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Clock out</Text>
              <Text style={styles.timeValue}>{formatTimeOfDay(data.todayRow?.clock_out ?? null)}</Text>
            </View>
          </View>

          {data.todayRow?.is_outside_geofence ? (
            <View style={styles.flagRow}>
              <Ionicons name="alert-circle-outline" size={15} color="#B5680A" />
              <Text style={styles.flagText}>Flagged as outside the work location today</Text>
            </View>
          ) : null}

          {clockStatus !== "clocked_out" ? (
            <TextField
              label="Note (optional)"
              icon="chatbubble-ellipses-outline"
              placeholder="e.g. offsite for a home visit"
              value={reason}
              onChangeText={setReason}
              returnKeyType="done"
            />
          ) : null}

          {actionError ? (
            <View style={styles.actionErrorWrap}>
              <ErrorState
                message={actionError.message}
                onRetry={
                  actionError.kind !== "server"
                    ? () =>
                        clockMutation.mutate({
                          action: clockStatus === "not_clocked_in" ? "in" : "out",
                          reason,
                        })
                    : undefined
                }
              />
            </View>
          ) : null}

          {clockStatus !== "clocked_out" ? (
            <Button
              label={clockStatus === "not_clocked_in" ? "Clock In" : "Clock Out"}
              loading={clockMutation.isPending}
              onPress={() =>
                clockMutation.mutate({
                  action: clockStatus === "not_clocked_in" ? "in" : "out",
                  reason,
                })
              }
              style={styles.submit}
            />
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Last 7 days</Text>
        <Card style={styles.listCard}>
          {week.map((day, index) => (
            <View key={day.date} style={[styles.dayRow, index > 0 && styles.dayRowDivider]}>
              <Text style={styles.dayDate}>{day.date}</Text>
              <Text style={styles.dayTimes}>
                {formatTimeOfDay(day.clock_in)} → {formatTimeOfDay(day.clock_out)}
              </Text>
              <StatusPill label={formatStatusLabel(day.status)} tone={toneForStatus(day.status)} />
            </View>
          ))}
        </Card>
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.lg,
  },
  statusIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTextCol: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    fontFamily: font.bold,
    fontSize: 16,
    color: color.ink,
  },
  statusMessage: {
    fontFamily: font.regular,
    fontSize: 13,
    color: color.inkMuted,
  },
  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.paper,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  timeCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  timeDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: color.border,
  },
  timeLabel: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: color.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  timeValue: {
    fontFamily: font.bold,
    fontSize: 17,
    color: color.ink,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3E2",
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: space.sm,
    marginBottom: space.lg,
  },
  flagText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: "#B5680A",
    flex: 1,
  },
  actionErrorWrap: {
    marginBottom: space.sm,
  },
  submit: {
    marginTop: space.xs,
  },
  listCard: {
    padding: 0,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  dayRowDivider: {
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  dayDate: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: color.ink,
    width: 88,
  },
  dayTimes: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.inkMuted,
    flex: 1,
  },
});
