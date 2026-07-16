import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getPricingAuditLog, migrateStudentFeesToProfiles } from "@/lib/finance/pricing-service";
import FeePackagesTab from "@/components/billing/FeePackagesTab";
import BillingProfileList from "@/components/finance/BillingProfileList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Package, Users, TrendingUp, Shield, ArrowRightLeft, Loader2 } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const actionLabels: Record<string, string> = {
  version_added: "Rate Changed",
  created: "Created",
  item_added: "Item Added",
  deactivated: "Deactivated",
  updated: "Updated",
  discount_changed: "Discount Changed",
};

export default function PricingRules() {
  const { user, role } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("catalog");

  const branchId = selectedBranch;
  const canManage = role === "super_admin" || role === "franchisee" || role === "admin";

  // Rate changes (upcoming + recent)
  const { data: rateChanges = [] } = useQuery({
    queryKey: ["rate-changes", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_package_versions" as any)
        .select(`
          *,
          fee_packages:fee_package_id(id, name, branch_id)
        `)
        .order("effective_from", { ascending: false })
        .limit(50);
      const filtered = (data ?? []).filter((v: any) => !branchId || v.fee_packages?.branch_id === branchId);
      return filtered;
    },
    enabled: !!branchId || branches.length > 0,
  });

  // Audit log
  const { data: auditLog = [] } = useQuery({
    queryKey: ["pricing-audit", branchId],
    queryFn: () => getPricingAuditLog(branchId),
    enabled: !!branchId && activeTab === "audit",
  });

  // Migration utility
  const migrateMutation = useMutation({
    mutationFn: () => migrateStudentFeesToProfiles(branchId, user!.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
      toast({ title: `Migration complete`, description: `${result.migrated} student profiles created.` });
    },
    onError: (err: any) => toast({ title: "Migration error", description: err.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pricing & Billing Rules</h1>
            <p className="text-sm text-muted-foreground">
              Manage fee catalog, versioning, student billing profiles, and pricing audit trail
            </p>
          </div>
          <div className="flex items-center gap-3">
          </div>
        </div>

        {!branchId ? (
          <p className="text-muted-foreground text-sm py-12 text-center">Please select a branch to manage pricing.</p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="catalog" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Fee Catalog</TabsTrigger>
              <TabsTrigger value="profiles" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Billing Profiles</TabsTrigger>
              <TabsTrigger value="changes" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Rate Changes</TabsTrigger>
              <TabsTrigger value="audit" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Audit Trail</TabsTrigger>
            </TabsList>

            {/* Tab 1: Fee Catalog */}
            <TabsContent value="catalog" className="mt-4">
              <FeePackagesTab branchId={branchId} canManage={canManage} />
            </TabsContent>

            {/* Tab 2: Billing Profiles */}
            <TabsContent value="profiles" className="mt-4 space-y-4">
              {canManage && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => migrateMutation.mutate()}
                    disabled={migrateMutation.isPending}
                  >
                    {migrateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />}
                    Convert Legacy Assignments
                  </Button>
                </div>
              )}
              <BillingProfileList branchId={branchId} />
            </TabsContent>

            {/* Tab 3: Rate Changes */}
            <TabsContent value="changes" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent & Upcoming Rate Changes</CardTitle>
                </CardHeader>
                <CardContent>
                  {rateChanges.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No rate changes recorded.</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Package</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead className="text-right">New Rate</TableHead>
                            <TableHead>Effective From</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rateChanges.map((v: any) => {
                            const isUpcoming = new Date(v.effective_from) > new Date();
                            const isCurrent = !v.effective_until;
                            return (
                              <TableRow key={v.id}>
                                <TableCell className="font-medium">{v.fee_packages?.name ?? "—"}</TableCell>
                                <TableCell><Badge variant="outline" className="text-[10px]">v{v.version_number}</Badge></TableCell>
                                <TableCell className="text-right font-semibold">RM {Number(v.amount).toFixed(2)}</TableCell>
                                <TableCell>{format(new Date(v.effective_from), "dd MMM yyyy")}</TableCell>
                                <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{v.change_reason ?? "—"}</TableCell>
                                <TableCell>
                                  {isUpcoming ? (
                                    <Badge className="bg-warning/10 text-warning text-[10px]">Upcoming</Badge>
                                  ) : isCurrent ? (
                                    <Badge className="bg-success/10 text-success text-[10px]">Active</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">Superseded</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: Audit Trail */}
            <TabsContent value="audit" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Pricing Audit Log</CardTitle>
                </CardHeader>
                <CardContent>
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No audit entries yet.</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Timestamp</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Entity Type</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLog.map((entry: any) => (
                            <TableRow key={entry.id}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{actionLabels[entry.action] ?? entry.action}</Badge>
                              </TableCell>
                              <TableCell className="text-sm capitalize">{entry.entity_type.replace(/_/g, " ")}</TableCell>
                              <TableCell className="text-sm">{entry.actor_name ?? "System"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                                {entry.new_values ? JSON.stringify(entry.new_values) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
