import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/finance/constants";
import { allocatePayment } from "@/lib/finance/allocation-service";
import { toast } from "sonner";

interface AllocationScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    allocated: number;
    payment_method: string;
    payment_reference: string | null;
    branch_id: string;
  };
  onComplete: () => void;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  due_date: string | null;
  student_id: string;
  students: { first_name: string; last_name: string } | null;
  payer_account_id: string | null;
}

export function AllocationScreen({ open, onOpenChange, payment, onComplete }: AllocationScreenProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [allocations, setAllocations] = useState<Map<string, number>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const available = payment.amount - payment.allocated;
  const branchId = payment.branch_id;

  // Fetch outstanding invoices scoped to branch
  const { data: invoices } = useQuery({
    queryKey: ["allocatable-invoices", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, due_date, student_id, students(first_name, last_name), payer_account_id")
        .eq("branch_id", branchId)
        .in("status", ["issued", "partial", "overdue"])
        .order("due_date", { ascending: true });
      return (data || []) as InvoiceRow[];
    },
    enabled: open && !!branchId,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setAllocations(new Map());
      setSelectedIds(new Set());
    }
  }, [open]);

  // Group invoices by student for family view
  const grouped = useMemo(() => {
    if (!invoices) return [];
    const groups = new Map<string, { student: string; invoices: InvoiceRow[] }>();
    invoices.forEach((inv) => {
      const student = inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "Unknown";
      const key = inv.student_id;
      if (!groups.has(key)) groups.set(key, { student, invoices: [] });
      groups.get(key)!.invoices.push(inv);
    });
    return Array.from(groups.values());
  }, [invoices]);

  const totalAllocated = Array.from(allocations.values()).reduce((s, v) => s + v, 0);
  const remaining = available - totalAllocated;
  const isOverAllocated = remaining < -0.01;

  const toggleInvoice = (invId: string, outstanding: number) => {
    const next = new Set(selectedIds);
    const nextAlloc = new Map(allocations);
    if (next.has(invId)) {
      next.delete(invId);
      nextAlloc.delete(invId);
    } else {
      next.add(invId);
      // Auto-fill with min of outstanding or remaining
      const currentTotal = Array.from(nextAlloc.values()).reduce((s, v) => s + v, 0);
      const remainForThis = available - currentTotal;
      nextAlloc.set(invId, Math.min(outstanding, Math.max(0, remainForThis)));
    }
    setSelectedIds(next);
    setAllocations(nextAlloc);
  };

  const updateAmount = (invId: string, amount: number) => {
    const next = new Map(allocations);
    if (amount <= 0) {
      next.delete(invId);
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(invId); return s; });
    } else {
      next.set(invId, amount);
    }
    setAllocations(next);
  };

  const handleSubmit = async () => {
    if (totalAllocated <= 0) { toast.error("No allocations specified"); return; }
    if (isOverAllocated) { toast.error("Total allocations exceed available amount"); return; }

    const allocationItems = Array.from(allocations.entries()).map(([invoiceId, amount]) => {
      const inv = invoices?.find((i) => i.id === invoiceId);
      return {
        invoiceId,
        invoiceNumber: inv?.invoice_number || invoiceId.slice(0, 8),
        amount,
      };
    });

    setLoading(true);
    try {
      await allocatePayment({
        paymentId: payment.id,
        branchId,
        allocations: allocationItems,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success(`${formatCurrency(totalAllocated)} allocated across ${allocationItems.length} invoice(s)`);
      onComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Allocate Payment
          </DialogTitle>
          <DialogDescription>
            Distribute {formatCurrency(available)} across outstanding invoices
          </DialogDescription>
        </DialogHeader>

        {/* Allocation Summary Bar */}
        <div className="rounded-xl bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available to Allocate</span>
            <span className="font-bold">{formatCurrency(available)}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOverAllocated ? "bg-destructive/30" : "bg-success/30"}`}
              style={{ width: `${Math.min((totalAllocated / available) * 100, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-success font-medium">Allocated: {formatCurrency(totalAllocated)}</span>
            <span className={`font-medium ${isOverAllocated ? "text-destructive" : remaining > 0.01 ? "text-warning" : "text-success"}`}>
              Remaining: {formatCurrency(Math.max(0, remaining))}
              {isOverAllocated && (
                <span className="ml-1 text-destructive">
                  <AlertTriangle className="h-3 w-3 inline" /> Over by {formatCurrency(Math.abs(remaining))}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Invoice Selection Table */}
        <ScrollArea className="h-[400px] -mx-2 px-2">
          {grouped.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No outstanding invoices found
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.student}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {group.student}
                  </p>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[40px]" />
                          <TableHead className="text-xs font-semibold">Invoice</TableHead>
                          <TableHead className="text-xs font-semibold w-[100px]">Due Date</TableHead>
                          <TableHead className="text-xs font-semibold text-right w-[100px]">Outstanding</TableHead>
                          <TableHead className="text-xs font-semibold text-right w-[130px]">Allocate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.invoices.map((inv) => {
                          const outstanding = inv.total_amount - (inv.amount_paid || 0);
                          const isSelected = selectedIds.has(inv.id);
                          const allocAmount = allocations.get(inv.id) || 0;
                          const exceedsOutstanding = allocAmount > outstanding + 0.01;

                          return (
                            <TableRow key={inv.id} className={`text-sm ${isSelected ? "bg-success/5" : ""}`}>
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleInvoice(inv.id, outstanding)}
                                />
                              </TableCell>
                              <TableCell>
                                <span className="font-mono font-medium text-xs">{inv.invoice_number}</span>
                                <Badge variant="outline" className={`ml-2 text-[10px] ${inv.status === "overdue" ? "text-destructive border-destructive/20" : ""}`}>
                                  {inv.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {inv.due_date ? format(new Date(inv.due_date), "dd MMM yy") : "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-destructive">
                                {formatCurrency(outstanding)}
                              </TableCell>
                              <TableCell className="text-right">
                                {isSelected ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={outstanding}
                                    value={allocAmount || ""}
                                    onChange={(e) => updateAmount(inv.id, parseFloat(e.target.value) || 0)}
                                    className={`w-[110px] ml-auto text-right h-8 text-sm ${exceedsOutstanding ? "border-destructive/30 text-destructive" : ""}`}
                                  />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* Allocation Preview */}
        {totalAllocated > 0 && (
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-medium text-muted-foreground uppercase tracking-wider mb-1">Allocation Preview</p>
            {Array.from(allocations.entries()).map(([invId, amount]) => {
              const inv = invoices?.find((i) => i.id === invId);
              return (
                <div key={invId} className="flex justify-between">
                  <span>{inv?.invoice_number || invId.slice(0, 8)}</span>
                  <span className="font-semibold text-success">{formatCurrency(amount)}</span>
                </div>
              );
            })}
            <Separator className="my-1" />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span>{formatCurrency(totalAllocated)}</span>
            </div>
            {remaining > 0.01 && (
              <div className="flex justify-between text-warning">
                <span>Remaining (stays unallocated)</span>
                <span>{formatCurrency(remaining)}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || totalAllocated <= 0 || isOverAllocated}
            className="gap-2"
          >
            {loading ? "Allocating..." : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirm Allocation ({allocations.size} invoice{allocations.size !== 1 ? "s" : ""})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
