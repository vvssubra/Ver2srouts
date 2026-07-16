import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { getEntryTypeConfig, formatCurrency } from "@/lib/finance/constants";

interface LedgerEntry {
  id: string;
  created_at: string | null;
  entry_type: string;
  description: string | null;
  reference_number: string | null;
  debit: number;
  credit: number;
  invoice_id: string | null;
  payment_id: string | null;
  running_balance: number;
}

interface Props {
  entries: LedgerEntry[];
  isLoading: boolean;
}

export function AccountLedgerTable({ entries, isLoading }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-semibold w-[140px]">Date</TableHead>
            <TableHead className="font-semibold w-[150px]">Type</TableHead>
            <TableHead className="font-semibold">Description</TableHead>
            <TableHead className="font-semibold w-[100px]">Reference</TableHead>
            <TableHead className="font-semibold text-right w-[110px]">Debit (DR)</TableHead>
            <TableHead className="font-semibold text-right w-[110px]">Credit (CR)</TableHead>
            <TableHead className="font-semibold text-right w-[120px]">Balance</TableHead>
            <TableHead className="font-semibold w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading ledger...</TableCell></TableRow>
          ) : entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground">No ledger entries for this account</p>
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const config = getEntryTypeConfig(entry.entry_type);

              return (
                <TableRow key={entry.id} className={`text-sm ${config.isCompensating ? "bg-destructive/5" : ""}`}>
                  <TableCell className="text-muted-foreground text-xs">
                    {entry.created_at ? format(new Date(entry.created_at), "dd MMM yyyy HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${config.color}`}>
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[280px] truncate">{entry.description || "—"}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{entry.reference_number || "—"}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${entry.debit > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${entry.credit > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                  </TableCell>
                  <TableCell className={`text-right font-semibold tabular-nums ${entry.running_balance > 0 ? "text-destructive" : entry.running_balance < 0 ? "text-success" : ""}`}>
                    {formatCurrency(entry.running_balance)}
                    {entry.running_balance < 0 ? " CR" : entry.running_balance > 0 ? " DR" : ""}
                  </TableCell>
                  <TableCell>
                    {entry.invoice_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="View Invoice"
                        onClick={(e) => { e.stopPropagation(); navigate(`/finance/invoices/${entry.invoice_id}`); }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {entries.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
          <span className="text-muted-foreground">{entries.length} entries</span>
          <div className="flex items-center gap-6">
            <span>Total DR: <span className="font-semibold text-destructive">{formatCurrency(entries.reduce((s, e) => s + (e.debit || 0), 0))}</span></span>
            <span>Total CR: <span className="font-semibold text-success">{formatCurrency(entries.reduce((s, e) => s + (e.credit || 0), 0))}</span></span>
            <span className="font-bold">
              Net: {formatCurrency(entries[entries.length - 1]?.running_balance || 0)}
              {(entries[entries.length - 1]?.running_balance || 0) > 0 ? " DR" : " CR"}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
