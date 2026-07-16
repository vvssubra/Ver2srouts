import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, Plus, Minus, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/finance/constants";
import { getWalletBalance, adminWalletAdjustment } from "@/lib/finance/wallet-service";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface WalletPanelProps {
  payerAccountId: string;
  branchId: string;
  compact?: boolean;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  wallet_credit_from_overpayment: { label: "Overpayment", color: "bg-success/5 text-success border-success/20", icon: ArrowUpRight },
  wallet_credit_from_cn: { label: "Credit Note", color: "bg-muted/50 text-muted-foreground border-border", icon: ArrowUpRight },
  wallet_admin_adjustment: { label: "Admin Adjustment", color: "bg-warning/5 text-warning border-warning/20", icon: TrendingUp },
  auto_offset: { label: "Auto-Offset", color: "bg-info/5 text-info border-info/20", icon: ArrowDownRight },
  wallet_adjustment: { label: "Adjustment", color: "bg-muted text-muted-foreground border-border", icon: TrendingUp },
};

export function WalletPanel({ payerAccountId, branchId, compact = false }: WalletPanelProps) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  const isManager = ["super_admin", "franchisee", "admin"].includes(role || "");

  const { data: wallet, isLoading } = useQuery({
    queryKey: ["wallet-balance", payerAccountId],
    queryFn: () => getWalletBalance(payerAccountId),
    enabled: !!payerAccountId,
  });

  const handleAdjustment = async () => {
    const num = parseFloat(adjustAmount);
    if (!num || num <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (!adjustReason.trim()) { toast.error("Reason is required"); return; }

    setAdjustLoading(true);
    try {
      await adminWalletAdjustment({
        branchId,
        payerAccountId,
        amount: adjustType === "credit" ? num : -num,
        reason: adjustReason.trim(),
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success(`Wallet ${adjustType} of ${formatCurrency(num)} applied`);
      queryClient.invalidateQueries({ queryKey: ["wallet-balance", payerAccountId] });
      queryClient.invalidateQueries({ queryKey: ["account-ledger"] });
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdjustLoading(false);
    }
  };

  const available = wallet?.available || 0;

  if (compact) {
    return (
      <Card className={`border-0 shadow-sm ${available > 0 ? "bg-success/5" : "bg-muted/30"}`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${available > 0 ? "bg-success/10" : "bg-muted"}`}>
              <Wallet className={`h-4 w-4 ${available > 0 ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Wallet Credit</p>
              <p className={`text-sm font-bold ${available > 0 ? "text-success" : "text-muted-foreground"}`}>
                {formatCurrency(available)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Wallet / Credit Balance
            </CardTitle>
            {isManager && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAdjustOpen(true)}>
                <Plus className="h-3 w-3" /> Adjust
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-xl p-3 ${available > 0 ? "bg-success/5 border border-success/20" : "bg-muted/50 border border-border"}`}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Available</p>
              <p className={`text-lg font-bold mt-0.5 ${available > 0 ? "text-success" : "text-muted-foreground"}`}>
                {formatCurrency(available)}
              </p>
            </div>
            <div className="rounded-xl p-3 bg-info/5 border border-info/20">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Credited</p>
              <p className="text-lg font-bold mt-0.5 text-info">{formatCurrency(wallet?.totalCredited || 0)}</p>
            </div>
            <div className="rounded-xl p-3 bg-warning/5 border border-warning/20">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Used</p>
              <p className="text-lg font-bold mt-0.5 text-warning">{formatCurrency(wallet?.totalUsed || 0)}</p>
            </div>
          </div>

          {/* Transaction History */}
          {wallet && wallet.entries.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Wallet Transactions
              </p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs w-[120px]">Date</TableHead>
                      <TableHead className="text-xs w-[130px]">Source</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right w-[100px]">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.entries.map((entry) => {
                      const source = SOURCE_LABELS[entry.entry_type] || SOURCE_LABELS.wallet_adjustment;
                      const isIncrease = (entry.credit || 0) > 0;
                      const amount = isIncrease ? entry.credit : entry.debit;
                      return (
                        <TableRow key={entry.id} className="text-xs">
                          <TableCell className="text-muted-foreground">
                            {entry.created_at ? format(new Date(entry.created_at), "dd MMM yy") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${source.color}`}>
                              {source.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]">{entry.description || "—"}</TableCell>
                          <TableCell className={`text-right font-semibold tabular-nums ${isIncrease ? "text-success" : "text-destructive"}`}>
                            {isIncrease ? "+" : "−"}{formatCurrency(amount || 0)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading wallet...</p>}
          {!isLoading && wallet && wallet.entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No wallet transactions yet</p>
          )}
        </CardContent>
      </Card>

      {/* Admin Adjustment Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Wallet Adjustment</DialogTitle>
            <DialogDescription>Add or deduct credit from this payer's wallet. A ledger entry will be created for audit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <RadioGroup value={adjustType} onValueChange={(v) => setAdjustType(v as "credit" | "debit")} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="credit" id="adj-credit" />
                <Label htmlFor="adj-credit" className="flex items-center gap-1.5 cursor-pointer">
                  <Plus className="h-3.5 w-3.5 text-success" /> Add Credit
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="debit" id="adj-debit" />
                <Label htmlFor="adj-debit" className="flex items-center gap-1.5 cursor-pointer">
                  <Minus className="h-3.5 w-3.5 text-destructive" /> Deduct Credit
                </Label>
              </div>
            </RadioGroup>
            <div className="space-y-2">
              <Label>Amount (RM) *</Label>
              <Input type="number" step="0.01" min="0.01" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} rows={2} placeholder="e.g. Goodwill credit, correction..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={handleAdjustment} disabled={adjustLoading || !adjustAmount || !adjustReason.trim()}>
              {adjustLoading ? "Applying..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
