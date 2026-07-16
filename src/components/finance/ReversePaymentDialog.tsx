import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { reversePayment } from "@/lib/finance/payment-service";
import { useApprovalGate } from "@/hooks/use-approval-gate";
import { formatCurrency } from "@/lib/finance/constants";

interface ReversePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    payment_reference: string | null;
    invoice_id: string;
  };
  invoice: {
    id: string;
    invoice_number: string;
    branch_id: string;
    payer_account_id?: string | null;
  };
}

export function ReversePaymentDialog({ open, onOpenChange, payment, invoice }: ReversePaymentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const gate = useApprovalGate();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-invoice", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-payments", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-audit", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["account-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
  };

  const handleReverse = async () => {
    if (!reason.trim()) {
      toast.error("A reason is required for payment reversals.");
      return;
    }

    setLoading(true);
    try {
      // 1. Check approval gate
      const gateResult = await gate.check({
        branchId: invoice.branch_id,
        actionType: "payment_reversal",
        amount: payment.amount,
        entityType: "payment",
        entityId: payment.id,
        requestSummary: `Reverse payment of ${formatCurrency(payment.amount)} on ${invoice.invoice_number}`,
        requestDetails: {
          payment_id: payment.id,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          payment_method: payment.payment_method,
          payment_date: payment.payment_date,
          payment_reference: payment.payment_reference,
          payer_account_id: invoice.payer_account_id,
        },
        supportingNotes: reason.trim(),
        financialImpact: {
          reversal_amount: payment.amount,
          affected_invoice: invoice.invoice_number,
          original_method: payment.payment_method,
        },
        requesterId: user?.id || "",
      });

      // If approval required, close dialog — action is now pending
      if (gateResult === "submitted" || gateResult === "already_pending") {
        invalidateQueries();
        onOpenChange(false);
        setReason("");
        return;
      }

      // 2. No approval needed — execute immediately
      await reversePayment({
        paymentId: payment.id,
        invoiceId: invoice.id,
        branchId: invoice.branch_id,
        invoiceNumber: invoice.invoice_number,
        payerAccountId: invoice.payer_account_id,
        originalAmount: payment.amount,
        originalMethod: payment.payment_method,
        originalReference: payment.payment_reference,
        reason: reason.trim(),
        actorId: user?.id || "",
        actorName: user?.email || "",
      });

      toast.success(`Payment of ${formatCurrency(payment.amount)} reversed successfully.`);
      invalidateQueries();
      onOpenChange(false);
      setReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reverse payment");
    } finally {
      setLoading(false);
    }
  };

  const isProcessing = loading || gate.checking;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reverse Payment
          </DialogTitle>
          <DialogDescription>
            This will create a compensating entry to reverse the payment. The original payment record will remain visible in the history for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Approval gate indicator */}
          <div className="rounded-lg bg-warning/5 border border-warning/20 p-3 text-sm flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-warning">Governance Check</p>
              <p className="text-xs text-warning mt-0.5">
                This action may require approval based on configured rules. If approval is needed, your request will be submitted for review.
              </p>
            </div>
          </div>

          {/* Original payment details */}
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-sm space-y-1">
            <p className="font-semibold text-destructive">Original Payment</p>
            <div className="flex justify-between text-destructive">
              <span>Amount</span>
              <span className="font-bold">{formatCurrency(payment.amount)}</span>
            </div>
            <div className="flex justify-between text-destructive">
              <span>Method</span>
              <span>{payment.payment_method}</span>
            </div>
            <div className="flex justify-between text-destructive">
              <span>Date</span>
              <span>{payment.payment_date}</span>
            </div>
            {payment.payment_reference && (
              <div className="flex justify-between text-destructive">
                <span>Reference</span>
                <span className="font-mono text-xs">{payment.payment_reference}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium text-foreground mb-1">What happens:</p>
            <ul className="text-muted-foreground space-y-0.5 text-xs list-disc list-inside">
              <li>Original payment stays in the ledger (immutable)</li>
              <li>A reversal entry of {formatCurrency(payment.amount)} is added</li>
              <li>Invoice balance recalculates automatically</li>
              <li>Full audit trail preserved with reason</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label className="text-destructive">Reason for Reversal *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Duplicate payment, incorrect amount, bank transfer failed..."
              className="border-destructive/20 focus-visible:ring-destructive/30"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleReverse}
            disabled={isProcessing || !reason.trim()}
            className="gap-2"
          >
            {gate.checking ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : loading ? (
              "Reversing..."
            ) : (
              "Confirm Reversal"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
