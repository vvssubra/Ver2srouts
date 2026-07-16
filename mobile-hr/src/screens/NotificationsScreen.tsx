import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingState } from "../components/ui/LoadingState";
import { Card } from "../components/ui/Card";
import { useAuth } from "../lib/auth/AuthProvider";
import { supabase } from "../lib/supabase";
import type { NotificationRow } from "../lib/hr-types";
import { recognizeActionRoute, sortNotificationsByRecency } from "../lib/notifications";
import { color, font, space } from "../theme/tokens";

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  // Matches the web app's own notification feed (src/hooks/use-notification-feed.ts):
  // an archived row is meant to be gone from the inbox, not just marked read.
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return sortNotificationsByRecency(data ?? []);
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function NotificationsScreen() {
  const { user } = useAuth();
  // The parent of this tab's stack is the bottom tab navigator — same
  // cross-tab pattern HomeScreen uses for its quick actions. Loosely
  // typed for the same reason: neither hop is representable by this
  // stack's own param list.
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => fetchNotifications(user!.id),
    enabled: !!user?.id,
  });

  async function handlePress(row: NotificationRow) {
    if (!row.is_read) {
      // Optimistic-ish: update the cache immediately so the dot
      // disappears without waiting on a refetch, then persist.
      queryClient.setQueryData<NotificationRow[]>(["notifications", user?.id], (prev) =>
        prev?.map((r) => (r.id === row.id ? { ...r, is_read: true } : r))
      );
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", row.id);
      if (error) {
        // Revert on failure by refetching from source of truth.
        notificationsQuery.refetch();
      }
    }

    const route = recognizeActionRoute(row.action_url);
    if (!route) return;
    if (route.tab === "MoreTab") {
      navigation.getParent()?.navigate("MoreTab", { screen: route.screen });
    } else {
      navigation.getParent()?.navigate(route.tab);
    }
  }

  const rows = notificationsQuery.data ?? [];

  return (
    <ScreenContainer
      onRefresh={() => notificationsQuery.refetch()}
      refreshing={notificationsQuery.isRefetching}
    >
      <ScreenHeader title="Notifications" />

      {notificationsQuery.isLoading ? (
        <LoadingState label="Loading notifications…" />
      ) : notificationsQuery.isError && !notificationsQuery.data ? (
        // `&& !data` (not just `isError`): a failed background refetch
        // shouldn't blank out an already-loaded inbox.
        <ErrorState
          message="Couldn't load notifications. Check your connection and try again."
          onRetry={() => notificationsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications yet"
          message="Approvals, reminders, and announcements will show up here."
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable key={row.id} onPress={() => handlePress(row)}>
              {({ pressed }) => (
                <Card style={[styles.card, pressed && styles.cardPressed]}>
                  <View style={styles.cardRow}>
                    {!row.is_read ? <View style={styles.unreadDot} /> : <View style={styles.dotSpacer} />}
                    <View style={styles.textCol}>
                      <Text style={styles.title} numberOfLines={2}>
                        {row.title}
                      </Text>
                      <Text style={styles.message} numberOfLines={3}>
                        {row.message}
                      </Text>
                      <Text style={styles.time}>{relativeTime(row.created_at)}</Text>
                    </View>
                  </View>
                </Card>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  card: {
    gap: 0,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardRow: {
    flexDirection: "row",
    gap: space.md,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.primary,
    marginTop: 6,
  },
  dotSpacer: {
    width: 8,
    height: 8,
    marginTop: 6,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: color.ink,
  },
  message: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: color.inkMuted,
    lineHeight: 19,
  },
  time: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: color.inkFaint,
    marginTop: 2,
  },
});
