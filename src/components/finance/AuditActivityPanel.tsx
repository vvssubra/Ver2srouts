import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, CreditCard, XCircle, Edit, CheckCircle, RotateCcw } from "lucide-react";
import { getAuditActionConfig, formatCurrency } from "@/lib/finance/constants";

interface AuditEntry {
  id: string;
  action: string;
  actor_name: string | null;
  reason: string | null;
  new_values: any;
  old_values: any;
  created_at: string;
}

const actionIcons: Record<string, React.ElementType> = {
  invoice_created: FileText,
  invoice_issued: CheckCircle,
  invoice_cancelled: XCircle,
  invoice_updated: Edit,
  payment_recorded: CreditCard,
  payment_reversed: RotateCcw,
};

export function AuditActivityPanel({ entries }: { entries: AuditEntry[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded.</p>;
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3 pr-3">
        {entries.map((entry) => {
          const config = getAuditActionConfig(entry.action);
          const Icon = actionIcons[entry.action] || FileText;
          return (
            <div key={entry.id} className="flex gap-3 text-sm">
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.bgColor}`}>
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{config.label}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.actor_name || "System"} · {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm")}
                </p>
                {entry.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5">Reason: {entry.reason}</p>
                )}
                {entry.new_values && entry.action === "payment_recorded" && (
                  <p className="text-xs text-success mt-0.5">
                    {formatCurrency(Number(entry.new_values.amount || 0))} via {entry.new_values.method}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
