import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, Settings, FileText, Bell, CreditCard, Percent, Shield, Activity, ArrowRightLeft } from "lucide-react";
import ApprovalRules from "@/pages/finance/ApprovalRules";
import GatewayEventsLog from "@/pages/finance/GatewayEventsLog";
import ReconciliationDashboard from "@/pages/finance/ReconciliationDashboard";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const REMINDER_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

const NUMBERING_FORMATS = [
  { value: "YYYYMM-SEQ", label: "INV-202603-0001" },
  { value: "YYYY-SEQ", label: "INV-2026-0001" },
  { value: "SEQ", label: "INV-0001" },
];

const ALL_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "billplz", label: "BillPlz (FPX)" },
  { value: "online", label: "Online Payment" },
];

type BillingConfig = {
  id?: string;
  branch_id: string;
  invoice_prefix: string;
  invoice_numbering: string;
  due_date_days: number;
  grace_period_days: number;
  auto_generate_monthly_invoices: boolean;
  late_fee_enabled: boolean;
  late_fee_type: string;
  late_fee_amount: number;
  late_fee_max: number | null;
  reminder_enabled: boolean;
  reminder_days_before_due: number[];
  reminder_days_after_due: number[];
  reminder_channel: string;
  payment_methods_enabled: string[];
  billplz_enabled: boolean;
  tax_enabled: boolean;
  tax_label: string;
  tax_rate: number;
  tax_registration_no: string | null;
  receipt_template: any;
  invoice_template: any;
  reminder_template: any;
  credit_note_template: any;
  statement_template: any;
};

const defaults = (branchId: string): BillingConfig => ({
  branch_id: branchId,
  invoice_prefix: "INV",
  invoice_numbering: "YYYYMM-SEQ",
  due_date_days: 15,
  grace_period_days: 7,
  auto_generate_monthly_invoices: false,
  late_fee_enabled: false,
  late_fee_type: "fixed",
  late_fee_amount: 0,
  late_fee_max: null,
  reminder_enabled: true,
  reminder_days_before_due: [7, 3, 1],
  reminder_days_after_due: [1, 7, 14, 30],
  reminder_channel: "whatsapp",
  payment_methods_enabled: ["cash", "bank_transfer", "cheque", "billplz"],
  billplz_enabled: true,
  tax_enabled: false,
  tax_label: "SST",
  tax_rate: 0,
  tax_registration_no: null,
  receipt_template: null,
  invoice_template: null,
  reminder_template: null,
  credit_note_template: null,
  statement_template: null,
});

