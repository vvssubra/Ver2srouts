import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { format } from "date-fns";
import { getEntryTypeConfig, formatCurrency } from "@/lib/finance/constants";

/**
 * Drilldown panel showing all ledger entries linked to a specific invoice.
 * Used in InvoiceDetail to provide subledger-level visibility.
 */
export function LedgerDrilldownPanel({ invoiceId }: { invoiceId: string }) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["ledger-drilldown", invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_ledger")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!invoiceId,
  });

  const entriesWithBalance = (entries || []).reduce<Array<any>>((acc, e) => {
    const prevBalance = acc.length > 0 ? acc[acc.length - 1].running_balance : 0;
    const balance = prevBalance + (e.debit || 0) - (e.credit || 0);
    acc.push({ ...e, running_balance: balance });
    return acc;
  }, []);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Loading ledger entries...</p>;
  }

  if (entriesWithBalance.length === 0) {
    return (
      <div className="py-8 text-center">
        <BookOpen className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No ledger entries linked to this invoice</p>
        <p className="text-xs text-muted-foreground mt-1">Entries appear after the invoice is issued</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {entriesWithBalance.map((entry: any, idx: number) => {
        const config = getEntryTypeConfig(entry.entry_type);

        return (
          <div key={entry.id} className={`flex items-start gap-3 py-3 ${idx > 0 ? "border-t" : ""} ${config.isCompensating ? "bg-destructive/5 -mx-3 px-3 rounded" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${config.color}`}>
                  {config.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {entry.created_at ? format(new Date(entry.created_at), "dd MMM yyyy, HH:mm") : "—"}
                </span>
              </div>
              <p className="text-sm text-foreground">{entry.description || "—"}</p>
              {entry.reference_number && (
                <p className="text-xs text-muted-foreground mt-0.5">Ref: {entry.reference_number}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0 min-w-[160px]">
              <div className="flex items-center justify-end gap-4 text-sm">
                {entry.debit > 0 && (
                  <span className="text-destructive font-medium tabular-nums">DR {formatCurrency(entry.debit)}</span>
                )}
                {entry.credit > 0 && (
                  <span className="text-success font-medium tabular-nums">CR {formatCurrency(entry.credit)}</span>
                )}
              </div>
              <p className={`text-xs font-semibold tabular-nums mt-0.5 ${entry.running_balance > 0 ? "text-destructive" : "text-success"}`}>
                Bal: {formatCurrency(entry.running_balance)} {entry.running_balance > 0 ? "DR" : "CR"}
              </p>
            </div>
          </div>
        );
      })}

      <div className="border-t pt-2 mt-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{entriesWithBalance.length} entries</span>
        <span className="font-bold">
          Net: {formatCurrency(entriesWithBalance[entriesWithBalance.length - 1]?.running_balance || 0)}
          {(entriesWithBalance[entriesWithBalance.length - 1]?.running_balance || 0) > 0 ? " DR" : " CR"}
        </span>
      </div>
    </div>
  );
}
