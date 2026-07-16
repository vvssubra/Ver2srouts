import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, CheckCircle2, AlertTriangle, XCircle, Link2, ArrowRightLeft,
  Shield, ShieldCheck, ShieldAlert, Clock, Banknote
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/finance/constants";
import {
  getGatewayTransactions,
  getReconciliationSummary,
  manualMatchTransaction,
  markTransactionDuplicate,
  RECONCILIATION_STATUSES,
  SETTLEMENT_STATUSES,
} from "@/lib/finance/gateway-service";
import { toast } from "sonner";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function ReconciliationDashboard({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const queryClient = useQueryClient();
  const branchIds = activeBranchIds;
  const [search, setSearch] = useState("");
  const [reconFilter, setReconFilter] = useState("all");
  const [settlementFilter, setSettlementFilter] = useState("all");
  const [matchDialog, setMatchDialog] = useState<any>(null);
  const [matchPaymentId, setMatchPaymentId] = useState("");
  const [matchNotes, setMatchNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["recon-summary", branchIds],
    queryFn: () => getReconciliationSummary(branchIds),
    enabled: branchIds.length > 0,
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["gateway-transactions", branchIds, reconFilter, settlementFilter],
    queryFn: () => getGatewayTransactions(branchIds, {
      reconciliationStatus: reconFilter,
      settlementStatus: settlementFilter,
    }),
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!transactions) return [];
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(t =>
      (t.bill_id || "").toLowerCase().includes(q) ||
      (t.transaction_reference || "").toLowerCase().includes(q) ||
      (t.collection_id || "").toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const getReconConfig = (status: string) =>
    RECONCILIATION_STATUSES.find(s => s.value === status) || { label: status, color: "bg-muted text-muted-foreground border-border" };

  const getSettlementConfig = (status: string | null) =>
    SETTLEMENT_STATUSES.find(s => s.value === status) || { label: status || "Unknown", color: "bg-muted text-muted-foreground border-border" };

  const handleManualMatch = async () => {
    if (!matchDialog || !matchPaymentId.trim()) {
      toast.error("Payment ID is required");
      return;
    }
    setLoading(true);
    try {
      await manualMatchTransaction({
        transactionId: matchDialog.id,
        paymentId: matchPaymentId.trim(),
        notes: matchNotes,
        actorId: user?.id || "",
      });
      toast.success("Transaction manually matched");
      queryClient.invalidateQueries({ queryKey: ["gateway-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recon-summary"] });
      setMatchDialog(null);
      setMatchPaymentId("");
      setMatchNotes("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDuplicate = async (txnId: string) => {
    try {
      await markTransactionDuplicate(txnId, "Marked as duplicate by admin");
      toast.success("Marked as duplicate risk");
      queryClient.invalidateQueries({ queryKey: ["gateway-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recon-summary"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const content = (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            BillPlz gateway transactions vs system payments — match, review, settle
          </p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Transactions</p>
                    <p className="text-lg font-bold">{summary.totalGatewayTransactions}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-success/5 border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Matched</p>
                    <p className="text-lg font-bold text-success">{formatCurrency(summary.matchedAmount)}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.matchedCount} items</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-warning/5 border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Unmatched</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(summary.unmatchedAmount)}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.unmatchedCount} items</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duplicate Risk</p>
                    <p className="text-lg font-bold text-destructive">{summary.duplicateRiskCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Failed Webhooks</p>
                    <p className="text-lg font-bold text-warning">{summary.failedWebhookCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-info/5 border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-info" />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Settled</p>
                    <p className="text-lg font-bold text-info">{formatCurrency(summary.settledAmount)}</p>
                    <p className="text-[10px] text-muted-foreground">{summary.pendingSettlementCount} pending</p>
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
                placeholder="Search bill ID, transaction ref..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={reconFilter} onValueChange={setReconFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Recon Status</SelectItem>
                {RECONCILIATION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={settlementFilter} onValueChange={setSettlementFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Settlement</SelectItem>
                {SETTLEMENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Transactions Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold w-[120px]">Date</TableHead>
                <TableHead className="font-semibold w-[120px]">Bill ID</TableHead>
                <TableHead className="font-semibold w-[110px]">Recon</TableHead>
                <TableHead className="font-semibold w-[110px]">Settlement</TableHead>
                <TableHead className="font-semibold w-[100px]">Gateway</TableHead>
                <TableHead className="font-semibold text-right w-[110px]">Amount</TableHead>
                <TableHead className="font-semibold w-[100px]">Payment</TableHead>
                <TableHead className="font-semibold w-[130px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12">
                  <ShieldCheck className="h-8 w-8 mx-auto text-success mb-2" />
                  <p className="text-muted-foreground">No transactions found</p>
                </TableCell></TableRow>
              ) : filtered.map(t => {
                const reconCfg = getReconConfig(t.reconciliation_status);
                const settleCfg = getSettlementConfig(t.settlement_status);
                return (
                  <TableRow key={t.id} className="text-sm">
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(t.created_at), "dd MMM yy")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.bill_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${reconCfg.color}`}>{reconCfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${settleCfg.color}`}>{settleCfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${t.gateway_status === "paid" ? "bg-success/5 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}`}>
                        {t.gateway_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(Number(t.gateway_amount))}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {t.payment_id ? t.payment_id.slice(0, 8) : <span className="text-warning">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {t.reconciliation_status === "unmatched" && (
                          <>
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setMatchDialog(t); setMatchPaymentId(""); setMatchNotes(""); }}>
                              <Link2 className="h-3 w-3 mr-1" /> Match
                            </Button>
                            <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => handleMarkDuplicate(t.id)}>
                              Dupe
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Manual Match Dialog */}
      <Dialog open={!!matchDialog} onOpenChange={open => { if (!open) setMatchDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Manual Match
            </DialogTitle>
            <DialogDescription>
              Link BillPlz transaction <span className="font-mono">{matchDialog?.bill_id}</span> ({matchDialog && formatCurrency(Number(matchDialog.gateway_amount))}) to a system payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">System Payment ID *</p>
              <Input
                placeholder="Paste payment UUID..."
                value={matchPaymentId}
                onChange={e => setMatchPaymentId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              <Textarea
                placeholder="Why are you matching this manually?"
                value={matchNotes}
                onChange={e => setMatchNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialog(null)}>Cancel</Button>
            <Button onClick={handleManualMatch} disabled={loading || !matchPaymentId.trim()}>
              {loading ? "Matching..." : "Confirm Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
