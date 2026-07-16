import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Trash2, Loader2, ScrollText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

export default function DataManagementTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [purgeAction, setPurgeAction] = useState<{
    title: string;
    description: string;
    confirmText: string;
    affectedItems: string[];
    action: () => Promise<void>;
  } | null>(null);

  // Get branches
  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-dm"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(id, name)").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = selectedBranch || (memberships[0] as any)?.branch_id;
  const branchName = memberships.find((m: any) => m.branch_id === branchId)?.branches?.name ?? "branch";

  // Counts for preview
  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["data-management-counts", branchId],
    queryFn: async () => {
      const [convos, notifs, withdrawn] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("branch_id", branchId!),
        supabase.from("notifications" as any).select("id", { count: "exact", head: true }),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("branch_id", branchId!).eq("is_active", false),
      ]);
      return {
        conversations: convos.count ?? 0,
        notifications: notifs.count ?? 0,
        withdrawnStudents: withdrawn.count ?? 0,
      };
    },
    enabled: !!branchId,
  });

  // Audit logs
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const [purging, setPurging] = useState(false);

  const handlePurge = async () => {
    if (!purgeAction) return;
    setPurging(true);
    try {
      await purgeAction.action();
      queryClient.invalidateQueries({ queryKey: ["data-management-counts"] });
      setPurgeAction(null);
      toast({ title: "Purge complete" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPurging(false);
    }
  };

  const purgeConversations = () => {
    setPurgeAction({
      title: "Purge All Conversations",
      description: `Delete all ${counts?.conversations ?? 0} conversations and messages for ${branchName}.`,
      confirmText: branchName,
      affectedItems: ["All chat messages", "Conversation participants", "Conversations"],
      action: async () => {
        const { data: convos } = await supabase.from("conversations").select("id").eq("branch_id", branchId!);
        const ids = convos?.map((c: any) => c.id) ?? [];
        if (ids.length) {
          await supabase.from("chat_messages").delete().in("conversation_id", ids);
          await supabase.from("conversation_participants").delete().in("conversation_id", ids);
          await supabase.from("conversations").delete().in("id", ids);
        }
        await supabase.from("audit_logs" as any).insert({
          actor_id: user!.id,
          action: "purge_conversations",
          target_type: "branch",
          target_id: branchId!,
          target_label: branchName,
          metadata: { count: ids.length },
        });
      },
    });
  };

  const purgeNotifications = () => {
    setPurgeAction({
      title: "Purge Old Notifications",
      description: `Delete all ${counts?.notifications ?? 0} notifications system-wide.`,
      confirmText: "DELETE ALL",
      affectedItems: ["All notification records"],
      action: async () => {
        await supabase.from("notifications" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase.from("audit_logs" as any).insert({
          actor_id: user!.id,
          action: "purge_notifications",
          target_type: "system",
          target_id: "all",
          target_label: "All notifications",
          metadata: { count: counts?.notifications ?? 0 },
        });
      },
    });
  };

  const purgeWithdrawnStudents = () => {
    setPurgeAction({
      title: "Purge Withdrawn Students",
      description: `Permanently delete all ${counts?.withdrawnStudents ?? 0} withdrawn students from ${branchName} and their related records.`,
      confirmText: branchName,
      affectedItems: ["Parent links", "Attendance records", "Observations", "Gap analysis", "Baseline assessments", "Student records"],
      action: async () => {
        const { data: withdrawn } = await supabase.from("students").select("id").eq("branch_id", branchId!).eq("is_active", false);
        const ids = withdrawn?.map((s: any) => s.id) ?? [];
        if (ids.length) {
          await supabase.from("parent_students").delete().in("student_id", ids);
          await supabase.from("attendance").delete().in("student_id", ids);
          await supabase.from("student_observations").delete().in("student_id", ids);
          await supabase.from("baseline_assessments").delete().in("student_id", ids);
          await supabase.from("students").delete().in("id", ids);
        }
        await supabase.from("audit_logs" as any).insert({
          actor_id: user!.id,
          action: "purge_withdrawn_students",
          target_type: "branch",
          target_id: branchId!,
          target_label: branchName,
          metadata: { count: ids.length },
        });
      },
    });
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      delete_student: "Delete Student",
      delete_user: "Delete User",
      delete_conversation: "Delete Conversation",
      clear_timetable_slots: "Clear Timetable",
      purge_conversations: "Purge Conversations",
      purge_notifications: "Purge Notifications",
      purge_withdrawn_students: "Purge Withdrawn Students",
    };
    return labels[action] ?? action;
  };

  return (
    <TabsContent value="data-management" className="space-y-6">
      {/* Branch selector */}
      {memberships.length > 1 && (
        <Select value={selectedBranch} onValueChange={setSelectedBranch}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select Branch" /></SelectTrigger>
          <SelectContent>
            {memberships.map((m: any) => (
              <SelectItem key={m.branch_id} value={m.branch_id}>{m.branches?.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Danger Zone
          </CardTitle>
          <CardDescription>
            Bulk data purge operations. These actions are irreversible and require confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {countsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-dashed">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="text-2xl font-bold text-foreground">{counts?.conversations ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Conversations</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={!counts?.conversations}
                    onClick={purgeConversations}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />Purge All
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="text-2xl font-bold text-foreground">{counts?.notifications ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Notifications</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={!counts?.notifications}
                    onClick={purgeNotifications}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />Purge All
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="p-4 text-center space-y-3">
                  <p className="text-2xl font-bold text-foreground">{counts?.withdrawnStudents ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Withdrawn Students</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={!counts?.withdrawnStudents}
                    onClick={purgeWithdrawnStudents}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />Purge All
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Audit Log
          </CardTitle>
          <CardDescription>Recent destructive actions performed by administrators</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No audit logs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="destructive" className="text-[10px]">{actionLabel(log.action)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{log.target_label || log.target_id}</p>
                          <p className="text-[10px] text-muted-foreground">{log.target_type}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purge Confirm Dialog */}
      <ConfirmDeleteDialog
        open={!!purgeAction}
        onOpenChange={(open) => { if (!open) setPurgeAction(null); }}
        title={purgeAction?.title ?? ""}
        description={purgeAction?.description ?? ""}
        confirmLabel="Purge"
        confirmText={purgeAction?.confirmText}
        affectedItems={purgeAction?.affectedItems}
        isPending={purging}
        onConfirm={handlePurge}
      />
    </TabsContent>
  );
}
