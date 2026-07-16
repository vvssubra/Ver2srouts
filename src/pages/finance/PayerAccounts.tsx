import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Search, Wallet, AlertTriangle, ArrowRight, Mail, Phone, Plus,
} from "lucide-react";
import { formatCurrency } from "@/lib/finance/constants";
import { getPayerAccountsList, type PayerAccountRow } from "@/lib/finance/payer-service";
import { toast } from "sonner";
import { useGlobalBranch } from "@/hooks/use-branch-context";

const RISK_COLORS: Record<string, string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  high: "bg-red-100 text-red-800 border-red-200",
  critical: "bg-red-200 text-red-900 border-red-300",
};

export default function PayerAccounts() {
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBranch, setNewBranch] = useState("");

  const branchIds = selectedBranch === "all" ? branches.map((b) => b.id) : [selectedBranch];

  const { data: payers = [], isLoading } = useQuery({
    queryKey: ["payer-accounts-list", branchIds],
    queryFn: () => getPayerAccountsList(branchIds),
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    let result = payers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.includes(q)
      );
    }
    if (riskFilter !== "all") {
      result = result.filter((p) => p.collection_risk === riskFilter);
    }
    return result;
  }, [payers, search, riskFilter]);

  const totalOutstanding = useMemo(() => filtered.reduce((s, p) => s + p.total_outstanding, 0), [filtered]);
  const totalOverdue = useMemo(() => filtered.reduce((s, p) => s + p.total_overdue, 0), [filtered]);
  const atRiskCount = useMemo(() => filtered.filter((p) => p.collection_risk === "high" || p.collection_risk === "critical").length, [filtered]);
  const createPayer = useMutation({
    mutationFn: async () => {
      if (!newName || !newBranch) throw new Error("Name and branch are required");
      const { error } = await supabase.from("payer_accounts").insert({
        branch_id: newBranch,
        name: newName,
        email: newEmail || null,
        phone: newPhone || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payer account created");
      setShowCreateDialog(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewBranch("");
      queryClient.invalidateQueries({ queryKey: ["payer-accounts-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Family / Payer Accounts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consolidated family-level billing, risk view, and account management
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Payer Account
          </Button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Accounts</p>
            <p className="text-2xl font-bold mt-1">{filtered.length}</p>
          </Card>
          <Card className="p-4 border-destructive/20">
            <p className="text-xs font-medium text-muted-foreground">Total Outstanding</p>
            <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totalOutstanding)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Overdue</p>
            <p className="text-2xl font-bold text-warning mt-1">{formatCurrency(totalOverdue)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <p className="text-xs font-medium text-muted-foreground">At Risk</p>
            </div>
            <p className="text-2xl font-bold text-destructive mt-1">{atRiskCount}</p>
            <p className="text-[10px] text-muted-foreground">high / critical risk accounts</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Risk Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Accounts Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-12 text-center">Loading accounts...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <Users className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm">No payer accounts found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-center">Children</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Wallet</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((payer) => (
                    <TableRow key={payer.id} className="group cursor-pointer" onClick={() => navigate(`/finance/payers/${payer.id}`)}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium group-hover:text-primary transition-colors">{payer.name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {payer.email && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Mail className="h-2.5 w-2.5" /> {payer.email}
                              </span>
                            )}
                            {payer.phone && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Phone className="h-2.5 w-2.5" /> {payer.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{payer.branch_name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">{payer.student_count}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold">
                        {payer.total_outstanding > 0 ? (
                          <span className="text-destructive">{formatCurrency(payer.total_outstanding)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {payer.total_overdue > 0 ? (
                          <span className="text-warning">{formatCurrency(payer.total_overdue)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {payer.wallet_balance > 0 ? (
                          <span className="text-primary flex items-center justify-end gap-1">
                            <Wallet className="h-3 w-3" /> {formatCurrency(payer.wallet_balance)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] capitalize ${RISK_COLORS[payer.collection_risk]}`}>
                          {payer.collection_risk}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Payer Account Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Payer Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Branch *</Label>
                <Select value={newBranch} onValueChange={setNewBranch}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ahmad Family" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={() => createPayer.mutate()} disabled={createPayer.isPending || !newName || !newBranch}>
                Create Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
