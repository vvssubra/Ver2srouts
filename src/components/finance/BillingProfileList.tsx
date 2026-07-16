import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getBranchBillingProfiles,
  addBillingProfileItem,
  deactivateBillingProfileItem,
} from "@/lib/finance/pricing-service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Search, Package, Plus, X, DollarSign, Calendar, ChevronRight, Users } from "lucide-react";

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;
const feeTypeLabel: Record<string, string> = { one_time: "One-time", monthly: "Monthly", term: "Termly", annual: "Annual" };
const feeTypeBadge: Record<string, string> = {
  one_time: "bg-accent text-accent-foreground",
  monthly: "bg-primary/15 text-primary",
  term: "bg-secondary text-secondary-foreground",
  annual: "bg-warning/10 text-warning dark:bg-warning dark:text-warning",
};
const freqOrder = ["one_time", "monthly", "term", "annual"];

interface Props {
  branchId: string;
}

export default function BillingProfileList({ branchId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [showAddFee, setShowAddFee] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState("");
  const [discount, setDiscount] = useState("0");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["billing-profiles", branchId],
    queryFn: () => getBranchBillingProfiles(branchId),
    enabled: !!branchId,
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

  // Group profiles by class
  const classGroups = useMemo(() => {
    const filtered = profiles.filter((p: any) => {
      if (!search) return true;
      const name = `${p.students?.first_name ?? ""} ${p.students?.last_name ?? ""}`.toLowerCase();
      return name.includes(search.toLowerCase());
    });

    const groups = new Map<string, any[]>();
    filtered.forEach((p: any) => {
      const cls = p.students?.class_name || "Unassigned";
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls)!.push(p);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b));
  }, [profiles, search]);

  const totalStudents = useMemo(() => classGroups.reduce((s, [, ps]) => s + ps.length, 0), [classGroups]);

  // Currently selected profile's items
  const currentSelectedProfile = useMemo(() => {
    if (!selectedProfile) return null;
    return profiles.find((p: any) => p.id === selectedProfile.id) ?? selectedProfile;
  }, [profiles, selectedProfile]);

  const selectedItems = useMemo(() => {
    if (!currentSelectedProfile) return [];
    return (currentSelectedProfile.items ?? []).filter((i: any) => i.is_active);
  }, [currentSelectedProfile]);

  const getProfileStats = (p: any) => {
    const items = (p.items ?? []).filter((i: any) => i.is_active);
    const monthly = items
      .filter((i: any) => i.fee_packages?.fee_type === "monthly")
      .reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0);
    const termly = items
      .filter((i: any) => i.fee_packages?.fee_type === "term")
      .reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0);
    const oneTime = items
      .filter((i: any) => i.fee_packages?.fee_type === "one_time")
      .reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0);
    return { count: items.length, monthly, termly, oneTime };
  };

  const addFeeMutation = useMutation({
    mutationFn: async () => {
      if (!currentSelectedProfile || !selectedPkg) throw new Error("Missing data");
      const { data: verData } = await supabase
        .from("fee_package_versions" as any)
        .select("id")
        .eq("fee_package_id", selectedPkg)
        .order("version_number", { ascending: false })
        .limit(1);
      const verRows = (verData ?? []) as unknown as { id: string }[];

      await addBillingProfileItem({
        profileId: currentSelectedProfile.id,
        packageId: selectedPkg,
        versionId: verRows[0]?.id,
        discountAmount: parseFloat(discount) || 0,
        effectiveFrom,
        actorId: user!.id,
        branchId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profiles", branchId] });
      setShowAddFee(false);
      setSelectedPkg("");
      setDiscount("0");
      toast({ title: "Fee item added to billing profile" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deactivateItemMutation = useMutation({
    mutationFn: (itemId: string) => deactivateBillingProfileItem({ itemId, actorId: user!.id, branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profiles", branchId] });
      toast({ title: "Fee item deactivated" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="text-sm text-muted-foreground">
          {classGroups.length} class{classGroups.length !== 1 ? "es" : ""} · {totalStudents} student{totalStudents !== 1 ? "s" : ""}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}

      {!isLoading && classGroups.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {profiles.length === 0 ? "No billing profiles found. Profiles are created when fee items are assigned to students." : "No matching students."}
        </p>
      )}

      {/* Class Accordion */}
      {classGroups.length > 0 && (
        <Accordion type="multiple" className="space-y-2">
          {classGroups.map(([className, classProfiles]) => {
            const classMonthly = classProfiles.reduce((s: number, p: any) => s + getProfileStats(p).monthly, 0);
            const classTermly = classProfiles.reduce((s: number, p: any) => s + getProfileStats(p).termly, 0);
            return (
              <AccordionItem key={className} value={className} className="border rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <Users className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm">{className}</span>
                    <Badge variant="secondary" className="text-[10px]">{classProfiles.length} student{classProfiles.length !== 1 ? "s" : ""}</Badge>
                    <div className="ml-auto mr-4 flex items-center gap-4">
                      {classMonthly > 0 && (
                        <span className="text-xs text-muted-foreground font-medium">Monthly: {rm(classMonthly)}</span>
                      )}
                      {classTermly > 0 && (
                        <span className="text-xs text-muted-foreground font-medium">Termly: {rm(classTermly)}</span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="pl-10">Student</TableHead>
                        <TableHead className="text-center">Active Items</TableHead>
                        <TableHead className="text-right">Monthly</TableHead>
                        <TableHead className="text-right">Termly</TableHead>
                        <TableHead className="text-right">One-time</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {classProfiles.map((p: any) => {
                        const student = p.students;
                        const stats = getProfileStats(p);
                        return (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => setSelectedProfile(p)}
                          >
                            <TableCell className="font-medium pl-10">
                              {student?.first_name} {student?.last_name}
                              {!student?.is_active && <Badge variant="secondary" className="ml-2 text-[10px]">Inactive</Badge>}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{stats.count}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{stats.monthly > 0 ? rm(stats.monthly) : "—"}</TableCell>
                            <TableCell className="text-right">{stats.termly > 0 ? rm(stats.termly) : "—"}</TableCell>
                            <TableCell className="text-right">{stats.oneTime > 0 ? rm(stats.oneTime) : "—"}</TableCell>
                            <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* ── Student Billing Profile Sheet ── */}
      <Sheet open={!!selectedProfile} onOpenChange={o => { if (!o) setSelectedProfile(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {currentSelectedProfile && (() => {
            const student = currentSelectedProfile.students;
            const items = (currentSelectedProfile.items ?? []).filter((i: any) => i.is_active);

            // Group by frequency
            const byFreq: Record<string, any[]> = {};
            items.forEach((item: any) => {
              const freq = item.fee_packages?.fee_type || "other";
              if (!byFreq[freq]) byFreq[freq] = [];
              byFreq[freq].push(item);
            });

            const totals = {
              one_time: items.filter((i: any) => i.fee_packages?.fee_type === "one_time").reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0),
              monthly: items.filter((i: any) => i.fee_packages?.fee_type === "monthly").reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0),
              term: items.filter((i: any) => i.fee_packages?.fee_type === "term").reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0),
              annual: items.filter((i: any) => i.fee_packages?.fee_type === "annual").reduce((s: number, i: any) => s + (i.fee_packages?.amount ?? 0) - (i.discount_amount ?? 0), 0),
            };

            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    {student?.first_name} {student?.last_name}
                  </SheetTitle>
                  <SheetDescription>
                    {student?.class_name ?? "No class"} · {items.length} active fee item{items.length !== 1 ? "s" : ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  {/* Summary cards — ordered: One-time, Monthly, Termly, Annual */}
                  <div className="grid grid-cols-2 gap-2">
                    {freqOrder.map(freq => (
                      <div key={freq} className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">{feeTypeLabel[freq]}</p>
                        <p className="text-lg font-bold">{rm(totals[freq as keyof typeof totals] ?? 0)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Fee items grouped by frequency */}
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                      No fee items assigned. Click "Add Fee" to get started.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {freqOrder.map(freq => {
                        const groupItems = byFreq[freq];
                        if (!groupItems?.length) return null;
                        return (
                          <div key={freq}>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={`text-[10px] ${feeTypeBadge[freq] || ""}`}>{feeTypeLabel[freq] || freq}</Badge>
                              <span className="text-xs text-muted-foreground">{groupItems.length} item{groupItems.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="space-y-1.5">
                              {groupItems.map((item: any) => {
                                const pkg = item.fee_packages;
                                const rate = pkg?.amount ?? 0;
                                const disc = item.discount_amount ?? 0;
                                return (
                                  <div key={item.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm group hover:border-primary/20 transition-colors">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-medium">{pkg?.name ?? "Unknown"}</span>
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
                                        onClick={(e) => { e.stopPropagation(); deactivateItemMutation.mutate(item.id); }}
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
                  )}

                  {/* Add Fee button */}
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setShowAddFee(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Fee
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Add Fee Dialog ── */}
      <Dialog open={showAddFee} onOpenChange={setShowAddFee}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Fee Package</DialogTitle>
            <DialogDescription>Assign a fee package to this student's billing profile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Fee Package</Label>
              <Select value={selectedPkg} onValueChange={setSelectedPkg}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {freqOrder.map(freq => {
                    const freqPkgs = feePackages.filter((p: any) => p.fee_type === freq);
                    if (!freqPkgs.length) return null;
                    return (
                      <div key={freq}>
                        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0">
                          {feeTypeLabel[freq]}
                        </div>
                        {freqPkgs.map((p: any) => {
                          const alreadyAssigned = currentSelectedProfile
                            ? (currentSelectedProfile.items ?? []).some((i: any) => i.is_active && i.fee_package_id === p.id)
                            : false;
                          return (
                            <SelectItem key={p.id} value={p.id} disabled={alreadyAssigned} className="py-2">
                              <div className="flex items-center gap-2 w-full">
                                <span className="truncate">{p.name}</span>
                                <span className="text-muted-foreground ml-auto shrink-0">— {rm(Number(p.amount))}</span>
                                {alreadyAssigned && <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">assigned</Badge>}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Discount (RM)</Label>
                <Input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Effective From</Label>
                <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFee(false)}>Cancel</Button>
            <Button onClick={() => addFeeMutation.mutate()} disabled={!selectedPkg || addFeeMutation.isPending}>
              {addFeeMutation.isPending ? "Adding…" : "Add to Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}