import { Card } from "@/components/ui/card";
import { DollarSign, CheckCircle2, CreditCard, RotateCcw, Wallet, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";

interface Summary {
  totalBilled: number;
  totalPaid: number;
  totalCredited: number;
  totalRefunded: number;
  walletBalance: number;
  outstanding: number;
}

export function AccountSummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Total Billed", value: summary.totalBilled, icon: DollarSign, color: "text-foreground", bg: "bg-muted/50" },
    { label: "Total Paid", value: summary.totalPaid, icon: CheckCircle2, color: "text-success", bg: "bg-success/5" },
    { label: "Credits Applied", value: summary.totalCredited, icon: CreditCard, color: "text-muted-foreground", bg: "bg-muted/50" },
    { label: "Refunded", value: summary.totalRefunded, icon: RotateCcw, color: "text-warning", bg: "bg-warning/5" },
    { label: "Wallet Balance", value: summary.walletBalance, icon: Wallet, color: "text-info", bg: "bg-info/5" },
    { label: "Outstanding", value: summary.outstanding, icon: AlertTriangle, color: summary.outstanding > 0 ? "text-destructive" : "text-muted-foreground", bg: summary.outstanding > 0 ? "bg-destructive/5" : "bg-muted/50" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className={`p-3 ${card.bg} border-0 shadow-sm`}>
          <div className="flex items-center gap-2">
            <card.icon className={`h-4 w-4 ${card.color} flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{card.label}</p>
              <p className={`text-sm font-bold ${card.color}`}>{formatCurrency(card.value)}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
