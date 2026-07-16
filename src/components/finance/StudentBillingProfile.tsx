import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getStudentBillingProfile,
  getOrCreateBillingProfile,
  addBillingProfileItem,
  deactivateBillingProfileItem,
} from "@/lib/finance/pricing-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Package, Plus, X, DollarSign, Calendar } from "lucide-react";

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;
const feeTypeLabel: Record<string, string> = { monthly: "Monthly", one_time: "One-time", term: "Termly", annual: "Annual" };
const feeTypeBadge: Record<string, string> = {
  monthly: "bg-primary/15 text-primary",
  one_time: "bg-accent text-accent-foreground",
  term: "bg-secondary text-secondary-foreground",
};

interface Props {
  studentId: string;
  branchId: string;
}

export default function StudentBillingProfile({ studentId, branchId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState("");
  const [discount, setDiscount] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["billing-profile", studentId],
    queryFn: () => getStudentBillingProfile(studentId),
    enabled: !!studentId,
  });

  const { data: feePackages = [] } = useQuery({
    queryKey: ["fee-packages-for-profile", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_packages")
        .select("id, name, amount, fee_type")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const createProfileAndAdd = useMutation({
    mutationFn: async () => {
      const p = await getOrCreateBillingProfile({ studentId, branchId, actorId: user!.id });
      const { data: verData } = await supabase
        .from("fee_package_versions" as any)
        .select("id")
        .eq("fee_package_id", selectedPkg)
        .order("version_number", { ascending: false })
        .limit(1);
      const verRows = (verData ?? []) as unknown as { id: string }[];

      await addBillingProfileItem({
        profileId: p.id,
        packageId: selectedPkg,
        versionId: verRows[0]?.id,
        discountAmount: parseFloat(discount) || 0,
        effectiveFrom,
        actorId: user!.id,
        branchId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", studentId] });
      queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
      setShowAdd(false);
      setSelectedPkg("");
      setDiscount("0");
      toast({ title: "Fee item added to billing profile" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deactivateItem = useMutation({
    mutationFn: (itemId: string) => deactivateBillingProfileItem({ itemId, actorId: user!.id, branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profile", studentId] });
      queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
      toast({ title: "Fee item deactivated" });
    },
  });

  const items = useMemo(() => (profile?.items ?? []).filter((i: any) => i.is_active), [profile]);

  // Group by frequency
  const itemsByFreq = useMemo(() => {
    const groups: Record<string, any[]> = {};
    items.forEach((item: any) => {
      const freq = item.fee_packages?.fee_type || "other";
      if (!groups[freq]) groups[freq] = [];
      groups[freq].push(item);
    });
    return groups;
  }, [items]);

  const freqOrder = ["monthly", "term", "one_time", "annual"];

  const totalMonthly = items
    .filter((i: any) => i.fee_packages?.fee_type === "monthly")
    .reduce((sum: number, i: any) => {
      const rate = i.fee_version?.amount ?? i.fee_packages?.amount ?? 0;
      const disc = i.discount_amount ?? 0;
      return sum + rate - disc;
    }, 0);

  // Already assigned package IDs
  const assignedPkgIds = useMemo(() => new Set(items.map((i: any) => i.fee_package_id)), [items]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Billing Profile
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Fee
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No billing profile configured. Click "Add Fee" to assign fee packages.
          </p>
        )}

        {items.length > 0 && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Estimated Monthly</span>
              <span className="text-lg font-bold">{rm(totalMonthly)}</span>
            </div>

            <div className="space-y-4">
              {freqOrder.map(freq => {
                const groupItems = itemsByFreq[freq];
                if (!groupItems?.length) return null;
                return (
                  <div key={freq}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className={`text-[10px] ${feeTypeBadge[freq] || "bg-muted text-muted-foreground"}`}>
                        {feeTypeLabel[freq] || freq}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{groupItems.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {groupItems.map((item: any) => {
                        const pkg = item.fee_packages;
                        const ver = item.fee_version;
                        const rate = ver?.amount ?? pkg?.amount ?? 0;
                        const disc = item.discount_amount ?? 0;
                        return (
                          <div key={item.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm group hover:border-primary/20 transition-colors">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{pkg?.name ?? "Unknown"}</span>
                                {ver && <Badge variant="outline" className="text-[10px] px-1 py-0">v{ver.version_number}</Badge>}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                From {format(new Date(item.effective_from), "dd MMM yyyy")}
                                {disc > 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                    -{rm(disc)} discount
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{rm(rate - disc)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => deactivateItem.mutate(item.id)}
                              >
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Add Fee Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Fee Package</DialogTitle>
              <DialogDescription>Assign a fee package to this student's billing profile.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Fee Package</Label>
                <Select value={selectedPkg} onValueChange={setSelectedPkg}>
                  <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                  <SelectContent>
                    {feePackages.map((p: any) => {
                      const alreadyAssigned = assignedPkgIds.has(p.id);
                      return (
                        <SelectItem key={p.id} value={p.id} disabled={alreadyAssigned}>
                          {p.name} — {rm(Number(p.amount))}
                          {alreadyAssigned ? " (assigned)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Discount (RM)</Label>
                  <Input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Effective From</Label>
                  <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={() => createProfileAndAdd.mutate()} disabled={!selectedPkg || createProfileAndAdd.isPending}>
                {createProfileAndAdd.isPending ? "Adding…" : "Add to Profile"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
