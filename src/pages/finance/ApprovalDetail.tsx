import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Calendar,
  DollarSign,
  FileText,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  APPROVAL_ACTION_LABELS,
  APPROVAL_STATUS_CONFIG,
  type ApprovalActionType,
  type ApprovalStatus,
  approveRequest,
  rejectRequest,
  formatCurrency,
} from "@/lib/finance";

export default function ApprovalDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [decisionDialog, setDecisionDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState("");

  const { data: request, isLoading } = useQuery({
    queryKey: ["approval-request", id],
    queryFn: async () => {
      const { data } = await supabase.from("approval_requests").select("*").eq("id", id!).single();
      return data as any;
    },
    enabled: !!id,
  });

  const { data: decisions } = useQuery({
    queryKey: ["approval-decisions", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_decisions")
        .select("*")
        .eq("request_id", id!)
        .order("decided_at", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // Lookup requester and decision-maker profiles
  const allUserIds = [
    request?.requester_id,
    ...(decisions ?? []).map((d: any) => d.decided_by),
  ].filter(Boolean);
  const { data: profiles } = useQuery({
    queryKey: ["profiles-batch", allUserIds],
    queryFn: async () => {
      if (!allUserIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", allUserIds);
      return data ?? [];
    },
    enabled: allUserIds.length > 0,
  });
  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));

  const approveMutation = useMutation({
    mutationFn: async () => {
      await approveRequest(id!, user!.id, reason || undefined, conditions || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-request", id] });
      queryClient.invalidateQueries({ queryKey: ["approval-decisions", id] });
      queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
      setDecisionDialog(null);
      setReason("");
      setConditions("");
      toast({ title: "Request approved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Rejection reason is required");
      await rejectRequest(id!, user!.id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-request", id] });
      queryClient.invalidateQueries({ queryKey: ["approval-decisions", id] });
      queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
      setDecisionDialog(null);
      setReason("");
      toast({ title: "Request rejected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!request) {
    return (
      <DashboardLayout>
        <div className="text-center py-12 text-muted-foreground">Request not found</div>
      </DashboardLayout>
    );
  }

  const statusCfg = APPROVAL_STATUS_CONFIG[request.status as ApprovalStatus];
  const canDecide = (request.status === "pending" || request.status === "escalated") &&
    (role === "super_admin" || role === "franchisee" || role === "admin");
  const requesterProfile = profileMap[request.requester_id];
  const impactData = request.financial_impact_preview as Record<string, unknown> | null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/finance/approvals")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Approval Request
              </h1>
              <p className="text-xs text-muted-foreground font-mono">{id?.slice(0, 8)}...</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-sm ${statusCfg?.color ?? ""}`}>
              {statusCfg?.label ?? request.status}
            </Badge>
            {request.priority !== "normal" && (
              <Badge variant={request.priority === "urgent" ? "destructive" : "default"} className="text-xs">
                {request.priority.toUpperCase()}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Request Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Request Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Summary</Label>
                  <p className="text-sm font-medium mt-1">{request.request_summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Action Type</Label>
                    <p className="text-sm mt-1">
                      <Badge variant="outline" className="font-mono">
                        {APPROVAL_ACTION_LABELS[request.action_type as ApprovalActionType] ?? request.action_type}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Amount</Label>
                    <p className="text-lg font-bold mt-1">{formatCurrency(request.amount)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Entity</Label>
                    <p className="text-sm mt-1 font-mono">{request.entity_type}: {request.entity_id?.slice(0, 12)}...</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Approval Progress</Label>
                    <p className="text-sm mt-1">Step {request.current_step} of {request.max_steps}</p>
                  </div>
                </div>

                {request.supporting_notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Supporting Notes</Label>
                    <p className="text-sm mt-1 p-3 bg-muted/50 rounded-lg">{request.supporting_notes}</p>
                  </div>
                )}

                {request.request_details && Object.keys(request.request_details).length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Additional Details</Label>
                    <div className="mt-1 p-3 bg-muted/50 rounded-lg text-xs font-mono space-y-1">
                      {Object.entries(request.request_details as Record<string, unknown>).map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key}:</span>
                          <span>{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial Impact */}
            {impactData && Object.keys(impactData).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Financial Impact Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(impactData).map(([key, val]) => (
                      <div key={key} className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                        <p className="text-sm font-medium mt-1">
                          {typeof val === "number" ? formatCurrency(val) : String(val)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Decision History (Audit Trail) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4" /> Decision History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!decisions?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No decisions yet</p>
                ) : (
                  <div className="space-y-3">
                    {decisions.map((d: any, idx: number) => {
                      const decider = profileMap[d.decided_by];
                      const isApproval = d.decision === "approved";
                      return (
                        <div key={d.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`p-1.5 rounded-full ${isApproval ? "bg-success/10" : "bg-destructive/10"}`}>
                              {isApproval ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </div>
                            {idx < decisions.length - 1 && <div className="w-px h-full bg-border" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">
                                Step {d.step_number}: {isApproval ? "Approved" : "Rejected"}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(d.decided_at), "dd MMM yyyy, HH:mm")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              by {decider ? `${decider.first_name} ${decider.last_name}` : d.decided_by?.slice(0, 8)}
                            </p>
                            {d.reason && (
                              <p className="text-sm mt-1 p-2 bg-muted/50 rounded text-muted-foreground">{d.reason}</p>
                            )}
                            {d.conditions && (
                              <p className="text-xs mt-1 text-warning">Conditions: {d.conditions}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Requester Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> Requester
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm font-medium">
                  {requesterProfile ? `${requesterProfile.first_name} ${requesterProfile.last_name}` : "—"}
                </p>
                {requesterProfile?.email && (
                  <p className="text-xs text-muted-foreground">{requesterProfile.email}</p>
                )}
                <Separator />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(request.created_at), "dd MMM yyyy, HH:mm")}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            {canDecide && (
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="text-sm">Take Action</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => setDecisionDialog("approve")}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={() => setDecisionDialog("reject")}
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Decision Dialog */}
      <Dialog open={!!decisionDialog} onOpenChange={() => setDecisionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog === "approve" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{decisionDialog === "reject" ? "Rejection Reason (required)" : "Approval Notes"}</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  decisionDialog === "reject"
                    ? "Explain why this request is being rejected..."
                    : "Optional notes for audit trail..."
                }
                rows={3}
              />
            </div>
            {decisionDialog === "approve" && (
              <div>
                <Label>Conditions (optional)</Label>
                <Textarea
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="Any conditions for this approval..."
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>Cancel</Button>
            {decisionDialog === "approve" ? (
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                Confirm Approval
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !reason.trim()}
              >
                Confirm Rejection
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
