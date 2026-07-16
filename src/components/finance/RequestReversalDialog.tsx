import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createDispute, DISPUTE_REASON_CODES } from "@/lib/finance/dispute-service";
import { formatCurrency } from "@/lib/finance/constants";
import { toast } from "sonner";

interface RequestReversalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    invoice_id: string | null;
    payment_method: string;
    payment_reference: string | null;
    branch_id: string;
    payer_account_id?: string | null;
  };
  onComplete: () => void;
}

export function RequestReversalDialog({ open, onOpenChange, payment, onComplete }: RequestReversalDialogProps) {
  const { user } = useAuth();
  const [reasonCode, setReasonCode] = useState("bounced_cheque");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for this reversal request");
      return;
    }

    setLoading(true);
    try {
      await createDispute({
        paymentId: payment.id,
        invoiceId: payment.invoice_id,
        branchId: payment.branch_id,
        payerAccountId: payment.payer_account_id,
        disputeType: "reversal_request",
        reason: reason.trim(),
        reasonCode,
        disputedAmount: payment.amount,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success("Reversal request submitted. Funds are now locked pending approval.");
      onComplete();
      onOpenChange(false);
      setReason("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" /> Request Payment Reversal
          </DialogTitle>
          <DialogDescription>
            This will lock {formatCurrency(payment.amount)} pending manager approval
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-warning/5 p-3 text-xs text-warning">
            <strong>Important:</strong> This does not reverse the payment immediately. The funds will be marked as "locked" until a manager approves or rejects this request.
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Reason Category *</p>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPUTE_REASON_CODES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Details *</p>
            <Textarea
              placeholder="Describe why this payment needs to be reversed..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Amount</span>
              <span className="font-semibold">{formatCurrency(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono">{payment.payment_reference || "—"}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !reason.trim()} variant="destructive" className="gap-2">
            {loading ? "Submitting..." : (
              <>
                <ShieldAlert className="h-4 w-4" /> Submit Reversal Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
