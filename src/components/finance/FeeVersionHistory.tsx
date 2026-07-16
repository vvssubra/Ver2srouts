import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getFeePackageHistory, createFeePackageVersion, type FeePackageVersion } from "@/lib/finance/pricing-service";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Clock, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  packageId: string;
  packageName: string;
  branchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

export default function FeeVersionHistory({ packageId, packageName, branchId, open, onOpenChange, canManage }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["fee-versions", packageId],
    queryFn: () => getFeePackageHistory(packageId),
    enabled: open,
  });

  const createVersion = useMutation({
    mutationFn: () =>
      createFeePackageVersion({
        packageId,
        amount: parseFloat(newAmount),
        effectiveFrom,
        reason,
        actorId: user!.id,
        branchId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-versions", packageId] });
      queryClient.invalidateQueries({ queryKey: ["fee-packages"] });
      setShowNew(false);
      setNewAmount("");
      setReason("");
      toast({ title: "New rate version created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getChangeIcon = (current: FeePackageVersion, prev?: FeePackageVersion) => {
    if (!prev) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    if (current.amount > prev.amount) return <TrendingUp className="h-3.5 w-3.5 text-destructive" />;
    if (current.amount < prev.amount) return <TrendingDown className="h-3.5 w-3.5 text-success" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Rate History — {packageName}
          </DialogTitle>
          <DialogDescription>
            All rate versions are immutable. Historical invoices are unaffected by new rates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
          {versions.map((v, i) => {
            const prev = versions[i + 1]; // list is descending
            const isLatest = i === 0;
            return (
              <div key={v.id} className={`relative rounded-lg border p-3 transition-colors ${isLatest ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {getChangeIcon(v, prev)}
                      <span className="font-semibold text-sm">RM {Number(v.amount).toFixed(2)}</span>
                      {isLatest && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Current</Badge>}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">v{v.version_number}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Effective {format(new Date(v.effective_from), "dd MMM yyyy")}
                      {v.effective_until && ` → ${format(new Date(v.effective_until), "dd MMM yyyy")}`}
                    </p>
                    {v.change_reason && (
                      <p className="text-xs text-muted-foreground italic mt-1">"{v.change_reason}"</p>
                    )}
                  </div>
                  {prev && (
                    <span className={`text-xs font-medium ${v.amount > prev.amount ? "text-destructive" : v.amount < prev.amount ? "text-success" : "text-muted-foreground"}`}>
                      {v.amount > prev.amount ? "+" : ""}{((v.amount - prev.amount) / prev.amount * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {!isLoading && versions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No version history yet.</p>
          )}
        </div>

        {canManage && !showNew && (
          <Button variant="outline" size="sm" onClick={() => setShowNew(true)} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" /> New Rate Version
          </Button>
        )}

        {showNew && (
          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">New Rate (RM)</Label>
                <Input type="number" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective From</Label>
                <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Change Reason</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual rate revision" rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={() => createVersion.mutate()} disabled={!newAmount || !reason || createVersion.isPending}>
                {createVersion.isPending ? "Saving…" : "Create Version"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
