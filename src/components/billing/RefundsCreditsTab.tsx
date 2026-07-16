import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowDownLeft, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toastError } from "@/lib/error-messages";
import { format } from "date-fns";

const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;

const TYPE_COLORS: Record<string, string> = {
  refund: "bg-destructive/15 text-destructive",
  withdrawal: "bg-muted text-muted-foreground",
  discount: "bg-primary/15 text-primary",
  credit: "bg-accent/15 text-accent-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  processed: "bg-green-100 text-green-800",
};

export default function RefundsCreditsTab({ branchId, canManage }: { branchId: string; canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [cnType, setCnType] = useState("refund");
  const [cnStudent, setCnStudent] = useState("");
  const [cnInvoice, setCnInvoice] = useState("");
  const [cnAmount, setCnAmount] = useState("");
  const [cnReason, setCnReason] = useState("");

  const { data: creditNotes } = useQuery({
    queryKey: ["credit-notes", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_notes")
        .select("*, students(first_name, last_name), invoices(invoice_number)")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: students } = useQuery({
    queryKey: ["billing-students", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name").eq("branch_id", branchId).eq("is_active", true).order("first_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: invoices } = useQuery({
    queryKey: ["cn-invoices", branchId, cnStudent],
    queryFn: async () => {
      let q = supabase.from("invoices").select("id, invoice_number, total_amount, amount_paid, status, billing_month, billing_year").eq("branch_id", branchId);
      if (cnStudent) q = q.eq("student_id", cnStudent);
      const { data } = await q.order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const activeInvoices = (invoices ?? []).filter((inv: any) => inv.status !== "cancelled");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: cnNum } = await supabase.rpc("generate_credit_note_number");
      const { error } = await supabase.from("credit_notes").insert({
        branch_id: branchId,
        student_id: cnStudent,
        invoice_id: cnInvoice || null,
        type: cnType,
        amount: parseFloat(cnAmount),
        reason: cnReason || null,
        created_by: user!.id,
        credit_note_number: cnNum,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      setShowDialog(false);
      setCnStudent("");
      setCnInvoice("");
      setCnAmount("");
      setCnReason("");
      toast({ title: "Credit note created" });
    },
    onError: (e: any) => toastError(e),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "processed" }) => {
      const update: any = { status: action };
      if (action === "approved") update.approved_by = user!.id;
      if (action === "processed") update.processed_at = new Date().toISOString();
      const { error } = await supabase.from("credit_notes").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast({ title: "Credit note updated" });
    },
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Issue Credit Note
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" /> Credit Notes & Refunds
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!creditNotes?.length ? (
            <p className="text-center py-8 text-muted-foreground">No credit notes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CN #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditNotes.map((cn: any) => (
                    <TableRow key={cn.id}>
                      <TableCell className="font-mono text-sm">{cn.credit_note_number}</TableCell>
                      <TableCell>{format(new Date(cn.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>{cn.students?.first_name} {cn.students?.last_name}</TableCell>
                      <TableCell><Badge className={TYPE_COLORS[cn.type] ?? ""}>{cn.type}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{cn.invoices?.invoice_number ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{rm(cn.amount)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{cn.reason || "—"}</TableCell>
                      <TableCell><Badge className={STATUS_COLORS[cn.status] ?? ""}>{cn.status}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            {cn.status === "pending" && (
                              <Button size="sm" variant="outline" onClick={() => approveMutation.mutate({ id: cn.id, action: "approved" })}>
                                Approve
                              </Button>
                            )}
                            {cn.status === "approved" && (
                              <Button size="sm" variant="outline" onClick={() => approveMutation.mutate({ id: cn.id, action: "processed" })}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Process
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Credit Note Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Credit Note</DialogTitle>
            <DialogDescription>Create a refund, withdrawal, or discount credit note</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={cnType} onValueChange={setCnType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refund">Refund</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  <SelectItem value="discount">Discount</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={cnStudent} onValueChange={setCnStudent}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Invoice (optional)</Label>
              <Select value={cnInvoice || "none"} onValueChange={(v) => setCnInvoice(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {activeInvoices?.map((inv: any) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs">{inv.invoice_number}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs">{MONTH_NAMES[inv.billing_month]} {inv.billing_year}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs font-medium">{rm(inv.total_amount)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className={`text-xs capitalize ${inv.status === "paid" ? "text-green-600" : inv.status === "overdue" ? "text-destructive" : ""}`}>{inv.status}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (RM)</Label>
              <Input type="number" value={cnAmount} onChange={e => setCnAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea placeholder="Reason for credit note" value={cnReason} onChange={e => setCnReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!cnStudent || !cnAmount || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Credit Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
