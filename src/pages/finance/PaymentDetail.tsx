import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CreditCard, FileText, ExternalLink, Plus, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency, PAYMENT_METHODS, getAuditActionConfig } from "@/lib/finance/constants";
import { getPaymentAllocations } from "@/lib/finance/allocation-service";
import { getDisputesForPayment } from "@/lib/finance/dispute-service";
import { AllocationScreen } from "@/components/finance/AllocationScreen";
import { RequestReversalDialog } from "@/components/finance/RequestReversalDialog";
import { ForensicTimeline } from "@/components/finance/ForensicTimeline";
import { GatewayMetadataPanel } from "@/components/finance/GatewayMetadataPanel";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { branches } = useGlobalBranch();
  const activeBranchId = branches[0]?.id;
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [reversalOpen, setReversalOpen] = useState(false);
  const queryClient = useQueryClient();
  const isManager = ["super_admin", "franchisee", "admin"].includes(role || "");

  // Fetch payment
  const { data: payment, isLoading } = useQuery({
    queryKey: ["payment-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch allocations
  const { data: allocations } = useQuery({
    queryKey: ["payment-allocations", id],
    queryFn: () => getPaymentAllocations(id!),
    enabled: !!id,
  });

  // Fetch disputes for this payment
  const { data: disputes } = useQuery({
    queryKey: ["payment-disputes", id],
    queryFn: () => getDisputesForPayment(id!),
    enabled: !!id,
  });

  const hasActiveDispute = (disputes || []).some((d) => ["open", "under_review"].includes(d.status));

  // Fetch invoice details for allocations
  const invoiceIds = useMemo(() => (allocations || []).map((a) => a.invoice_id), [allocations]);
  const { data: invoices } = useQuery({
    queryKey: ["allocation-invoices", invoiceIds],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, amount_paid, status, student_id, students(first_name, last_name)")
        .in("id", invoiceIds);
      return data || [];
    },
    enabled: invoiceIds.length > 0,
  });

  // Fetch audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ["payment-audit", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_audit_logs")
        .select("*")
        .eq("entity_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading || !payment) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  const totalAllocated = (allocations || []).reduce((s, a) => s + Number(a.amount), 0);
  const unallocated = Number(payment.amount) - totalAllocated;
  const isDirectPayment = payment.invoice_id !== null;
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === payment.payment_method)?.label || payment.payment_method;
  const allocationPct = payment.amount > 0 ? Math.round((totalAllocated / Number(payment.amount)) * 100) : 0;

  const invoiceMap = new Map((invoices || []).map((i) => [i.id, i]));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Payment Detail</h1>
            <p className="text-sm text-muted-foreground">
              {payment.payment_reference || payment.id.slice(0, 8)} · {format(new Date(payment.payment_date), "dd MMM yyyy")}
            </p>
          </div>
          {!isDirectPayment && unallocated > 0.01 && isManager && (
            <Button onClick={() => setAllocateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Allocate Funds
            </Button>
          )}
          {Number(payment.amount) > 0 && !hasActiveDispute && (
            <Button onClick={() => setReversalOpen(true)} variant="outline" className="gap-2 text-warning hover:text-warning">
              <ShieldAlert className="h-4 w-4" /> Request Reversal
            </Button>
          )}
        </div>

        {/* Dispute Warning Banner */}
        {hasActiveDispute && (
          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-full bg-warning/10 p-2">
                <ShieldAlert className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-warning">Funds Locked — Active Dispute</p>
                <p className="text-xs text-warning">
                  {(disputes || []).filter((d) => ["open", "under_review"].includes(d.status)).length} active dispute(s) totalling{" "}
                  {formatCurrency((disputes || []).filter((d) => ["open", "under_review"].includes(d.status)).reduce((s, d) => s + Number(d.disputed_amount), 0))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Payment Info */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">Amount</p>
                    <p className="font-bold text-lg mt-1">{formatCurrency(Number(payment.amount))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">Method</p>
                    <p className="font-semibold mt-1">{methodLabel}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">Reference</p>
                    <p className="font-mono font-semibold mt-1">{payment.payment_reference || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider">Date</p>
                    <p className="font-semibold mt-1">{format(new Date(payment.payment_date), "dd MMM yyyy")}</p>
                  </div>
                </div>
                {payment.notes && (
                  <p className="text-sm text-muted-foreground mt-4 italic">"{payment.notes}"</p>
                )}
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="allocations" className="space-y-4">
              <TabsList>
                <TabsTrigger value="allocations">Allocations ({(allocations || []).length})</TabsTrigger>
                <TabsTrigger value="audit">Audit Trail</TabsTrigger>
              </TabsList>

              <TabsContent value="allocations">
                <Card className="overflow-hidden">
                  {isDirectPayment ? (
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      <FileText className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                      <p>This is a direct payment linked to invoice <span className="font-mono font-medium">{payment.invoice_id?.slice(0, 8)}</span></p>
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-2"
                        onClick={() => navigate(`/finance/invoices/${payment.invoice_id}`)}
                      >
                        View Invoice <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </CardContent>
                  ) : (allocations || []).length === 0 ? (
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      <CreditCard className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                      <p>No allocations yet. This payment is fully unallocated.</p>
                      {isManager && (
                        <Button onClick={() => setAllocateOpen(true)} variant="outline" size="sm" className="mt-3 gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Allocate Now
                        </Button>
                      )}
                    </CardContent>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-semibold">Invoice</TableHead>
                          <TableHead className="font-semibold">Student</TableHead>
                          <TableHead className="font-semibold text-right w-[120px]">Invoice Total</TableHead>
                          <TableHead className="font-semibold text-right w-[120px]">Allocated</TableHead>
                          <TableHead className="font-semibold w-[120px]">Date</TableHead>
                          <TableHead className="w-[50px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(allocations || []).map((alloc) => {
                          const inv = invoiceMap.get(alloc.invoice_id);
                          const student = (inv as any)?.students;
                          return (
                            <TableRow key={alloc.id} className="text-sm">
                              <TableCell className="font-mono font-medium">
                                {inv?.invoice_number || alloc.invoice_id.slice(0, 8)}
                              </TableCell>
                              <TableCell>
                                {student ? `${student.first_name} ${student.last_name}` : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {inv ? formatCurrency(inv.total_amount) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-success">
                                {formatCurrency(Number(alloc.amount))}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {format(new Date(alloc.created_at), "dd MMM yy")}
                              </TableCell>
                              <TableCell>
                                {inv && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => navigate(`/finance/invoices/${alloc.invoice_id}`)}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="audit">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Payment Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ForensicTimeline entries={auditLogs || []} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right — Summary */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Allocation Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Payment</span>
                    <span className="font-bold">{formatCurrency(Number(payment.amount))}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span>Allocated</span>
                    <span className="font-semibold">{formatCurrency(totalAllocated)}</span>
                  </div>
                  <Separator />
                  <div className={`flex justify-between font-bold ${unallocated > 0.01 ? "text-warning" : "text-success"}`}>
                    <span>Unallocated</span>
                    <span>{formatCurrency(Math.max(0, unallocated))}</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Allocation Progress</span>
                    <span>{allocationPct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success/30 rounded-full transition-all"
                      style={{ width: `${Math.min(allocationPct, 100)}%` }}
                    />
                  </div>
                </div>

                {isDirectPayment && (
                  <div className="mt-3">
                    <Badge variant="outline" className="text-xs">Direct Payment</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* BillPlz Gateway Metadata */}
            {payment.payment_method === "billplz" && (
              <GatewayMetadataPanel paymentId={payment.id} />
            )}
          </div>
        </div>
      </div>

      {/* Allocation Screen */}
      {payment && !isDirectPayment && activeBranchId && (
        <AllocationScreen
          open={allocateOpen}
          onOpenChange={setAllocateOpen}
          payment={{
            id: payment.id,
            amount: Number(payment.amount),
            allocated: totalAllocated,
            payment_method: payment.payment_method,
            payment_reference: payment.payment_reference,
            branch_id: activeBranchId,
          }}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["payment-detail", id] });
            queryClient.invalidateQueries({ queryKey: ["payment-allocations", id] });
            queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["unallocated-payments"] });
          }}
        />
      )}

      {/* Request Reversal Dialog */}
      {payment && activeBranchId && (
        <RequestReversalDialog
          open={reversalOpen}
          onOpenChange={setReversalOpen}
          payment={{
            id: payment.id,
            amount: Number(payment.amount),
            invoice_id: payment.invoice_id,
            payment_method: payment.payment_method,
            payment_reference: payment.payment_reference,
            branch_id: activeBranchId,
          }}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["payment-detail", id] });
            queryClient.invalidateQueries({ queryKey: ["payment-disputes", id] });
          }}
        />
      )}
    </DashboardLayout>
  );
}
