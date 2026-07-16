import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CreditCard, Banknote, Building, Globe, CheckCircle, RotateCcw, ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  received_by?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

const methodIcons: Record<string, React.ElementType> = {
  cash: Banknote,
  bank_transfer: Building,
  cheque: CreditCard,
  billplz: Globe,
  online: Globe,
  wallet: Wallet,
};

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  billplz: "BillPlz",
  online: "Online Payment",
  wallet: "Wallet Credit",
};

export function PaymentTimeline({ payments, onReverse }: { payments: Payment[]; onReverse?: (payment: Payment) => void }) {
  const navigate = useNavigate();
  if (!payments || payments.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet.</p>;
  }

  return (
    <div className="space-y-0">
      {payments.map((payment, idx) => {
        const Icon = methodIcons[payment.payment_method] || CheckCircle;
        const isReversal = payment.amount < 0;
        return (
          <div key={payment.id} className={`flex gap-3 pb-4 relative ${isReversal ? "opacity-70" : ""}`}>
            {idx < payments.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
            )}
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center z-10 ${isReversal ? "bg-destructive/10" : "bg-success/10"}`}>
              {isReversal ? <RotateCcw className="h-4 w-4 text-destructive" /> : <Icon className="h-4 w-4 text-success" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-semibold text-sm ${isReversal ? "text-destructive line-through" : ""}`}>
                  RM {Math.abs(payment.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  {isReversal && " (Reversed)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(payment.payment_date), "dd MMM yyyy")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {methodLabels[payment.payment_method] || payment.payment_method}
                {payment.payment_reference && ` · Ref: ${payment.payment_reference}`}
              </p>
              {payment.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">"{payment.notes}"</p>
              )}
              {onReverse && !isReversal && payment.amount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/15 px-2"
                  onClick={() => onReverse(payment)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Reverse
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}