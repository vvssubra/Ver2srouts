import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wallet, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/finance/constants";
import { getWalletBalance, applyWalletToInvoice } from "@/lib/finance/wallet-service";

interface ApplyWalletCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    branch_id: string;
    payer_account_id?: string | null;
  };
}

export function ApplyWalletCreditDialog({ open, onOpenChange, invoice }: ApplyWalletCreditDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");

  const balanceDue = invoice.total_amount - invoice.amount_paid;

  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance", invoice.payer_account_id],
    queryFn: () => getWalletBalance(invoice.payer_account_id!),
    enabled: open && !!invoice.payer_account_id,
  });

  const available = wallet?.available || 0;
  const maxApply = Math.min(available, balanceDue);

  useEffect(() => {
    if (open) setAmount(maxApply.toFixed(2));
  }, [open, maxApply]);

  const numAmount = parseFloat(amount) || 0;
  const remainingPayable = Math.max(0, balanceDue - numAmount);
  const walletAfter = available - numAmount;

  const handleApply = async () => {
    if (numAmount <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (numAmount > available + 0.01) { toast.error("Amount exceeds wallet balance"); return; }
    if (numAmount > balanceDue + 0.01) { toast.error("Amount exceeds invoice balance"); return; }

    setLoading(true);
    try {
      await applyWalletToInvoice({
        branchId: invoice.branch_id,
        payerAccountId: invoice.payer_account_id!,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        amount: numAmount,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });
      toast.success(`${formatCurrency(numAmount)} wallet credit applied to ${invoice.invoice_number}`);
      queryClient.invalidateQueries({ queryKey: ["wallet-balance"] });
      queryClient.invalidateQueries({ queryKey: ["finance-invoice", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["finance-payments", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["account-ledger"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!invoice.payer_account_id) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-success" /> Apply Wallet Credit
          </DialogTitle>
          <DialogDescription>
            Use available wallet credit to offset {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Wallet Status */}
          <div className="rounded-xl bg-success/5 border border-success/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-success uppercase tracking-wider">Available Credit</p>
                <p className="text-2xl font-bold text-success mt-0.5">{formatCurrency(available)}</p>
              </div>
              <div className="p-2.5 bg-success/10 rounded-xl">
                <Wallet className="h-6 w-6 text-success" />
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label>Amount to Apply (RM)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={maxApply}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setAmount(maxApply.toFixed(2))}>
                Max ({formatCurrency(maxApply)})
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setAmount(balanceDue.toFixed(2))} disabled={available < balanceDue}>
                Full Invoice
              </Button>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
            <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Settlement Preview</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Balance</span>
              <span className="font-semibold">{formatCurrency(balanceDue)}</span>
            </div>
            <div className="flex justify-between text-success">
              <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Wallet Applied</span>
              <span className="font-semibold">− {formatCurrency(numAmount)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-bold">
              <span>Remaining Payable</span>
              <span className={remainingPayable > 0 ? "text-destructive" : "text-success"}>
                {formatCurrency(remainingPayable)}
                {remainingPayable === 0 && <CheckCircle2 className="h-3.5 w-3.5 inline ml-1" />}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Wallet After</span>
              <span>{formatCurrency(Math.max(0, walletAfter))}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply} disabled={loading || numAmount <= 0 || numAmount > available + 0.01} className="gap-2">
            {loading ? "Applying..." : <>Apply Credit <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
