import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Ban, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";

interface CancelInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    status: string;
  };
  /** true when there are payments that need voiding */
  isVoid: boolean;
  loading: boolean;
  onConfirm: (reason: string) => void;
}

export function CancelInvoiceDialog({ open, onOpenChange, invoice, isVoid, loading, onConfirm }: CancelInvoiceDialogProps) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  };

  const title = isVoid ? "Void Invoice" : "Cancel Invoice";
  const description = isVoid
    ? `This will reverse all ${formatCurrency(invoice.amount_paid)} in payments and cancel the invoice. This action requires supervisor approval.`
    : `This will cancel invoice ${invoice.invoice_number}. This action may require supervisor approval.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVoid ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <Ban className="h-5 w-5 text-warning" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isVoid && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Important:</strong> This will create compensating entries to reverse all {invoice.amount_paid > 0 ? formatCurrency(invoice.amount_paid) : ""} in recorded payments, then cancel the invoice. The original records are preserved for audit purposes.
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-mono font-semibold">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-semibold">{formatCurrency(invoice.total_amount)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payments to Reverse</span>
                <span className="font-semibold text-destructive">{formatCurrency(invoice.amount_paid)}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Reason for {isVoid ? "voiding" : "cancellation"} *</p>
            <Textarea
              placeholder={`Explain why this invoice needs to be ${isVoid ? "voided" : "cancelled"}...`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Go Back</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            variant="destructive"
            className="gap-2"
          >
            {loading ? "Processing..." : (
              <>
                {isVoid ? <ShieldAlert className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isVoid ? "Submit Void Request" : "Submit Cancellation"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
