/**
 * BillPlz Gateway Metadata Panel
 * Shows BillPlz-specific transaction details on the Payment Detail page.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreditCard, Clock, CheckCircle, XCircle, ArrowRightLeft, Banknote } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/finance/constants";
import {
  getGatewayTransactionForPayment,
  getGatewayEventsForPayment,
  RECONCILIATION_STATUSES,
  SETTLEMENT_STATUSES,
  PROCESSING_STATUSES,
} from "@/lib/finance/gateway-service";

interface GatewayMetadataPanelProps {
  paymentId: string;
}

export function GatewayMetadataPanel({ paymentId }: GatewayMetadataPanelProps) {
  const { data: txn } = useQuery({
    queryKey: ["gateway-txn", paymentId],
    queryFn: () => getGatewayTransactionForPayment(paymentId),
    enabled: !!paymentId,
  });

  const { data: events } = useQuery({
    queryKey: ["gateway-events-payment", paymentId],
    queryFn: () => getGatewayEventsForPayment(paymentId),
    enabled: !!paymentId,
  });

  if (!txn && (!events || events.length === 0)) return null;

  const reconCfg = txn ? (RECONCILIATION_STATUSES.find(s => s.value === txn.reconciliation_status) || { label: txn.reconciliation_status, color: "" }) : null;
  const settleCfg = txn?.settlement_status ? (SETTLEMENT_STATUSES.find(s => s.value === txn.settlement_status) || { label: txn.settlement_status, color: "" }) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> BillPlz Gateway
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {txn && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Bill ID</p>
                <p className="font-mono font-semibold mt-0.5">{txn.bill_id}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Collection</p>
                <p className="font-mono mt-0.5">{txn.collection_id || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Transaction Ref</p>
                <p className="font-mono mt-0.5">{txn.transaction_reference || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Gateway Amount</p>
                <p className="font-semibold mt-0.5">{formatCurrency(Number(txn.gateway_amount))}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${txn.gateway_status === "paid" ? "bg-success/5 text-success border-success/20" : "bg-muted text-muted-foreground border-border"}`}>
                Gateway: {txn.gateway_status}
              </Badge>
              {reconCfg && <Badge variant="outline" className={`text-[10px] ${reconCfg.color}`}>{reconCfg.label}</Badge>}
              {settleCfg && <Badge variant="outline" className={`text-[10px] ${settleCfg.color}`}>{settleCfg.label}</Badge>}
            </div>

            {/* Settlement Info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">Settlement</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">{txn.settlement_status || "Pending"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date: </span>
                  <span className="font-medium">{txn.settlement_date ? format(new Date(txn.settlement_date), "dd MMM yyyy") : "—"}</span>
                </div>
                {txn.settlement_reference && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Ref: </span>
                    <span className="font-mono">{txn.settlement_reference}</span>
                  </div>
                )}
              </div>
              {txn.gateway_paid_at && (
                <p className="text-[10px] text-muted-foreground">
                  Payment confirmed: {format(new Date(txn.gateway_paid_at), "dd MMM yyyy HH:mm")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Webhook Event History */}
        {events && events.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Webhook Event History
              </p>
              <ScrollArea className="h-[160px]">
                <div className="space-y-2">
                  {events.map(evt => {
                    const statusCfg = PROCESSING_STATUSES.find(s => s.value === evt.processing_status) || { label: evt.processing_status, color: "" };
                    return (
                      <div key={evt.id} className="flex items-start gap-2 text-xs">
                        <div className="flex-shrink-0 mt-0.5">
                          {evt.processing_status === "processed" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> :
                           evt.processing_status === "failed" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
                           <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[9px] ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            <span className="font-mono text-muted-foreground">{evt.event_type}</span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {format(new Date(evt.created_at), "dd MMM yy HH:mm:ss")}
                            {evt.retry_count > 0 && ` · ${evt.retry_count} retries`}
                          </p>
                          {evt.processing_error && <p className="text-destructive mt-0.5 truncate">{evt.processing_error}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
