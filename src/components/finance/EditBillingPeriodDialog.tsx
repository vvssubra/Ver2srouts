import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { updateInvoiceBillingPeriod } from "@/lib/finance/invoice-service";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    branch_id: string;
    billing_month: number;
    billing_year: number;
  };
  actorId: string;
  actorName: string;
  onSuccess?: () => void;
}

export function EditBillingPeriodDialog({ open, onOpenChange, invoice, actorId, actorName, onSuccess }: Props) {
  const [month, setMonth] = useState(String(invoice.billing_month));
  const [year, setYear] = useState(String(invoice.billing_year));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMonth(String(invoice.billing_month));
      setYear(String(invoice.billing_year));
      setReason("");
    }
  }, [open, invoice.billing_month, invoice.billing_year]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await updateInvoiceBillingPeriod({
        invoiceId: invoice.id,
        branchId: invoice.branch_id,
        invoiceNumber: invoice.invoice_number,
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        reason: reason.trim(),
        actorId,
        actorName,
      });
      toast.success("Billing period updated");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update billing period");
    } finally {
      setLoading(false);
    }
  };

  const unchanged =
    parseInt(month, 10) === invoice.billing_month &&
    parseInt(year, 10) === invoice.billing_year;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Billing Period</DialogTitle>
          <DialogDescription>
            Current period: <span className="font-medium">{MONTHS[invoice.billing_month - 1]} {invoice.billing_year}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            This only corrects the billing period label. Payments, totals, invoice number and ledger entries are unchanged.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>New Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>New Year</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reason for change</Label>
          <Textarea
            placeholder="e.g. Billed wrong month — should be June tuition"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Minimum 5 characters. Recorded in the audit trail.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || unchanged || reason.trim().length < 5}
          >
            {loading ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}