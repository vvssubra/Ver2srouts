import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { InvoiceSummaryCards } from "@/components/finance/InvoiceSummaryCards";
import { formatCurrency, INVOICE_STATUS_OPTIONS } from "@/lib/finance/constants";
import { issueInvoice } from "@/lib/finance/invoice-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, ChevronLeft, ChevronRight, RefreshCw, Send, Loader2, CalendarDays, List, Users } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { toast } from "sonner";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const PER_PAGE = 15;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function InvoiceList() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"month" | "list">("month");
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const billingMonth = currentMonth.getMonth() + 1;
  const billingYear = currentMonth.getFullYear();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["finance-invoices", activeBranchIds, statusFilter],
    queryFn: async () => {
      if (activeBranchIds.length === 0) return [];
      let query = supabase
        .from("invoices")
        .select("*, students(id, first_name, last_name, class_name)")
        .in("branch_id", activeBranchIds)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: activeBranchIds.length > 0,
  });

  // ── Filtered for search ──
  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((inv: any) => {
      const studentName = `${inv.students?.first_name || ""} ${inv.students?.last_name || ""}`.toLowerCase();
      return inv.invoice_number?.toLowerCase().includes(q) || studentName.includes(q);
    });
  }, [invoices, search]);

  // ── Month view: filter by billing_month/year, group by class ──
  const monthInvoices = useMemo(() => {
    return filtered.filter((inv: any) =>
      inv.billing_month === billingMonth && inv.billing_year === billingYear
    );
  }, [filtered, billingMonth, billingYear]);

  const classGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    monthInvoices.forEach((inv: any) => {
      const cls = inv.students?.class_name || "Unassigned";
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls)!.push(inv);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [monthInvoices]);

  // ── Month summary ──
  const monthSummary = useMemo(() => {
    const active = monthInvoices.filter((i: any) => i.status !== "cancelled");
    return {
      totalBilled: active.reduce((s: number, i: any) => s + (i.total_amount || 0), 0),
      totalCollected: active.reduce((s: number, i: any) => s + (i.amount_paid || 0), 0),
      totalOverdue: active.filter((i: any) => i.status === "overdue").reduce((s: number, i: any) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0),
      totalUnpaid: active.reduce((s: number, i: any) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0),
    };
  }, [monthInvoices]);

  // ── List view pagination ──
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageData = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Overall summary ──
  const summary = useMemo(() => {
    if (!invoices) return { totalBilled: 0, totalCollected: 0, totalOverdue: 0, totalUnpaid: 0 };
    const active = invoices.filter((i: any) => i.status !== "cancelled");
    return {
      totalBilled: active.reduce((s: number, i: any) => s + (i.total_amount || 0), 0),
      totalCollected: active.reduce((s: number, i: any) => s + (i.amount_paid || 0), 0),
      totalOverdue: active.filter((i: any) => i.status === "overdue").reduce((s: number, i: any) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0),
      totalUnpaid: active.reduce((s: number, i: any) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0),
    };
  }, [invoices]);

  const getClassStats = (classInvoices: any[]) => {
    const active = classInvoices.filter((i: any) => i.status !== "cancelled");
    const students = new Set(active.map((i: any) => i.student_id));
    return {
      studentCount: students.size,
      billed: active.reduce((s: number, i: any) => s + (i.total_amount || 0), 0),
      collected: active.reduce((s: number, i: any) => s + (i.amount_paid || 0), 0),
      outstanding: active.reduce((s: number, i: any) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0),
    };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Billing & Receivables</h1>
            <p className="text-sm text-muted-foreground">Invoice management, payments, and financial tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <GenerateRecurringButton />
            <BulkIssueButton invoices={invoices} user={user} queryClient={queryClient} />
            <Button onClick={() => navigate("/finance/invoices/new")} className="gap-2">
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          </div>
        </div>

        <InvoiceSummaryCards data={viewMode === "month" ? monthSummary : summary} />

        {/* Filters + View Toggle */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="month" className="text-xs h-7 gap-1.5"><CalendarDays className="h-3 w-3" /> By Month</TabsTrigger>
                <TabsTrigger value="list" className="text-xs h-7 gap-1.5"><List className="h-3 w-3" /> All Invoices</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice #, student name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* ── BY MONTH VIEW ── */}
        {viewMode === "month" && (
          <div className="space-y-4">
            {/* Month Navigator */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <h2 className="text-lg font-semibold">{MONTHS[billingMonth - 1]} {billingYear}</h2>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            {isLoading ? (
              <Card className="p-12 text-center text-muted-foreground">Loading invoices...</Card>
            ) : classGroups.length === 0 ? (
              <Card className="p-12 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground">No invoices for {MONTHS[billingMonth - 1]} {billingYear}</p>
              </Card>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {classGroups.map(([className, classInvoices]) => {
                  const stats = getClassStats(classInvoices);
                  return (
                    <AccordionItem key={className} value={className} className="border rounded-lg overflow-hidden bg-card">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">{className}</span>
                            <span className="text-xs text-muted-foreground">({stats.studentCount} students · {classInvoices.length} invoices)</span>
                          </div>
                          <div className="ml-auto flex items-center gap-4 mr-4 text-xs">
                            <span className="text-muted-foreground">Billed <span className="font-semibold text-foreground">{formatCurrency(stats.billed)}</span></span>
                            <span className="text-muted-foreground">Collected <span className="font-semibold text-success">{formatCurrency(stats.collected)}</span></span>
                            <span className="text-muted-foreground">Due <span className={`font-semibold ${stats.outstanding > 0 ? "text-red-600" : "text-muted-foreground"}`}>{formatCurrency(stats.outstanding)}</span></span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="font-semibold pl-4">Invoice #</TableHead>
                              <TableHead className="font-semibold">Student</TableHead>
                              <TableHead className="font-semibold">Due Date</TableHead>
                              <TableHead className="font-semibold text-right">Amount</TableHead>
                              <TableHead className="font-semibold text-right">Paid</TableHead>
                              <TableHead className="font-semibold text-right">Balance</TableHead>
                              <TableHead className="font-semibold text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {classInvoices.map((inv: any) => {
                              const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
                              const isCancelled = inv.status === "cancelled";
                              return (
                                <TableRow
                                  key={inv.id}
                                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${isCancelled ? "opacity-50 line-through" : ""}`}
                                  onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                                >
                                  <TableCell className="font-mono text-sm font-medium pl-4">{inv.invoice_number}</TableCell>
                                  <TableCell className="font-medium">
                                    {inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "—"}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount || 0)}</TableCell>
                                  <TableCell className="text-right text-sm text-success">{formatCurrency(inv.amount_paid || 0)}</TableCell>
                                  <TableCell className={`text-right font-semibold ${balance > 0 && !isCancelled ? "text-red-600" : "text-muted-foreground"}`}>
                                    {formatCurrency(balance)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <InvoiceStatusBadge status={inv.status} />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        )}

        {/* ── ALL INVOICES (FLAT LIST) ── */}
        {viewMode === "list" && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Invoice #</TableHead>
                  <TableHead className="font-semibold">Student</TableHead>
                  <TableHead className="font-semibold">Class</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold text-right">Paid</TableHead>
                  <TableHead className="font-semibold text-right">Balance</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading invoices...</TableCell></TableRow>
                ) : pageData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-muted-foreground">No invoices found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageData.map((inv: any) => {
                    const balance = (inv.total_amount || 0) - (inv.amount_paid || 0);
                    return (
                      <TableRow
                        key={inv.id}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${inv.status === "cancelled" ? "opacity-50" : ""}`}
                        onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                      >
                        <TableCell className="font-mono text-sm font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="font-medium">
                          {inv.students ? `${inv.students.first_name} ${inv.students.last_name}` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{inv.students?.class_name || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount || 0)}</TableCell>
                        <TableCell className="text-right text-sm text-success">{formatCurrency(inv.amount_paid || 0)}</TableCell>
                        <TableCell className={`text-right font-semibold ${balance > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {formatCurrency(balance)}
                        </TableCell>
                        <TableCell className="text-center">
                          <InvoiceStatusBadge status={inv.status} />
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
                  Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="h-8 w-8 text-xs" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  ))}
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Generate Recurring Invoices Button ──────────────────────────────────────

function GenerateRecurringButton() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-recurring-invoices");
      if (error) throw error;
      if (data?.message) {
        toast.info(data.message);
      } else {
        toast.success(
          `Generated ${data?.created || 0} draft invoices, ${data?.skipped || 0} skipped. Review and issue them from the list.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate recurring invoices");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generate Recurring
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate monthly invoices?</AlertDialogTitle>
          <AlertDialogDescription>
            This creates <strong>draft</strong> monthly invoices for the current billing month, for every branch that has
            <em> Auto-generate Monthly Invoices </em> turned on in Billing Settings. Students that already have an
            invoice for this month are skipped. Nothing is sent to parents until you issue the drafts.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); handleGenerate(); }} disabled={loading}>
            {loading ? "Generating…" : "Generate drafts"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Bulk Issue All Drafts Button ────────────────────────────────────────────

function BulkIssueButton({ invoices, user, queryClient }: { invoices: any[] | undefined; user: any; queryClient: any }) {
  const [loading, setLoading] = useState(false);

  const drafts = useMemo(
    () => (invoices || []).filter((i: any) => i.status === "draft"),
    [invoices]
  );

  const handleBulkIssue = async () => {
    if (drafts.length === 0) {
      toast.info("No draft invoices to issue");
      return;
    }
    setLoading(true);
    let issued = 0;
    let failed = 0;
    for (const inv of drafts) {
      try {
        await issueInvoice({
          invoiceId: inv.id,
          branchId: inv.branch_id,
          invoiceNumber: inv.invoice_number,
          totalAmount: inv.total_amount,
          payerAccountId: inv.payer_account_id,
          actorId: user?.id || "",
          actorName: user?.email || "",
        });
        issued++;
      } catch {
        failed++;
      }
    }
    toast.success(`Issued ${issued} invoices${failed > 0 ? `, ${failed} failed` : ""}`);
    queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
    setLoading(false);
  };

  if (drafts.length === 0) return null;

  return (
    <Button variant="outline" onClick={handleBulkIssue} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      Issue All Drafts ({drafts.length})
    </Button>
  );
}