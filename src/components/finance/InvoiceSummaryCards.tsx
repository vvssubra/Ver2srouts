import { Card } from "@/components/ui/card";
import { DollarSign, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";

interface SummaryData {
  totalBilled: number;
  totalCollected: number;
  totalOverdue: number;
  totalUnpaid: number;
}

export function InvoiceSummaryCards({ data }: { data: SummaryData }) {
  const cards = [
    { label: "Total Billed", value: data.totalBilled, icon: DollarSign, color: "text-foreground", bg: "bg-muted/50" },
    { label: "Collected", value: data.totalCollected, icon: CheckCircle2, color: "text-success", bg: "bg-success/5" },
    { label: "Overdue", value: data.totalOverdue, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/5" },
    { label: "Unpaid Balance", value: data.totalUnpaid, icon: Clock, color: "text-warning", bg: "bg-warning/5" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={`p-4 ${card.bg} border-0 shadow-sm`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-background/80">
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className={`text-lg font-bold tracking-tight ${card.color}`}>{formatCurrency(card.value)}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
