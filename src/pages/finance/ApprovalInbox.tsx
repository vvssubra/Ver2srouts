import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Clock, CheckCircle2, XCircle, AlertTriangle, Inbox, ExternalLink } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  APPROVAL_ACTION_LABELS,
  APPROVAL_STATUS_CONFIG,
  APPROVAL_ACTION_TYPES,
  type ApprovalActionType,
  type ApprovalStatus,
  formatCurrency,
} from "@/lib/finance";

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  escalated: AlertTriangle,
  cancelled: XCircle,
};

export default function ApprovalInbox() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionFilter, setActionFilter] = useState("all");

  const branchIds = selectedBranch === "all" ? branches.map((b) => b.id) : [selectedBranch];

  const { data: requests, isLoading } = useQuery({
    queryKey: ["approval-requests", branchIds, statusFilter, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from("approval_requests")
        .select("*")
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (actionFilter !== "all") query = query.eq("action_type", actionFilter as any);

      const { data } = await query;
      return (data ?? []) as any[];
    },
    enabled: branchIds.length > 0,
  });

  // Requester name lookup
  const requesterIds = [...new Set((requests ?? []).map((r: any) => r.requester_id))];
  const { data: profiles } = useQuery({
    queryKey: ["profiles-batch", requesterIds],
    queryFn: async () => {
      if (!requesterIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", requesterIds);
      return data ?? [];
    },
    enabled: requesterIds.length > 0,
  });

  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]));

  const pendingCount = requests?.filter((r: any) => r.status === "pending").length ?? 0;
  const escalatedCount = requests?.filter((r: any) => r.status === "escalated").length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="h-6 w-6 text-primary" />
              Approval Inbox
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review and process financial approval requests
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/finance/approval-rules")} className="gap-2">
            <Shield className="h-4 w-4" /> Configure Rules
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-warning/5 border-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80"><Clock className="h-4 w-4 text-warning" /></div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pending</p>
                <p className="text-lg font-bold text-warning">{pendingCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-muted/50 border-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80"><AlertTriangle className="h-4 w-4 text-muted-foreground" /></div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Escalated</p>
                <p className="text-lg font-bold text-muted-foreground">{escalatedCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-success/5 border-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80"><CheckCircle2 className="h-4 w-4 text-success" /></div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Approved (all time)</p>
                <p className="text-lg font-bold text-success">
                  {requests?.filter((r: any) => r.status === "approved").length ?? 0}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-destructive/5 border-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background/80"><XCircle className="h-4 w-4 text-destructive" /></div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Rejected (all time)</p>
                <p className="text-lg font-bold text-destructive">
                  {requests?.filter((r: any) => r.status === "rejected").length ?? 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Action Types</SelectItem>
              {APPROVAL_ACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{APPROVAL_ACTION_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-12 text-center">Loading...</p>
            ) : !requests?.length ? (
              <div className="text-center py-16 space-y-2">
                <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm">No approval requests found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Action Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req: any) => {
                    const StatusIcon = STATUS_ICONS[req.status] ?? Clock;
                    const statusCfg = APPROVAL_STATUS_CONFIG[req.status as ApprovalStatus];
                    return (
                      <TableRow
                        key={req.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/finance/approvals/${req.id}`)}
                      >
                        <TableCell>
                          <p className="text-sm font-medium">{req.request_summary}</p>
                          <p className="text-xs text-muted-foreground">{req.entity_type}:{req.entity_id?.slice(0, 8)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {APPROVAL_ACTION_LABELS[req.action_type as ApprovalActionType] ?? req.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {formatCurrency(req.amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {profileMap[req.requester_id] ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs gap-1 ${statusCfg?.color ?? ""}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg?.label ?? req.status}
                          </Badge>
                          {req.priority === "urgent" && (
                            <Badge variant="destructive" className="ml-1 text-[10px]">URGENT</Badge>
                          )}
                          {req.priority === "high" && (
                            <Badge className="ml-1 text-[10px] bg-warning/30">HIGH</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
