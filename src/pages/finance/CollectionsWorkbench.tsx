import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import UnallocatedPayments from "@/pages/finance/UnallocatedPayments";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock, AlertTriangle, Phone, FileText, BarChart3, MessageSquare,
  CalendarClock, Ban, ArrowUpRight, ShieldCheck, CreditCard,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/finance/constants";
import { useApprovalGate } from "@/hooks/use-approval-gate";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import {
  getOverdueInvoicesWithAging,
  computeAgingSummary,
  AGING_BUCKETS,
  getAgingBucketLabel,
  COLLECTION_STATUSES,
  COLLECTION_NOTE_TYPES,
  CONTACT_METHODS,
  WRITE_OFF_REASON_CODES,
  logContactAttempt,
  recordPromiseToPay,
  recordBrokenPromise,
  upsertCollectionStatus,
  executeWriteOff,
  getCollectionNotes,
  type InvoiceWithAging,
  type CollectionStatus,
} from "@/lib/finance/collections-service";

const BUCKET_FILTERS = [
  { value: "all", label: "All Buckets" },
  ...AGING_BUCKETS.map((b) => ({ value: b.key, label: b.label })),
];

export default function CollectionsWorkbench() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gate = useApprovalGate();

  const [collectionTab, setCollectionTab] = useState("workbench");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithAging | null>(null);

  // Dialogs
  const [contactDialog, setContactDialog] = useState(false);
  const [ptpDialog, setPtpDialog] = useState(false);
  const [writeOffDialog, setWriteOffDialog] = useState(false);
  const [notesDialog, setNotesDialog] = useState(false);

  // Form state
  const [contactMethod, setContactMethod] = useState("whatsapp");
  const [contactNotes, setContactNotes] = useState("");
  const [ptpDate, setPtpDate] = useState("");
  const [ptpAmount, setPtpAmount] = useState("");
  const [ptpNotes, setPtpNotes] = useState("");
  const [woReason, setWoReason] = useState("");
  const [woReasonCode, setWoReasonCode] = useState("bad_debt");
  const [woAmount, setWoAmount] = useState("");

  const branchIds = selectedBranch === "all" ? branches.map((b) => b.id) : [selectedBranch];

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["collections-workbench", branchIds],
    queryFn: () => getOverdueInvoicesWithAging(branchIds),
    enabled: branchIds.length > 0,
  });

  // Notes for selected invoice
  const { data: notes = [] } = useQuery({
    queryKey: ["collection-notes", selectedInvoice?.id],
    queryFn: () => getCollectionNotes(selectedInvoice!.id),
    enabled: !!selectedInvoice && notesDialog,
  });

  // Requester profiles for notes
  const noteCreatorIds = [...new Set(notes.map((n: any) => n.created_by))];
  const { data: noteProfiles = [] } = useQuery({
    queryKey: ["profiles-batch", noteCreatorIds],
    queryFn: async () => {
      if (!noteCreatorIds.length) return [];
      const { data } = await supabase
        .from("profiles").select("id, first_name, last_name").in("id", noteCreatorIds);
      return data ?? [];
    },
    enabled: noteCreatorIds.length > 0,
  });
  const profileMap = Object.fromEntries(noteProfiles.map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]));

  const filtered = useMemo(() => {
    let result = invoices;
    if (bucketFilter !== "all") result = result.filter((i) => i.aging_bucket === bucketFilter);
    if (statusFilter !== "all") result = result.filter((i) => i.collection_status === statusFilter);
    return result;
  }, [invoices, bucketFilter, statusFilter]);

  const summary = useMemo(() => computeAgingSummary(filtered), [filtered]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["collections-workbench"] });
    queryClient.invalidateQueries({ queryKey: ["ar-aging"] });
    queryClient.invalidateQueries({ queryKey: ["collection-notes"] });
  };

  // ─── Contact Logging ───────────────────────────────────────────────────────
  const contactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice || !contactNotes.trim()) return;
      await logContactAttempt({
        invoiceId: selectedInvoice.id,
        branchId: selectedInvoice.branch_id,
        contactMethod,
        content: contactNotes.trim(),
        actorId: user!.id,
      });
    },
    onSuccess: () => {
      invalidate();
      setContactDialog(false);
      setContactNotes("");
      toast.success("Contact logged");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Promise to Pay ────────────────────────────────────────────────────────
  const ptpMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice || !ptpDate) return;
      await recordPromiseToPay({
        invoiceId: selectedInvoice.id,
        branchId: selectedInvoice.branch_id,
        promiseDate: ptpDate,
        promiseAmount: parseFloat(ptpAmount) || selectedInvoice.outstanding,
        notes: ptpNotes.trim() || "Promise to pay recorded",
        actorId: user!.id,
      });
    },
    onSuccess: () => {
      invalidate();
      setPtpDialog(false);
      setPtpDate("");
      setPtpAmount("");
      setPtpNotes("");
      toast.success("Promise to pay recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Write-Off ─────────────────────────────────────────────────────────────
  const writeOffMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice || !woReason.trim()) return;
      const amount = parseFloat(woAmount) || selectedInvoice.outstanding;

      // Check approval gate first
      const gateResult = await gate.check({
        branchId: selectedInvoice.branch_id,
        actionType: "write_off",
        amount,
        entityType: "invoice",
        entityId: selectedInvoice.id,
        requestSummary: `Write-off ${formatCurrency(amount)} on ${selectedInvoice.invoice_number}`,
        requestDetails: {
          invoice_id: selectedInvoice.id,
          invoice_number: selectedInvoice.invoice_number,
          student_name: selectedInvoice.student_name,
          reason_code: woReasonCode,
        },
        supportingNotes: woReason.trim(),
        financialImpact: {
          write_off_amount: amount,
          outstanding_before: selectedInvoice.outstanding,
          outstanding_after: selectedInvoice.outstanding - amount,
        },
        requesterId: user!.id,
      });

      if (gateResult === "submitted" || gateResult === "already_pending") {
        return; // Approval needed
      }

      // No approval needed — execute directly
      await executeWriteOff({
        invoiceId: selectedInvoice.id,
        branchId: selectedInvoice.branch_id,
        invoiceNumber: selectedInvoice.invoice_number,
        payerAccountId: selectedInvoice.payer_account_id,
        amount,
        reason: woReason.trim(),
        reasonCode: woReasonCode,
        actorId: user!.id,
        actorName: user!.email ?? "",
      });
      toast.success("Write-off processed");
    },
    onSuccess: () => {
      invalidate();
      setWriteOffDialog(false);
      setWoReason("");
      setWoAmount("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Status update ─────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ invoiceId, branchId, status }: { invoiceId: string; branchId: string; status: string }) => {
      await upsertCollectionStatus({ invoiceId, branchId, collectionStatus: status });
    },
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const getStatusConfig = (status: string) =>
    COLLECTION_STATUSES.find((s) => s.value === status) ?? COLLECTION_STATUSES[0];

  const openAction = (inv: InvoiceWithAging, action: string) => {
    setSelectedInvoice(inv);
    if (action === "contact") { setContactDialog(true); }
    else if (action === "ptp") { setPtpAmount(String(inv.outstanding)); setPtpDialog(true); }
    else if (action === "writeoff") { setWoAmount(String(inv.outstanding)); setWriteOffDialog(true); }
    else if (action === "notes") { setNotesDialog(true); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Collections
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage overdue accounts, track promises, and process write-offs
            </p>
          </div>
          <Tabs value={collectionTab} onValueChange={setCollectionTab}>
            <TabsList>
              <TabsTrigger value="workbench" className="gap-1.5 text-xs"><Clock className="h-3 w-3" /> Workbench</TabsTrigger>
              <TabsTrigger value="unallocated" className="gap-1.5 text-xs"><CreditCard className="h-3 w-3" /> Unallocated</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {collectionTab === "workbench" && (
          <>
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-3 bg-red-50 border-0">
            <p className="text-xs font-medium text-red-800">Total Overdue</p>
            <p className="text-lg font-bold text-red-700">{formatCurrency(summary.total)}</p>
            <p className="text-xs text-red-600">{filtered.length} invoices</p>
          </Card>
          <Card className="p-3 bg-warning/10 border-0">
            <p className="text-xs font-medium text-warning">30+ Days</p>
            <p className="text-lg font-bold text-warning">
              {formatCurrency(summary["31_60"] + summary["61_90"] + summary["90_plus"])}
            </p>
          </Card>
          <Card className="p-3 bg-warning/10 border-0">
            <p className="text-xs font-medium text-warning">Pending PTP</p>
            <p className="text-lg font-bold text-warning">
              {filtered.filter((i) => i.promise_to_pay_date).length}
            </p>
          </Card>
          <Card className="p-3 bg-muted/40 border-0">
            <p className="text-xs font-medium text-muted-foreground">Active Collections</p>
            <p className="text-lg font-bold text-muted-foreground">
              {filtered.filter((i) => ["active", "escalated"].includes(i.collection_status)).length}
            </p>
          </Card>
          <Card className="p-3 bg-success/10 border-0">
            <p className="text-xs font-medium text-success">Needs Follow-Up</p>
            <p className="text-lg font-bold text-success">
              {filtered.filter((i) => {
                if (!i.next_followup_at) return i.days_overdue > 7;
                return new Date(i.next_followup_at) <= new Date();
              }).length}
            </p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={bucketFilter} onValueChange={setBucketFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUCKET_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {COLLECTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Overdue Queue */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-12 text-center">Loading...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm">No overdue invoices found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student / Payer</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PTP</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 100).map((inv) => {
                    const statusCfg = getStatusConfig(inv.collection_status);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/finance/invoices/${inv.id}`)}
                            className="text-sm font-mono font-medium text-primary hover:underline"
                          >
                            {inv.invoice_number}
                          </button>
                          <p className="text-xs text-muted-foreground">Due: {inv.due_date}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{inv.student_name}</p>
                          {inv.payer_name && (
                            <p className="text-xs text-muted-foreground">{inv.payer_name}</p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold text-red-600">
                          {formatCurrency(inv.net_outstanding)}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-bold ${
                            inv.days_overdue > 90 ? "text-red-700" :
                            inv.days_overdue > 30 ? "text-warning" : "text-muted-foreground"
                          }`}>
                            {inv.days_overdue}d
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {getAgingBucketLabel(inv.aging_bucket)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={inv.collection_status}
                            onValueChange={(v) => statusMutation.mutate({
                              invoiceId: inv.id,
                              branchId: inv.branch_id,
                              status: v,
                            })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COLLECTION_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {inv.promise_to_pay_date ? (
                            <div className="text-xs">
                              <p className="font-medium">{inv.promise_to_pay_date}</p>
                              {inv.broken_promise_count > 0 && (
                                <Badge variant="destructive" className="text-[9px] mt-0.5">
                                  {inv.broken_promise_count}× broken
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="Log Contact" onClick={() => openAction(inv, "contact")}>
                              <Phone className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="Promise to Pay" onClick={() => openAction(inv, "ptp")}>
                              <CalendarClock className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              title="View Notes" onClick={() => openAction(inv, "notes")}>
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              title="Write Off" onClick={() => openAction(inv, "writeoff")}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
          </>
        )}

        {collectionTab === "unallocated" && <UnallocatedPayments embedded />}
      </div>

      {/* ─── Contact Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={contactDialog} onOpenChange={setContactDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" /> Log Contact Attempt
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number} — {selectedInvoice?.student_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Contact Method</Label>
              <Select value={contactMethod} onValueChange={setContactMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes *</Label>
              <Textarea value={contactNotes} onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Spoke with parent, they will pay by..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactDialog(false)}>Cancel</Button>
            <Button onClick={() => contactMutation.mutate()} disabled={contactMutation.isPending || !contactNotes.trim()}>
              Log Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Promise to Pay Dialog ───────────────────────────────────────────── */}
      <Dialog open={ptpDialog} onOpenChange={setPtpDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Record Promise to Pay
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number} — Outstanding: {formatCurrency(selectedInvoice?.outstanding ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Promise Date *</Label>
              <Input type="date" value={ptpDate} onChange={(e) => setPtpDate(e.target.value)} />
            </div>
            <div>
              <Label>Promise Amount</Label>
              <Input type="number" value={ptpAmount} onChange={(e) => setPtpAmount(e.target.value)}
                placeholder={String(selectedInvoice?.outstanding ?? 0)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={ptpNotes} onChange={(e) => setPtpNotes(e.target.value)}
                placeholder="Parent promised payment via bank transfer..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPtpDialog(false)}>Cancel</Button>
            <Button onClick={() => ptpMutation.mutate()} disabled={ptpMutation.isPending || !ptpDate}>
              Record PTP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Write-Off Dialog ────────────────────────────────────────────────── */}
      <Dialog open={writeOffDialog} onOpenChange={setWriteOffDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" /> Request Write-Off
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number} — {selectedInvoice?.student_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-warning">Governance Check</p>
                <p className="text-xs text-warning mt-0.5">
                  This action may require approval. The write-off will not finalize until approved.
                </p>
              </div>
            </div>
            <div>
              <Label>Write-Off Amount</Label>
              <Input type="number" value={woAmount} onChange={(e) => setWoAmount(e.target.value)} />
            </div>
            <div>
              <Label>Reason Code</Label>
              <Select value={woReasonCode} onValueChange={setWoReasonCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WRITE_OFF_REASON_CODES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason / Justification *</Label>
              <Textarea value={woReason} onChange={(e) => setWoReason(e.target.value)}
                placeholder="Explain why this debt is being written off..." rows={3} />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-medium">What happens:</p>
              <ul className="text-muted-foreground list-disc list-inside">
                <li>Write-off entry created in the ledger (immutable)</li>
                <li>Invoice history preserved — nothing is deleted</li>
                <li>Recovery can still be recorded if payment later received</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOffDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => writeOffMutation.mutate()}
              disabled={writeOffMutation.isPending || !woReason.trim()}>
              {gate.checking ? "Checking..." : "Submit Write-Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Notes Timeline Dialog ───────────────────────────────────────────── */}
      <Dialog open={notesDialog} onOpenChange={setNotesDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Collection Timeline
            </DialogTitle>
            <DialogDescription>
              {selectedInvoice?.invoice_number} — {selectedInvoice?.student_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {selectedInvoice && (
              <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-muted/50 rounded-lg mb-4">
                <div><span className="text-muted-foreground">Outstanding:</span> <span className="font-bold text-red-600">{formatCurrency(selectedInvoice.outstanding)}</span></div>
                <div><span className="text-muted-foreground">Days Overdue:</span> <span className="font-bold">{selectedInvoice.days_overdue}d</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{getStatusConfig(selectedInvoice.collection_status).label}</span></div>
                {selectedInvoice.promise_to_pay_date && (
                  <div><span className="text-muted-foreground">PTP:</span> <span className="font-medium">{selectedInvoice.promise_to_pay_date}</span></div>
                )}
              </div>
            )}

            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No collection notes yet</p>
            ) : (
              <div className="space-y-3">
                {notes.map((note: any, idx: number) => {
                  const noteType = COLLECTION_NOTE_TYPES.find((t) => t.value === note.note_type);
                  return (
                    <div key={note.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="p-1.5 rounded-full bg-primary/10">
                          <MessageSquare className="h-3 w-3 text-primary" />
                        </div>
                        {idx < notes.length - 1 && <div className="w-px h-full bg-border" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">
                            {noteType?.label ?? note.note_type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(note.created_at), "dd MMM yyyy, HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{note.content}</p>
                        {note.contact_method && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            via {CONTACT_METHODS.find((m) => m.value === note.contact_method)?.label ?? note.contact_method}
                          </p>
                        )}
                        {note.promise_date && (
                          <p className="text-xs text-warning mt-0.5">
                            Promise: {note.promise_date} — {formatCurrency(note.promise_amount || 0)}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          by {profileMap[note.created_by] ?? note.created_by?.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