export default function BillingSettings() {
  const { role } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const queryClient = useQueryClient();
  const branchId = selectedBranch;


  const { data: config, isLoading } = useQuery({
    queryKey: ["billing-config", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_config")
        .select("*")
        .eq("branch_id", branchId!)
        .maybeSingle();
      return (data as BillingConfig | null) ?? defaults(branchId!);
    },
    enabled: !!branchId,
  });

  const [form, setForm] = useState<BillingConfig | null>(null);

  useEffect(() => {
    if (config) setForm({ ...config, branch_id: branchId! });
  }, [config, branchId]);

  const saveMutation = useMutation({
    mutationFn: async (cfg: BillingConfig) => {
      const payload = { ...cfg };
      delete (payload as any).id;
      if ((config as any)?.id) {
        await supabase.from("billing_config").update(payload).eq("branch_id", branchId!);
      } else {
        await supabase.from("billing_config").insert(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-config"] });
      toast({ title: "Settings saved", description: "Billing configuration updated." });
    },
  });

  const upd = <K extends keyof BillingConfig>(key: K, value: BillingConfig[K]) =>
    setForm((f) => f ? { ...f, [key]: value } : f);

  const toggleMethod = (method: string) => {
    if (!form) return;
    const current = form.payment_methods_enabled;
    upd("payment_methods_enabled", current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method]);
  };

  if (!branchId || !form) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <p className="text-muted-foreground">Select a branch to configure billing settings.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Billing Configuration</h1>
            <p className="text-sm text-muted-foreground">Branch-level billing rules and template settings</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-1.5">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </div>

        <Tabs defaultValue="invoicing">
          <TabsList className="flex-wrap">
            <TabsTrigger value="invoicing" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Invoicing</TabsTrigger>
            <TabsTrigger value="payments" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payments</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Reminders</TabsTrigger>
            <TabsTrigger value="tax" className="gap-1.5"><Percent className="h-3.5 w-3.5" /> Tax</TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Templates</TabsTrigger>
            <TabsTrigger value="approval-rules" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Approval Rules</TabsTrigger>
            <TabsTrigger value="gateway" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Gateway</TabsTrigger>
            <TabsTrigger value="reconciliation" className="gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Reconciliation</TabsTrigger>
          </TabsList>

          {/* Invoicing Tab */}
          <TabsContent value="invoicing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invoice Numbering</CardTitle>
                <CardDescription>Configure how invoice numbers are generated</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Prefix</Label>
                    <Input value={form.invoice_prefix} onChange={(e) => upd("invoice_prefix", e.target.value)} placeholder="INV" />
                  </div>
                  <div className="space-y-2">
                    <Label>Numbering Format</Label>
                    <Select value={form.invoice_numbering} onValueChange={(v) => upd("invoice_numbering", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NUMBERING_FORMATS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    Preview: {form.invoice_prefix}-202603-0001
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Due Date & Grace Period</CardTitle>
                <CardDescription>Default payment terms for generated invoices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date (days after issue)</Label>
                    <Input type="number" value={form.due_date_days} onChange={(e) => upd("due_date_days", parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Grace Period (days after due)</Label>
                    <Input type="number" value={form.grace_period_days} onChange={(e) => upd("grace_period_days", parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Auto-generate Monthly Invoices</CardTitle>
                    <CardDescription>
                      When on, the system creates monthly invoices for this branch on the 1st of every month.
                      Invoices are created as <strong>Draft</strong> — finance staff must review and issue them before parents are notified.
                    </CardDescription>
                  </div>
                  <Switch
                    checked={form.auto_generate_monthly_invoices}
                    onCheckedChange={(v) => upd("auto_generate_monthly_invoices", v)}
                  />
                </div>
              </CardHeader>
              {form.auto_generate_monthly_invoices && (
                <CardContent>
                  <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                    Scheduled to run monthly at 02:00 on the 1st. Only students with active monthly fee packages in this branch are billed.
                    Existing invoices for the same billing month are never duplicated.
                  </div>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Late Fees</CardTitle>
                    <CardDescription>Automatically apply late fees after grace period</CardDescription>
                  </div>
                  <Switch checked={form.late_fee_enabled} onCheckedChange={(v) => upd("late_fee_enabled", v)} />
                </div>
              </CardHeader>
              {form.late_fee_enabled && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Fee Type</Label>
                      <Select value={form.late_fee_type} onValueChange={(v) => upd("late_fee_type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Amount (RM)</SelectItem>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{form.late_fee_type === "fixed" ? "Amount (RM)" : "Rate (%)"}</Label>
                      <Input type="number" step="0.01" value={form.late_fee_amount} onChange={(e) => upd("late_fee_amount", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Maximum Cap (RM)</Label>
                      <Input type="number" step="0.01" value={form.late_fee_max ?? ""} onChange={(e) => upd("late_fee_max", e.target.value ? parseFloat(e.target.value) : null)} placeholder="No cap" />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accepted Payment Methods</CardTitle>
                <CardDescription>Enable or disable payment methods for this branch</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ALL_METHODS.map((m) => (
                    <div key={m.value} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{m.label}</p>
                      </div>
                      <Switch
                        checked={form.payment_methods_enabled.includes(m.value)}
                        onCheckedChange={() => toggleMethod(m.value)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">BillPlz Integration</CardTitle>
                    <CardDescription>Enable FPX online payments via BillPlz</CardDescription>
                  </div>
                  <Switch checked={form.billplz_enabled} onCheckedChange={(v) => upd("billplz_enabled", v)} />
                </div>
              </CardHeader>
              {form.billplz_enabled && (
                <CardContent>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">BillPlz is configured at the system level. Contact your administrator to update API keys.</p>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Reminders Tab */}
          <TabsContent value="reminders" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Payment Reminders</CardTitle>
                    <CardDescription>Automated reminder schedule for overdue invoices</CardDescription>
                  </div>
                  <Switch checked={form.reminder_enabled} onCheckedChange={(v) => upd("reminder_enabled", v)} />
                </div>
              </CardHeader>
              {form.reminder_enabled && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Preferred Channel</Label>
                    <Select value={form.reminder_channel} onValueChange={(v) => upd("reminder_channel", v)}>
                      <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REMINDER_CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Before Due Date</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {form.reminder_days_before_due.map((d, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{d} day{d > 1 ? "s" : ""} before</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">After Due Date</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {form.reminder_days_after_due.map((d, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{d} day{d > 1 ? "s" : ""} after</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Tax Tab */}
          <TabsContent value="tax" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Tax Configuration</CardTitle>
                    <CardDescription>Configure tax rules for invoices issued by this branch</CardDescription>
                  </div>
                  <Switch checked={form.tax_enabled} onCheckedChange={(v) => upd("tax_enabled", v)} />
                </div>
              </CardHeader>
              {form.tax_enabled && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Tax Label</Label>
                      <Input value={form.tax_label} onChange={(e) => upd("tax_label", e.target.value)} placeholder="SST" />
                    </div>
                    <div className="space-y-2">
                      <Label>Tax Rate (%)</Label>
                      <Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => upd("tax_rate", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration No.</Label>
                      <Input value={form.tax_registration_no ?? ""} onChange={(e) => upd("tax_registration_no", e.target.value || null)} placeholder="Optional" />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            {[
              { key: "invoice_template" as const, label: "Invoice Template", desc: "Customize the invoice document layout" },
              { key: "receipt_template" as const, label: "Receipt Template", desc: "Customize payment receipt format" },
              { key: "reminder_template" as const, label: "Reminder Template", desc: "Customize payment reminder messages" },
              { key: "credit_note_template" as const, label: "Credit Note Template", desc: "Customize credit note format" },
              { key: "statement_template" as const, label: "Statement Template", desc: "Customize account statement layout" },
            ].map((t) => (
              <Card key={t.key}>
                <CardHeader>
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <CardDescription>{t.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    rows={4}
                    placeholder={`Enter custom ${t.label.toLowerCase()} content or leave blank for default...`}
                    value={typeof form[t.key] === "string" ? form[t.key] : form[t.key] ? JSON.stringify(form[t.key], null, 2) : ""}
                    onChange={(e) => upd(t.key, e.target.value || null)}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Supports placeholders: {"{{student_name}}"}, {"{{invoice_number}}"}, {"{{amount}}"}, {"{{due_date}}"}, {"{{branch_name}}"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="approval-rules">
            <ApprovalRules embedded />
          </TabsContent>
          <TabsContent value="gateway">
            <GatewayEventsLog embedded />
          </TabsContent>
          <TabsContent value="reconciliation">
            <ReconciliationDashboard embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
