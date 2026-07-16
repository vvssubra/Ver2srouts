import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, ShieldCheck, GitBranch } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ApprovalSettingsCard() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";
  const [selectedBranch, setSelectedBranch] = useState<string>("global");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-approval-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").order("name");
      return data ?? [];
    },
    enabled: isSuperAdmin,
  });

  const branchIdParam = selectedBranch === "global" ? null : selectedBranch;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["approval-settings", selectedBranch],
    queryFn: async () => {
      let query = supabase.from("approval_settings").select("*");
      if (branchIdParam) {
        query = query.eq("branch_id", branchIdParam);
      } else {
        query = query.is("branch_id", null);
      }
      const { data } = await query.maybeSingle();
      return data;
    },
    enabled: isSuperAdmin,
  });

  const [form, setForm] = useState<any>(null);
  const [formInit, setFormInit] = useState<string | null>(null);

  // Sync form from settings
  if (settings && formInit !== selectedBranch) {
    setForm({
      claims_l2_enabled: settings.claims_l2_enabled,
      claims_l2_threshold: settings.claims_l2_threshold,
      leave_l2_enabled: settings.leave_l2_enabled,
      ot_l2_enabled: settings.ot_l2_enabled,
      use_reports_to: settings.use_reports_to,
      payroll_l2_enabled: settings.payroll_l2_enabled ?? false,
    });
    setFormInit(selectedBranch);
  } else if (!settings && !isLoading && formInit !== selectedBranch) {
    // No branch override exists yet — show global defaults for reference
    setForm({
      claims_l2_enabled: true,
      claims_l2_threshold: 500,
      leave_l2_enabled: false,
      ot_l2_enabled: false,
      use_reports_to: true,
      payroll_l2_enabled: false,
    });
    setFormInit(selectedBranch);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const payload: any = {
        claims_l2_enabled: form.claims_l2_enabled,
        claims_l2_threshold: parseFloat(form.claims_l2_threshold) || 500,
        leave_l2_enabled: form.leave_l2_enabled,
        ot_l2_enabled: form.ot_l2_enabled,
        use_reports_to: form.use_reports_to,
        payroll_l2_enabled: form.payroll_l2_enabled,
        updated_at: new Date().toISOString(),
      };

      if (settings) {
        // Update existing
        const { error } = await supabase.from("approval_settings").update(payload).eq("id", settings.id);
        if (error) throw error;
      } else if (branchIdParam) {
        // Create branch override
        payload.branch_id = branchIdParam;
        const { error } = await supabase.from("approval_settings").insert(payload);
        if (error) throw error;
      } else {
        // Should not happen — global always exists
        throw new Error("Global settings should already exist");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-settings"] });
      toast({ title: "Approval settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBranchOverride = useMutation({
    mutationFn: async () => {
      if (!settings || !branchIdParam) return;
      const { error } = await supabase.from("approval_settings").delete().eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-settings"] });
      setFormInit(null);
      toast({ title: "Branch override removed — using global defaults" });
    },
  });

  if (!isSuperAdmin) return null;

  const set = (key: string, value: any) => setForm((prev: any) => ({ ...prev, [key]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Approval Workflow Settings
        </CardTitle>
        <CardDescription>Configure L1/L2 approval requirements and routing hierarchy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scope selector */}
        <div className="flex items-center gap-4">
          <div className="space-y-1.5 flex-1">
            <Label>Configuration Scope</Label>
            <Select value={selectedBranch} onValueChange={(v) => { setSelectedBranch(v); setFormInit(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">🌐 Global Default</SelectItem>
                {branches.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    <GitBranch className="h-3 w-3 inline mr-1" />{b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedBranch !== "global" && (
            <Badge variant={settings?.branch_id ? "default" : "outline"} className="mt-6">
              {settings?.branch_id ? "Custom Override" : "Using Global Default"}
            </Badge>
          )}
        </div>

        {isLoading || !form ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Separator />

            {/* L1 Routing */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">L1 Approver Routing</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Use "Reports To" hierarchy</Label>
                  <p className="text-xs text-muted-foreground">
                    If enabled, L1 approval routes to the staff's direct supervisor first. Falls back to any branch manager if no supervisor is set.
                  </p>
                </div>
                <Switch checked={form.use_reports_to} onCheckedChange={(v) => set("use_reports_to", v)} />
              </div>
            </div>

            <Separator />

            {/* Claims L2 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Claims Approval</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require L2 (Super Admin) approval</Label>
                  <p className="text-xs text-muted-foreground">Claims above the threshold require final Super Admin approval</p>
                </div>
                <Switch checked={form.claims_l2_enabled} onCheckedChange={(v) => set("claims_l2_enabled", v)} />
              </div>
              {form.claims_l2_enabled && (
                <div className="flex items-center gap-3 ml-4">
                  <Label className="text-sm whitespace-nowrap">Threshold (RM)</Label>
                  <Input
                    type="number"
                    className="w-32"
                    value={form.claims_l2_threshold}
                    onChange={(e) => set("claims_l2_threshold", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Claims ≤ this amount auto-approve after L1</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Leave L2 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Leave Approval</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require L2 (Super Admin) approval</Label>
                  <p className="text-xs text-muted-foreground">If disabled, leave is fully approved after L1</p>
                </div>
                <Switch checked={form.leave_l2_enabled} onCheckedChange={(v) => set("leave_l2_enabled", v)} />
              </div>
            </div>

            <Separator />

            {/* OT L2 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Overtime Approval</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require L2 (Super Admin) approval</Label>
                  <p className="text-xs text-muted-foreground">If disabled, OT is approved after L1 only</p>
                </div>
                <Switch checked={form.ot_l2_enabled} onCheckedChange={(v) => set("ot_l2_enabled", v)} />
              </div>
            </div>

            <Separator />

            {/* Payroll Approval */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Payroll Approval</h3>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require approval before confirming payroll</Label>
                  <p className="text-xs text-muted-foreground">If enabled, payroll must be submitted for Super Admin approval before it can be marked as paid</p>
                </div>
                <Switch checked={form.payroll_l2_enabled} onCheckedChange={(v) => set("payroll_l2_enabled", v)} />
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {selectedBranch !== "global" && !settings?.branch_id ? "Create Branch Override" : "Save Settings"}
              </Button>
              {selectedBranch !== "global" && settings?.branch_id && (
                <Button variant="outline" onClick={() => deleteBranchOverride.mutate()} disabled={deleteBranchOverride.isPending}>
                  Reset to Global
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
