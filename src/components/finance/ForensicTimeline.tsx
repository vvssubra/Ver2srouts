import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  FileText, CreditCard, XCircle, Edit, CheckCircle, RotateCcw,
  AlertTriangle, Wallet, ArrowDownRight, Shield, Clock, ArrowUpRight, Settings
} from "lucide-react";
import { getAuditActionConfig, formatCurrency } from "@/lib/finance/constants";

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string | null;
  actor_id: string | null;
  reason: string | null;
  new_values: any;
  old_values: any;
  created_at: string | null;
}

const actionIcons: Record<string, React.ElementType> = {
  invoice_created: FileText,
  invoice_issued: CheckCircle,
  invoice_cancelled: XCircle,
  invoice_updated: Edit,
  payment_recorded: CreditCard,
  payment_reversed: RotateCcw,
  credit_note_issued: ArrowDownRight,
  write_off: AlertTriangle,
  // Granular wallet actions
  wallet_credited_overpayment: ArrowUpRight,
  wallet_credited_cn: ArrowUpRight,
  wallet_adjusted: Settings,
  wallet_offset_applied: ArrowDownRight,
  // Legacy
  wallet_credit: Wallet,
  webhook_payment: Shield,
};

export function ForensicTimeline({ entries }: { entries: AuditEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-muted-foreground">No activity recorded for this account</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="relative pl-6">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-0">
          {entries.map((entry) => {
            const config = getAuditActionConfig(entry.action);
            const Icon = actionIcons[entry.action] || FileText;
            const isSystemAction = !entry.actor_name || entry.actor_name === "system";

            return (
              <div key={entry.id} className="relative flex gap-3 pb-5">
                <div className={`absolute -left-6 flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center ${config.bgColor} border-2 border-background z-10`}>
                  <Icon className={`h-3 w-3 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0 ml-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{config.label}</span>
                    {isSystemAction && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-border">
                        System
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {entry.created_at ? format(new Date(entry.created_at), "dd MMM yyyy, HH:mm:ss") : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isSystemAction ? "Automated action" : `By ${entry.actor_name}`}
                    {entry.entity_type && ` · ${entry.entity_type}`}
                  </p>
                  {entry.reason && (
                    <p className="text-xs mt-1 text-warning bg-warning/5 rounded px-2 py-1 inline-block">
                      Reason: {entry.reason}
                    </p>
                  )}
                  {entry.new_values && (
                    <div className="mt-1.5 text-xs space-y-0.5">
                      {entry.action === "payment_recorded" && entry.new_values.amount && (
                        <p className="text-success font-medium">
                          {formatCurrency(Number(entry.new_values.amount))} via {entry.new_values.method || "—"}
                          {entry.new_values.reference && ` · Ref: ${entry.new_values.reference}`}
                        </p>
                      )}
                      {entry.action === "payment_reversed" && entry.new_values.original_amount && (
                        <p className="text-destructive font-medium">
                          Reversed {formatCurrency(Number(entry.new_values.original_amount))}
                        </p>
                      )}
                      {entry.action === "invoice_issued" && entry.new_values.total_amount && (
                        <p className="text-info font-medium">
                          {formatCurrency(Number(entry.new_values.total_amount))}
                        </p>
                      )}
                      {/* Wallet-specific details */}
                      {(entry.action === "wallet_credited_overpayment" || entry.action === "wallet_credited_cn") && entry.new_values.amount && (
                        <p className="text-success font-medium">
                          +{formatCurrency(Number(entry.new_values.amount))} credited to wallet
                        </p>
                      )}
                      {entry.action === "wallet_adjusted" && entry.new_values.amount && (
                        <p className={`font-medium ${Number(entry.new_values.amount) > 0 ? "text-success" : "text-destructive"}`}>
                          {Number(entry.new_values.amount) > 0 ? "+" : "−"}{formatCurrency(Math.abs(Number(entry.new_values.amount)))} ({entry.new_values.direction})
                        </p>
                      )}
                      {entry.action === "wallet_offset_applied" && entry.new_values.amount && (
                        <p className="text-primary font-medium">
                          {formatCurrency(Number(entry.new_values.amount))} applied to {entry.new_values.invoice_number || "invoice"}
                        </p>
                      )}
                    </div>
                  )}
                  {entry.old_values && entry.new_values && !["payment_recorded", "payment_reversed", "wallet_credited_overpayment", "wallet_credited_cn", "wallet_adjusted", "wallet_offset_applied"].includes(entry.action) && (
                    <div className="mt-1.5 flex gap-3 text-xs">
                      {Object.keys(entry.new_values).filter(k => entry.old_values?.[k] !== undefined && entry.old_values[k] !== entry.new_values[k]).map(k => (
                        <span key={k} className="text-muted-foreground">
                          {k}: <span className="line-through text-destructive">{String(entry.old_values[k])}</span> → <span className="text-foreground font-medium">{String(entry.new_values[k])}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
