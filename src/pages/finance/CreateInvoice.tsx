import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { InvoiceLineItemsEditor, LineItem } from "@/components/finance/InvoiceLineItemsEditor";
import { createInvoice } from "@/lib/billing-service";
import { notifyUsers, getBranchManagerIds } from "@/lib/notify";
import { sendParentEmailForStudent } from "@/lib/parent-email";
import { buildAppUrl } from "@/lib/app-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [branchId, setBranchId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0];
  });
  const [billingMonth, setBillingMonth] = useState(new Date().getMonth() + 1);
  const [billingYear, setBillingYear] = useState(new Date().getFullYear());
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountDesc, setDiscountDesc] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [feesLoaded, setFeesLoaded] = useState(false);

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["create-inv-branches", user?.id],
    queryFn: async () => {
      if (role === "super_admin") {
        const { data } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
        return data || [];
      }
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(id, name)").eq("user_id", user!.id);
      return data?.map((bm: any) => bm.branches).filter(Boolean) || [];
    },
    enabled: !!user,
  });

  // Auto-select single branch
  useEffect(() => {
    if (branches?.length === 1 && !branchId) setBranchId(branches[0].id);
  }, [branches, branchId]);

  // Fetch students for selected branch
  const { data: students } = useQuery({
    queryKey: ["create-inv-students", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_name")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("first_name");
      return data || [];
    },
    enabled: !!branchId,
  });

  // Fetch student's fee packages
  const { data: studentFees } = useQuery({
    queryKey: ["create-inv-fees", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_fees")
        .select("*, fee_packages(id, name, amount, description)")
        .eq("student_id", studentId);
      return data || [];
    },
    enabled: !!studentId,
  });

  // Fetch all branch fee packages for dropdown
  const { data: branchFeePackages } = useQuery({
    queryKey: ["create-inv-branch-fees", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_packages")
        .select("id, name, amount")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!branchId,
  });

  // Auto-populate line items from fees (effect, not useMemo)
  useEffect(() => {
    if (studentFees && studentFees.length > 0 && !feesLoaded) {
      const items: LineItem[] = studentFees.map((sf: any) => ({
        id: crypto.randomUUID(),
        description: sf.fee_packages?.name || "Fee",
        quantity: 1,
        unit_price: sf.effective_amount || sf.fee_packages?.amount || 0,
        total: sf.effective_amount || sf.fee_packages?.amount || 0,
        fee_package_id: sf.fee_package_id,
      }));
      setLineItems(items);
      setFeesLoaded(true);
    }
  }, [studentFees, feesLoaded]);

  const handleStudentChange = (sid: string) => {
    setStudentId(sid);
    setLineItems([]);
    setFeesLoaded(false);
  };

  // Calculations
  const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal - discountAmount + taxAmount;

  const handleSave = async (issueImmediately: boolean) => {
    if (submittingRef.current) return;
    if (!branchId) { toast.error("Please select a branch"); return; }
    if (!studentId) { toast.error("Please select a student"); return; }
    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }
    if (lineItems.some((i) => !i.description || i.total <= 0)) {
      toast.error("All line items must have a description and positive amount");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const result = await createInvoice({
        branchId,
        studentId,
        dueDate,
        billingMonth,
        billingYear,
        notes: notes || null,
        subtotal,
        discountAmount,
        discountDescription: discountDesc || null,
        taxRate,
        taxAmount,
        totalAmount,
        lineItems: lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          total: li.total,
          fee_package_id: li.fee_package_id || null,
        })),
        issueImmediately,
        actorId: user?.id || "",
        actorName: user?.email || "",
      });

      toast.success(`Invoice ${result.invoiceNumber} ${issueImmediately ? "issued" : "saved as draft"}`);

      // Fire-and-forget notifications for issued invoices
      if (issueImmediately) {
        const studentName = students?.find((s: any) => s.id === studentId)?.first_name || "Student";
        // Notify branch managers
        getBranchManagerIds(branchId).then((mgrIds) => {
          notifyUsers(mgrIds, "Invoice Created", `Invoice ${result.invoiceNumber} issued for ${studentName} — RM ${totalAmount.toFixed(2)}`, "invoice", result.id, `/finance/invoices/${result.id}`);
        });
        // Notify parent
        supabase.from("parent_students").select("parent_id").eq("student_id", studentId).then(({ data: links }) => {
          if (links?.length) {
            const parentIds = [...new Set(links.map((l: any) => l.parent_id))];
            notifyUsers(parentIds, "New Invoice Issued", `Invoice ${result.invoiceNumber} for RM ${totalAmount.toFixed(2)} has been issued.`, "billing", result.id, "/parent-fees", `invoice:${result.id}`, "high");
          }
        });
        // Parent email is sent by the DB trigger `notify_invoice_issued`
        // (idempotent on invoice id). Do NOT also send from the client —
        // that previously caused two `invoice-issued` rows per invoice.
      }

      navigate(`/finance/invoices/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create invoice");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/finance/invoices")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Invoice</h1>
            <p className="text-sm text-muted-foreground">Generate a new invoice for a student</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Branch *</Label>
                    <Select value={branchId} onValueChange={(v) => { setBranchId(v); setStudentId(""); setLineItems([]); setFeesLoaded(false); }}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {branches?.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Student *</Label>
                    <Select value={studentId} onValueChange={handleStudentChange} disabled={!branchId}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {students?.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.first_name} {s.last_name} {s.class_name && `(${s.class_name})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Billing Month</Label>
                    <Select value={String(billingMonth)} onValueChange={(v) => setBillingMonth(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {new Date(2000, i).toLocaleString("en", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select value={String(billingYear)} onValueChange={(v) => setBillingYear(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[billingYear - 1, billingYear, billingYear + 1].map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional invoice notes..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Fee Items</CardTitle></CardHeader>
              <CardContent>
                <InvoiceLineItemsEditor items={lineItems} onChange={setLineItems} availableFeePackages={branchFeePackages} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Adjustments</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discount (RM)</Label>
                    <Input type="number" step="0.01" min="0" value={discountAmount} onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Description</Label>
                    <Input value={discountDesc} onChange={(e) => setDiscountDesc(e.target.value)} placeholder="e.g. Sibling discount" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tax Rate (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6">
              <CardHeader className="pb-3"><CardTitle className="text-base">Invoice Preview</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal ({lineItems.length} items)</span>
                    <span>RM {subtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-success">
                      <span>Discount</span>
                      <span>- RM {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                      <span>RM {taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>RM {totalAmount.toFixed(2)}</span>
                </div>

                <div className="space-y-2 pt-4">
                  <Button onClick={() => handleSave(true)} className="w-full gap-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Issue Invoice
                  </Button>
                  <Button onClick={() => handleSave(false)} variant="outline" className="w-full gap-2" disabled={loading}>
                    <Save className="h-4 w-4" /> Save as Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
