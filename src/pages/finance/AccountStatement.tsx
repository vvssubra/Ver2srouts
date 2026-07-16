import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { AccountLedgerTable } from "@/components/finance/AccountLedgerTable";
import { AccountSummaryCards } from "@/components/finance/AccountSummaryCards";
import { ForensicTimeline } from "@/components/finance/ForensicTimeline";
import { WalletPanel } from "@/components/finance/WalletPanel";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { formatCurrency } from "@/lib/finance/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Download, Calendar, Info } from "lucide-react";
import { format } from "date-fns";

export default function AccountStatement() {
  const { id: studentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: student } = useQuery({
    queryKey: ["account-student", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("*, branches(name)").eq("id", studentId!).single();
      return data;
    },
    enabled: !!studentId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["account-invoices", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("id, payer_account_id, invoice_number, total_amount, amount_paid, status, due_date, billing_month, billing_year, created_at").eq("student_id", studentId!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!studentId,
  });

  const invoiceIds = useMemo(() => invoices?.map((i) => i.id) || [], [invoices]);
  const payerAccountIds = useMemo(() => {
    const ids = new Set<string>();
    invoices?.forEach((i) => { if (i.payer_account_id) ids.add(i.payer_account_id); });
    return Array.from(ids);
  }, [invoices]);

  const { data: ledgerEntries, isLoading: ledgerLoading } = useQuery({
    queryKey: ["account-ledger", invoiceIds, payerAccountIds, dateFrom, dateTo],
    queryFn: async () => {
      if (invoiceIds.length === 0 && payerAccountIds.length === 0) return [];
      const conditions: string[] = [];
      if (invoiceIds.length > 0) conditions.push(`invoice_id.in.(${invoiceIds.join(",")})`);
      if (payerAccountIds.length > 0) conditions.push(`payer_account_id.in.(${payerAccountIds.join(",")})`);

      let query = supabase.from("billing_ledger").select("*").or(conditions.join(",")).order("created_at", { ascending: true });
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59");

      const { data } = await query;
      const seen = new Set<string>();
      return (data || []).filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    },
    enabled: invoiceIds.length > 0 || payerAccountIds.length > 0,
  });

  const { data: auditEntries } = useQuery({
    queryKey: ["account-audit", invoiceIds],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [];
      const { data } = await supabase.from("billing_audit_logs").select("*").in("entity_id", invoiceIds).order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
    enabled: invoiceIds.length > 0,
  });

  const hasLedgerEntries = (ledgerEntries?.length || 0) > 0;
  const hasInvoices = (invoices?.length || 0) > 0;

  const entriesWithBalance = useMemo(() => {
    if (!ledgerEntries) return [];
    let balance = 0;
    return ledgerEntries.map((e) => { balance += (e.debit || 0) - (e.credit || 0); return { ...e, running_balance: balance }; });
  }, [ledgerEntries]);

  const summary = useMemo(() => {
    if (!ledgerEntries || ledgerEntries.length === 0) {
      // Fallback: compute from invoices directly
      if (!invoices) return { totalBilled: 0, totalPaid: 0, totalCredited: 0, totalRefunded: 0, walletBalance: 0, outstanding: 0 };
      const active = invoices.filter((i: any) => i.status !== "cancelled");
      const totalBilled = active.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const totalPaid = active.reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
      return { totalBilled, totalPaid, totalCredited: 0, totalRefunded: 0, walletBalance: 0, outstanding: Math.max(0, totalBilled - totalPaid) };
    }
    let totalBilled = 0, totalPaid = 0, totalCredited = 0, totalRefunded = 0, walletBalance = 0;
    ledgerEntries.forEach((e) => {
      switch (e.entry_type) {
        case "invoice_issued": totalBilled += e.debit || 0; break;
        case "invoice_cancelled": totalBilled -= e.credit || 0; break;
        case "payment_received": totalPaid += e.credit || 0; break;
        case "payment_reversed": totalPaid -= e.debit || 0; break;
        case "credit_note_issued": case "credit_applied": totalCredited += e.credit || 0; break;
        case "refund": totalRefunded += e.credit || 0; break;
        case "wallet_credit_overpayment": case "wallet_credit_from_overpayment": case "wallet_credit_cn": case "wallet_credit_from_cn": case "wallet_admin_adjustment": case "wallet_adjustment":
          walletBalance += (e.credit || 0) - (e.debit || 0); break;
        case "auto_offset": walletBalance -= e.debit || 0; break;
        case "recovery": totalPaid += e.credit || 0; break;
        case "write_off": totalBilled -= e.credit || 0; break;
      }
    });
    const outstanding = totalBilled - totalPaid - totalCredited - totalRefunded;
    return { totalBilled, totalPaid, totalCredited, totalRefunded, walletBalance, outstanding: Math.max(0, outstanding) };
  }, [ledgerEntries, invoices]);

  const studentName = student ? `${student.first_name} ${student.last_name}` : "Loading...";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/finance/accounts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Account Statement</h1>
            <p className="text-sm text-muted-foreground">
              {studentName}
              {student?.class_name && ` · ${student.class_name}`}
              {(student as any)?.branches?.name && ` · ${(student as any).branches.name}`}
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Download className="h-4 w-4" /> Export Statement
          </Button>
        </div>

        <Card className="bg-muted/30 border-0">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Account Holder</p>
                <p className="font-semibold mt-1">{studentName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Class</p>
                <p className="font-semibold mt-1">{student?.class_name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Branch</p>
                <p className="font-semibold mt-1">{(student as any)?.branches?.name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Statement Date</p>
                <p className="font-semibold mt-1">{format(new Date(), "dd MMM yyyy")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <AccountSummaryCards summary={summary} />

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Date Range:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
            )}
          </div>
        </Card>

        <Tabs defaultValue="ledger" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ledger">Account Ledger</TabsTrigger>
            <TabsTrigger value="invoices">Invoice History</TabsTrigger>
            <TabsTrigger value="wallet">Wallet / Credits</TabsTrigger>
            <TabsTrigger value="forensic">Forensic Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger">
            {!hasLedgerEntries && hasInvoices && (
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Ledger entries are only generated for invoices created after the ledger system was enabled. Historical invoices are shown in the Invoice History tab with summary data computed directly from invoice records.
                </AlertDescription>
              </Alert>
            )}
            <AccountLedgerTable entries={entriesWithBalance} isLoading={ledgerLoading} />
          </TabsContent>

          {/* Invoice History Fallback */}
          <TabsContent value="invoices">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Invoice #</TableHead>
                    <TableHead className="font-semibold">Period</TableHead>
                    <TableHead className="font-semibold">Due Date</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                    <TableHead className="font-semibold text-right">Paid</TableHead>
                    <TableHead className="font-semibold text-right">Balance</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!invoices?.length ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No invoices found</TableCell></TableRow>
                  ) : invoices.map((inv: any) => {
                    const balance = Number(inv.total_amount || 0) - Number(inv.amount_paid || 0);
                    const isCancelled = inv.status === "cancelled";
                    return (
                      <TableRow key={inv.id} className={`cursor-pointer hover:bg-muted/50 ${isCancelled ? "opacity-50 line-through" : ""}`}
                        onClick={() => navigate(`/finance/invoices/${inv.id}`)}>
                        <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">{inv.billing_month}/{inv.billing_year}</TableCell>
                        <TableCell className="text-sm">{inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount || 0)}</TableCell>
                        <TableCell className="text-right text-success">{formatCurrency(inv.amount_paid || 0)}</TableCell>
                        <TableCell className={`text-right font-semibold ${balance > 0 && !isCancelled ? "text-destructive" : ""}`}>{formatCurrency(balance)}</TableCell>
                        <TableCell className="text-center"><InvoiceStatusBadge status={inv.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {invoices && invoices.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
                  <span className="text-muted-foreground">{invoices.length} invoices</span>
                  <div className="flex items-center gap-6">
                    <span>Billed: <span className="font-semibold">{formatCurrency(invoices.filter((i: any) => i.status !== "cancelled").reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0))}</span></span>
                    <span>Paid: <span className="font-semibold text-success">{formatCurrency(invoices.filter((i: any) => i.status !== "cancelled").reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0))}</span></span>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="wallet">
            {payerAccountIds.length > 0 ? (
              <div className="space-y-4">
                {payerAccountIds.map((payerId) => (
                  <WalletPanel key={payerId} payerAccountId={payerId} branchId={(student as any)?.branch_id || ""} />
                ))}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No payer account linked to this student</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="forensic">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Complete Activity History</CardTitle></CardHeader>
              <CardContent><ForensicTimeline entries={auditEntries || []} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}