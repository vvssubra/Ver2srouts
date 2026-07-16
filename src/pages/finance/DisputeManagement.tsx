import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldX, Search, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/finance/constants";
import {
  getAllDisputes,
  getBranchCollectionsSummary,
  resolveDispute,
  updateDisputeStatus,
  DISPUTE_REASON_CODES,
  DISPUTE_STATUSES,
} from "@/lib/finance/dispute-service";
import { toast } from "sonner";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function DisputeManagement() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const queryClient = useQueryClient();
  const branchIds = activeBranchIds;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [reasonFilter, setReasonFilter] = useState("all");

  const [resolveDialog, setResolveDialog] = useState<any>(null);
  const [resolution, setResolution] = useState<"won" | "lost" | "resolved">("won");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const isManager = ["super_admin", "franchisee"].includes(role || "");

  const { data: disputes, isLoading } = useQuery({
    queryKey: ["all-disputes", branchIds],
    queryFn: () => getAllDisputes(branchIds),
    enabled: branchIds.length > 0,
  });

  const { data: summary } = useQuery({
    queryKey: ["collections-summary", branchIds],
    queryFn: () => getBranchCollectionsSummary(branchIds),
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!disputes) return [];
    return disputes.filter((d) => {
      if (statusFilter === "active" && !["open", "under_review"].includes(d.status)) return false;
      if (statusFilter !== "active" && statusFilter !== "all" && d.status !== statusFilter) return false;
      if (reasonFilter !== "all" && d.reason_code !== reasonFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.reason.toLowerCase().includes(q) ||
          d.payment_id.toLowerCase().includes(q) ||
          d.requested_by_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [disputes, statusFilter, reasonFilter, search]);

  const getStatusConfig = (status: string) => {
    return DISPUTE_STATUSES.find((s) => s.value === status) || { label: status, color: "bg-muted text-muted-foreground border-border" };
  };

  const handleResolve = async () => {
    if (!resolveDialog || !resolutionNotes.trim()) {
      toast.error("Resolution notes are required");
      return;
    }
    setLoading(true);
    try {
      await resolveDispute({
        disputeId: resolveDialog.id,
        resolution,
        resolutionNotes,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success(`Dispute ${resolution === "won" ? "won — funds secured" : resolution === "lost" ? "lost — payment reversed" : "resolved"}`);
      queryClient.invalidateQueries({ queryKey: ["all-disputes"] });
      queryClient.invalidateQueries({ queryKey: ["collections-summary"] });
      queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
      setResolveDialog(null);
      setResolutionNotes("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToReview = async (disputeId: string) => {
    try {
      await updateDisputeStatus({
        disputeId,
        newStatus: "under_review",
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success("Dispute moved to Under Review");
      queryClient.invalidateQueries({ queryKey: ["all-disputes"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispute Management</h1>
          <p className="text-sm text-muted-foreground">
            Monitor disputed payments, locked funds, and reversal requests
          </p>
        </div>

        {/* Collections Risk Dashboard */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Gross Collections</p>
                    <p className="text-lg font-bold">{formatCurrency(summary.grossCollections)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-success/5 border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Secured</p>
                    <p className="text-lg font-bold text-success">{formatCurrency(summary.securedCollections)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-warning/5 border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Locked / Disputed</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(summary.lockedFunds)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active Disputes</p>
                    <p className="text-lg font-bold text-destructive">{summary.activeDisputeCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reason, payment, requester..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
                {DISPUTE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reasons</SelectItem>
                {DISPUTE_REASON_CODES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Disputes Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold w-[120px]">Date</TableHead>
                <TableHead className="font-semibold w-[110px]">Status</TableHead>
                <TableHead className="font-semibold w-[140px]">Reason</TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead className="font-semibold text-right w-[120px]">Amount</TableHead>
                <TableHead className="font-semibold w-[130px]">Requested By</TableHead>
                <TableHead className="font-semibold w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <ShieldCheck className="h-8 w-8 mx-auto text-success mb-2" />
                    <p className="text-muted-foreground">No disputes found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => {
                  const statusCfg = getStatusConfig(d.status);
                  const reasonLabel = DISPUTE_REASON_CODES.find((r) => r.value === d.reason_code)?.label || d.reason_code;
                  return (
                    <TableRow key={d.id} className="text-sm">
                      <TableCell className="text-muted-foreground text-xs">
                        {format(new Date(d.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{reasonLabel}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {d.reason}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-warning">
                        {formatCurrency(d.disputed_amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.requested_by_name || d.requested_by.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {d.status === "open" && isManager && (
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleMoveToReview(d.id)}>
                              Review
                            </Button>
                          )}
                          {["open", "under_review"].includes(d.status) && isManager && (
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setResolveDialog(d); setResolution("won"); setResolutionNotes(""); }}>
                              Resolve
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate(`/finance/payments/${d.payment_id}`)}>
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={(open) => { if (!open) setResolveDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> Resolve Dispute
            </DialogTitle>
            <DialogDescription>
              Disputed amount: {resolveDialog && formatCurrency(resolveDialog.disputed_amount)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Resolution</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={resolution === "won" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setResolution("won")}
                  className="gap-1.5 text-xs"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Won
                </Button>
                <Button
                  variant={resolution === "lost" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setResolution("lost")}
                  className="gap-1.5 text-xs"
                >
                  <ShieldX className="h-3.5 w-3.5" /> Lost
                </Button>
                <Button
                  variant={resolution === "resolved" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setResolution("resolved")}
                  className="gap-1.5 text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Neutral
                </Button>
              </div>
            </div>

            {resolution === "won" && (
              <div className="rounded-lg bg-success/5 p-3 text-xs text-success">
                <strong>Won:</strong> The locked funds will be released and marked as secured. No payment changes.
              </div>
            )}
            {resolution === "lost" && (
              <div className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
                <strong>Lost:</strong> A compensating payment reversal will be created via the centralized payment engine. The invoice balance will be recalculated.
              </div>
            )}
            {resolution === "resolved" && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <strong>Neutral:</strong> The lock will be released without further changes.
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-1">Resolution Notes *</p>
              <Textarea
                placeholder="Describe the resolution outcome..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={loading || !resolutionNotes.trim()}>
              {loading ? "Processing..." : "Confirm Resolution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
