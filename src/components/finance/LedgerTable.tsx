import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { getEntryTypeConfig, formatCurrency } from "@/lib/finance/constants";

const PER_PAGE = 20;

interface LedgerEntry {
  id: string;
  created_at: string;
  entry_type: string;
  description: string | null;
  reference_number: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

interface Props {
  entries: LedgerEntry[];
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

export function LedgerTable({ entries, isLoading, page, onPageChange }: Props) {
  const totalPages = Math.ceil(entries.length / PER_PAGE);
  const pageData = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-semibold w-[140px]">Date</TableHead>
            <TableHead className="font-semibold w-[150px]">Type</TableHead>
            <TableHead className="font-semibold">Description</TableHead>
            <TableHead className="font-semibold w-[100px]">Reference</TableHead>
            <TableHead className="font-semibold text-right w-[110px]">Debit</TableHead>
            <TableHead className="font-semibold text-right w-[110px]">Credit</TableHead>
            <TableHead className="font-semibold text-right w-[120px]">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading ledger...</TableCell></TableRow>
          ) : pageData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground">No ledger entries found</p>
              </TableCell>
            </TableRow>
          ) : (
            pageData.map((entry) => {
              const config = getEntryTypeConfig(entry.entry_type);
              return (
                <TableRow key={entry.id} className={`text-sm ${config.isCompensating ? "bg-destructive/5" : ""}`}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${config.color}`}>
                      {config.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">{entry.description || "—"}</TableCell>
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
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
          <p className="text-sm text-muted-foreground">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, entries.length)} of {entries.length}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
