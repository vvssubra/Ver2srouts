import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, CreditCard, AlertTriangle, TrendingUp, Calendar, ArrowDownLeft, Info, Clock, BarChart3 } from "lucide-react";

interface KPIData {
  // YTD
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  collectionRate: number;
  overdueAmount: number;
  thisMonthFees: number;
  termRecurring: number;
  totalRefunds: number;
  // Monthly
  monthBilled: number;
  monthCollected: number;
  monthOutstanding: number;
  monthCollectionRate: number;
  monthOverdue: number;
  carryForwardOutstanding: number;
}

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;

const borderColors: Record<string, string> = {
  billed: "border-l-4 border-l-muted-foreground/40",
  collected: "border-l-4 border-l-primary",
  outstanding: "border-l-4 border-l-destructive",
  rate: "border-l-4 border-l-foreground/50",
  overdue: "border-l-4 border-l-destructive/70",
  expected: "border-l-4 border-l-primary/50",
  net: "border-l-4 border-l-primary",
  carry: "border-l-4 border-l-amber-500",
};

export default function BillingKPIs({ kpis }: { kpis: KPIData }) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const netCashYTD = kpis.totalCollected - kpis.totalRefunds;
  const netCashMonth = kpis.monthCollected - kpis.totalRefunds;

  const monthlyCards = [
    { icon: DollarSign, label: "Billed (This Month)", value: rm(kpis.monthBilled), color: "text-muted-foreground", border: borderColors.billed, tooltip: "Total amount invoiced for the current billing month." },
    { icon: CreditCard, label: "Collected (This Month)", value: rm(kpis.monthCollected), color: "text-primary", border: borderColors.collected, tooltip: "Total payments received for invoices in the current month." },
    { icon: AlertTriangle, label: "Outstanding (This Month)", value: rm(kpis.monthOutstanding), color: "text-destructive", border: borderColors.outstanding, tooltip: "Unpaid balance on invoices issued this month." },
    { icon: TrendingUp, label: "Collection Rate", value: `${kpis.monthCollectionRate.toFixed(1)}%`, color: "text-foreground", border: borderColors.rate, tooltip: "Percentage of this month's billed amount that has been collected." },
    { icon: Clock, label: "Carried Forward", value: rm(kpis.carryForwardOutstanding), color: kpis.carryForwardOutstanding > 0 ? "text-amber-600" : "text-muted-foreground", border: borderColors.carry, tooltip: "Unpaid invoices from previous months still outstanding." },
    { icon: AlertTriangle, label: "Overdue", value: rm(kpis.monthOverdue), color: "text-destructive", border: borderColors.overdue, tooltip: "Invoices past their due date that remain unpaid." },
    { icon: Calendar, label: "Monthly Recurring", value: rm(kpis.thisMonthFees), color: "text-foreground", border: borderColors.expected, tooltip: "Expected monthly revenue based on active student fee assignments (monthly fees only)." },
    { icon: Calendar, label: "Term Recurring", value: rm(kpis.termRecurring), color: "text-foreground", border: borderColors.expected, tooltip: "Expected term revenue based on active student fee assignments (term fees only). Billed per academic term." },
  ];

  const yearlyCards = [
    { icon: DollarSign, label: "Total Billed (YTD)", value: rm(kpis.totalBilled), color: "text-muted-foreground", border: borderColors.billed, tooltip: "Total amount invoiced year-to-date." },
    { icon: CreditCard, label: "Collected (YTD)", value: rm(kpis.totalCollected), color: "text-primary", border: borderColors.collected, tooltip: "Total payments received year-to-date." },
    { icon: AlertTriangle, label: "Outstanding (Total)", value: rm(kpis.outstanding), color: "text-destructive", border: borderColors.outstanding, tooltip: "Total unpaid balance across all invoices this year." },
    { icon: TrendingUp, label: "Collection Rate", value: `${kpis.collectionRate.toFixed(1)}%`, color: "text-foreground", border: borderColors.rate, tooltip: "Percentage of year-to-date billed amount that has been collected." },
    { icon: AlertTriangle, label: "Overdue", value: rm(kpis.overdueAmount), color: "text-destructive", border: borderColors.overdue, tooltip: "Total overdue invoices across all months." },
    { icon: ArrowDownLeft, label: "Net Cash Position", value: rm(netCashYTD), color: netCashYTD >= 0 ? "text-primary" : "text-destructive", border: netCashYTD >= 0 ? borderColors.net : borderColors.outstanding, tooltip: "Collections minus refunds year-to-date." },
    { icon: Calendar, label: "Monthly Recurring", value: rm(kpis.thisMonthFees), color: "text-foreground", border: borderColors.expected, tooltip: "Expected monthly revenue based on active student fee assignments." },
    { icon: Calendar, label: "Term Recurring", value: rm(kpis.termRecurring), color: "text-foreground", border: borderColors.expected, tooltip: "Expected term revenue based on active student fee assignments." },
  ];

  const cards = view === "monthly" ? monthlyCards : yearlyCards;

  const renderCard = (c: typeof monthlyCards[0], i: number) => (
    <Card key={i} className={c.border}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
          <p className="text-[11px] text-muted-foreground font-medium leading-tight">{c.label}</p>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="shrink-0">
                  <Info className="h-3 w-3 text-muted-foreground/60 cursor-help hover:text-muted-foreground transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px] text-xs">
                {c.tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className={`text-lg font-bold tracking-tight ${c.color}`}>{c.value}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as "monthly" | "yearly")}>
          <TabsList className="h-8">
            <TabsTrigger value="monthly" className="text-xs gap-1.5 px-3 h-7">
              <Calendar className="h-3 w-3" /> This Month
            </TabsTrigger>
            <TabsTrigger value="yearly" className="text-xs gap-1.5 px-3 h-7">
              <BarChart3 className="h-3 w-3" /> Year-to-Date
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.slice(0, 4).map(renderCard)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.slice(4).map((c, i) => renderCard(c, i + 4))}
      </div>
    </div>
  );
}

export type { KPIData };
