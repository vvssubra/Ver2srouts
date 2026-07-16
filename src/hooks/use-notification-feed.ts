import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  action_url?: string;
  reference_id?: string;
  group_key?: string;
  priority?: string;
  archived_at?: string;
  // For live workflow items
  isLive?: boolean;
  count?: number;
}

/**
 * Unified notification feed hook that merges:
 * 1. Persisted notification rows (from DB)
 * 2. Live "action required" items derived from pending approvals
 */
export function useNotificationFeed(limit = 30) {
  const { user, role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const latestNotifRef = useRef<string | null>(null);

  // Persisted notifications
  const { data: persistedNotifications = [], isLoading: persistedLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as NotificationItem[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Live workflow alerts for approvers
  const isApprover = ["super_admin", "admin", "franchisee"].includes(role ?? "");
  const { data: liveAlerts = [], isLoading: liveLoading } = useQuery({
    queryKey: ["live-approval-alerts", selectedBranchId, role],
    queryFn: async () => {
      if (!selectedBranchId || selectedBranchId === "all") return [];
      const alerts: NotificationItem[] = [];

      const [leaveRes, otRes, claimRes, payrollRes] = await Promise.all([
        supabase.from("leave_requests").select("id", { count: "exact", head: true })
          .eq("branch_id", selectedBranchId).eq("status", "pending"),
        supabase.from("overtime_requests").select("id", { count: "exact", head: true })
          .eq("branch_id", selectedBranchId).eq("status", "pending"),
        supabase.from("staff_claims").select("id", { count: "exact", head: true })
          .eq("branch_id", selectedBranchId).eq("status", "pending"),
        supabase.from("payroll_records").select("id", { count: "exact", head: true })
          .eq("branch_id", selectedBranchId).eq("status", "draft"),
      ]);

      if ((leaveRes.count ?? 0) > 0) {
        alerts.push({
          id: "live-leave-pending",
          title: "Leave Requests Pending",
          message: `${leaveRes.count} leave request${leaveRes.count! > 1 ? "s" : ""} awaiting your approval`,
          type: "leave_request",
          is_read: false,
          created_at: new Date().toISOString(),
          action_url: "/leave",
          priority: "high",
          isLive: true,
          count: leaveRes.count!,
        });
      }
      if ((otRes.count ?? 0) > 0) {
        alerts.push({
          id: "live-ot-pending",
          title: "OT Requests Pending",
          message: `${otRes.count} overtime request${otRes.count! > 1 ? "s" : ""} awaiting your approval`,
          type: "overtime",
          is_read: false,
          created_at: new Date().toISOString(),
          action_url: "/overtime",
          priority: "high",
          isLive: true,
          count: otRes.count!,
        });
      }
      if ((claimRes.count ?? 0) > 0) {
        alerts.push({
          id: "live-claim-pending",
          title: "Expense Claims Pending",
          message: `${claimRes.count} claim${claimRes.count! > 1 ? "s" : ""} awaiting your approval`,
          type: "claim_request",
          is_read: false,
          created_at: new Date().toISOString(),
          action_url: "/claims",
          priority: "high",
          isLive: true,
          count: claimRes.count!,
        });
      }
      if ((payrollRes.count ?? 0) > 0) {
        alerts.push({
          id: "live-payroll-draft",
          title: "Payroll Drafts",
          message: `${payrollRes.count} payroll record${payrollRes.count! > 1 ? "s" : ""} in draft`,
          type: "payroll",
          is_read: false,
          created_at: new Date().toISOString(),
          action_url: "/payroll",
          priority: "high",
          isLive: true,
          count: payrollRes.count!,
        });
      }

      return alerts;
    },
    enabled: !!user && isApprover && !!selectedBranchId && selectedBranchId !== "all",
    refetchInterval: 15000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          const n = payload.new;
          if (n && n.id !== latestNotifRef.current) {
            latestNotifRef.current = n.id;
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  // Merge: live alerts first, then persisted
  const merged = [...liveAlerts, ...persistedNotifications];
  const unreadCount = liveAlerts.length + persistedNotifications.filter((n) => !n.is_read).length;

  return {
    notifications: merged,
    persistedNotifications,
    liveAlerts,
    unreadCount,
    isLoading: persistedLoading || liveLoading,
    latestNotifRef,
  };
}
