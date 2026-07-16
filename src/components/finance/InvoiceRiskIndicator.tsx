import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, ShieldCheck, AlertTriangle, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";
import { getInvoiceRiskSummary } from "@/lib/finance/dispute-service";

interface InvoiceRiskIndicatorProps {
  invoiceId: string;
  amountPaid: number;
}

export function InvoiceRiskIndicator({ invoiceId, amountPaid }: InvoiceRiskIndicatorProps) {
  const { data: risk } = useQuery({
    queryKey: ["invoice-risk", invoiceId],
    queryFn: () => getInvoiceRiskSummary(invoiceId),
    enabled: !!invoiceId,
  });

  if (!risk || !risk.hasLockedFunds) return null;

  return (
    <Card className="border-warning/20 bg-warning/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-warning/10 p-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-warning">Funds at Risk</p>
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                <Lock className="h-2.5 w-2.5 mr-1" />
                {risk.activeDisputes} Active Dispute{risk.activeDisputes !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Total Paid</p>
                <p className="font-semibold">{formatCurrency(amountPaid)}</p>
              </div>
              <div>
                <p className="text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Disputed
                </p>
                <p className="font-bold text-warning">{formatCurrency(risk.disputedAmount)}</p>
              </div>
              <div>
                <p className="text-success flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Secured
                </p>
                <p className="font-bold text-success">{formatCurrency(risk.securedAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
