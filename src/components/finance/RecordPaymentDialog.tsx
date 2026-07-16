import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wallet, AlertTriangle, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { recordPayment } from "@/lib/billing-service";
import { creditWalletFromOverpayment } from "@/lib/finance/wallet-service";
import { ensurePayerAccountForStudent } from "@/lib/finance/payer-service";
import { PAYMENT_METHODS, formatCurrency } from "@/lib/finance/constants";
import { notifyUsers, getBranchManagerIds } from "@/lib/notify";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    branch_id: string;
    student_id: string;
    payer_account_id?: string | null;
  };
}

type OverpayAction = "refund" | "wallet";

export function RecordPaymentDialog({ open, onOpenChange, invoice }: RecordPaymentDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [overpayAction, setOverpayAction] = useState<OverpayAction>("refund");

  const balanceDue = Math.max(0, invoice.total_amount - invoice.amount_paid);
  const numAmount = parseFloat(amount) || 0;
  const excessAmount = Math.max(0, numAmount - balanceDue);
  const hasExcess = excessAmount > 0.01;
  const effectivePayment = Math.min(numAmount, balanceDue);
  // Wallet credit is available for any invoice tied to a student — if a payer
  // account isn't linked yet we auto-provision one on submit.
  const walletCredit = hasExcess && overpayAction === "wallet" ? excessAmount : 0;
  const refundAmount = hasExcess && overpayAction === "refund" ? excessAmount : 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["finance-invoice", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-payments", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["finance-audit", invoice.id] });
    queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
    queryClient.invalidateQueries({ queryKey: ["wallet-balance-invoice"] });
    queryClient.invalidateQueries({ queryKey: ["account-ledger"] });
    // Parent-facing queries (so /parent-fees + ParentHome reflect new balance)
    queryClient.invalidateQueries({ queryKey: ["parent-household"] });
    queryClient.invalidateQueries({ queryKey: ["parent-fee-summary"] });
    queryClient.invalidateQueries({ queryKey: ["parent-home-latest-story"] });
  };

  const handleSubmit = async () => {
    if (!numAmount || numAmount <= 0) {
      toast.error("Payment amount must be greater than zero.");
      return;
    }

    if (effectivePayment <= 0) {
      toast.error("This invoice has no balance due. Use the wallet adjustment/refund flow instead.");
      return;
    }

    setLoading(true);
    try {
      // If the user chose "credit to wallet" but this invoice has no payer
      // account yet, auto-provision one from the student's primary parent so
      // wallet credits land somewhere consistent.
      let payerAccountId = invoice.payer_account_id ?? null;
      if (walletCredit > 0 && !payerAccountId) {
        payerAccountId = await ensurePayerAccountForStudent(
          invoice.student_id,
          invoice.branch_id,
        );
      }

      // Invoice payment is capped to the true invoice balance. Any excess is handled separately.
      await recordPayment({
        invoiceId: invoice.id,
        branchId: invoice.branch_id,
        invoiceNumber: invoice.invoice_number,
        payerAccountId: payerAccountId,
        amount: effectivePayment,
        paymentDate,
        paymentMethod: method,
        paymentReference: reference || null,
        notes: notes || null,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });

      if (walletCredit > 0 && payerAccountId) {
        await creditWalletFromOverpayment({
          branchId: invoice.branch_id,
          payerAccountId: payerAccountId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          excessAmount: walletCredit,
          actorId: user?.id || "",
          actorName: user?.email || "",
        });
        toast.success(
          `Payment of ${formatCurrency(effectivePayment)} recorded. ${formatCurrency(walletCredit)} credited to parent wallet for future invoices.`
        );
      } else if (refundAmount > 0) {
        toast.success(
          `Payment of ${formatCurrency(effectivePayment)} recorded. Refund ${formatCurrency(refundAmount)} to payer.`
        );
      } else {
        toast.success(`Payment of ${formatCurrency(effectivePayment)} recorded successfully.`);
      }

      invalidateAll();

      // Fire-and-forget notifications
      getBranchManagerIds(invoice.branch_id).then((mgrIds) => {
        notifyUsers(mgrIds, "Payment Recorded", `Payment of ${formatCurrency(effectivePayment)} recorded for ${invoice.invoice_number}`, "payment", invoice.id, `/finance/invoices/${invoice.id}`, `invoice:${invoice.id}`);
      });
      supabase.from("invoices").select("student_id").eq("id", invoice.id).single().then(({ data: inv }) => {
        if (inv?.student_id) {
          supabase.from("parent_students").select("parent_id").eq("student_id", inv.student_id).then(({ data: links }) => {
            if (links?.length) {
              const parentIds = [...new Set(links.map((l: any) => l.parent_id))];
              notifyUsers(parentIds, "Payment Received", `Your payment of ${formatCurrency(effectivePayment)} for ${invoice.invoice_number} has been recorded.`, "billing", invoice.id, "/parent-fees", `invoice:${invoice.id}`, "normal");
            }
          });
          // Email receipt is sent by the DB trigger `notify_payment_receipt`
          // (includes child name + outstanding balance). Do not duplicate here.
        }
      });

      onOpenChange(false);
      setAmount("");
      setReference("");
      setNotes("");
      setOverpayAction("refund");
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment — {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice Total</span><span className="font-semibold">{formatCurrency(invoice.total_amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span>{formatCurrency(invoice.amount_paid)}</span></div>
            <div className="flex justify-between border-t pt-1 mt-1"><span className="font-medium">Balance Due</span><span className="font-bold text-primary">{formatCurrency(balanceDue)}</span></div>
          </div>

          <div className="space-y-2">
            <Label>Amount (RM) *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Balance: ${balanceDue.toFixed(2)}`} />
          </div>

          {/* Overpayment Handling */}
          {hasExcess && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-warning">Overpayment Detected</p>
                  <p className="text-warning text-xs mt-0.5">
                    Payment of {formatCurrency(numAmount)} exceeds balance of {formatCurrency(balanceDue)} by {formatCurrency(excessAmount)}
                  </p>
                </div>
              </div>
              <RadioGroup value={overpayAction} onValueChange={(v) => setOverpayAction(v as OverpayAction)}>
                <div className="flex items-start gap-2 p-2 rounded-md bg-white/60">
                  <RadioGroupItem value="refund" id="refund" className="mt-0.5" />
                  <Label htmlFor="refund" className="cursor-pointer text-xs">
                    <span className="font-medium flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Refund excess to payer</span>
                    <span className="block text-muted-foreground">Record {formatCurrency(balanceDue)} payment, refund {formatCurrency(excessAmount)} outside the invoice</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2 p-2 rounded-md bg-white/60">
                  <RadioGroupItem value="wallet" id="wallet" className="mt-0.5" />
                  <Label htmlFor="wallet" className="cursor-pointer text-xs">
                    <span className="font-medium flex items-center gap-1"><Wallet className="h-3 w-3" /> Credit excess to parent wallet</span>
                    <span className="block text-muted-foreground">
                      Record {formatCurrency(balanceDue)} payment + keep {formatCurrency(excessAmount)} for future invoice offset
                      {!invoice.payer_account_id && " (a payer account will be created automatically)"}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payment Date *</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Method *</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reference / Receipt No.</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-001, cheque number" />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
          </div>

          {/* Allocation Summary */}
          {numAmount > 0 && (
            <>
              <Separator />
              <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
                <p className="font-medium text-muted-foreground uppercase tracking-wider mb-1">Allocation Summary</p>
                <div className="flex justify-between"><span>→ Invoice Payment</span><span className="font-semibold">{formatCurrency(effectivePayment)}</span></div>
                {walletCredit > 0 && (
                  <div className="flex justify-between text-success"><span>→ Parent Wallet Credit</span><span className="font-semibold">{formatCurrency(walletCredit)}</span></div>
                )}
                {refundAmount > 0 && (
                  <div className="flex justify-between text-warning"><span>→ Refund to Payer</span><span className="font-semibold">{formatCurrency(refundAmount)}</span></div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !amount}>
            {loading ? "Recording..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
