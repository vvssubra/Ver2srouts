import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, Save, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SalaryComponent {
  id: string;
  label: string;
  type: string;
  amount: number;
  is_statutory: boolean;
  is_active: boolean;
  isNew?: boolean;
}

const PRESETS = [
  "Housing Allowance",
  "Transport Allowance",
  "Meal Allowance",
  "Phone Allowance",
  "Attendance Allowance",
  "Performance Bonus",
  "Hardship Allowance",
];

export default function SalaryComponentsCard({ userId, canManage }: { userId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: savedComponents = [], isLoading } = useQuery({
    queryKey: ["salary-components", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_salary_components" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at");
      return (data ?? []) as any[];
    },
    enabled: !!userId,
  });

  if (savedComponents.length > 0 && !initialized) {
    setComponents(savedComponents.map((c: any) => ({
      id: c.id,
      label: c.label,
      type: c.type,
      amount: Number(c.amount),
      is_statutory: c.is_statutory,
      is_active: c.is_active,
    })));
    setInitialized(true);
  } else if (savedComponents.length === 0 && !isLoading && !initialized) {
    setComponents([]);
    setInitialized(true);
  }

  const addComponent = (label = "") => {
    setComponents(prev => [...prev, {
      id: crypto.randomUUID(),
      label,
      type: "earning",
      amount: 0,
      is_statutory: true,
      is_active: true,
      isNew: true,
    }]);
    setEditMode(true);
  };

  const updateComponent = (id: string, field: string, value: any) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeComponent = (id: string) => {
    setComponents(prev => prev.filter(c => c.id !== id));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete all existing, then insert all current
      await supabase.from("staff_salary_components" as any).delete().eq("user_id", userId);
      if (components.length > 0) {
        const rows = components.filter(c => c.label.trim()).map(c => ({
          user_id: userId,
          label: c.label,
          type: c.type,
          amount: c.amount,
          is_statutory: c.is_statutory,
          is_active: c.is_active,
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("staff_salary_components" as any).insert(rows);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Salary components saved" });
      setEditMode(false);
      setInitialized(false);
      queryClient.invalidateQueries({ queryKey: ["salary-components", userId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statutoryEarnings = components.filter(c => c.type === "earning" && c.is_statutory && c.is_active).reduce((s, c) => s + c.amount, 0);
  const nonStatutoryEarnings = components.filter(c => c.type === "earning" && !c.is_statutory && c.is_active).reduce((s, c) => s + c.amount, 0);
  const totalDeductions = components.filter(c => c.type === "deduction" && c.is_active).reduce((s, c) => s + c.amount, 0);
  // Flag fixed/recurring earnings tagged Non-Statutory — per EPF Act 1991 these MUST be statutory.
  const FIXED_KEYWORDS = /allowance|housing|transport|meal|phone|cola|attendance|kpi|incentive|fixed|performance/i;
  const misclassified = components.filter(c => c.type === "earning" && c.is_active && !c.is_statutory && FIXED_KEYWORDS.test(c.label));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Salary Components
            </CardTitle>
            <CardDescription>Recurring allowances and deductions applied monthly during payroll generation</CardDescription>
          </div>
          {canManage && !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : components.length === 0 && !editMode ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No salary components configured</p>
            {canManage && (
              <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => addComponent()}>
                <Plus className="h-3 w-3" /> Add Component
              </Button>
            )}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount (RM)</TableHead>
                  <TableHead className="text-center">Statutory</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  {editMode && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((c) => (
                  <TableRow key={c.id} className={!c.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      {editMode ? (
                        <Input value={c.label} onChange={(e) => updateComponent(c.id, "label", e.target.value)} className="h-8 text-xs" placeholder="e.g. Housing Allowance" />
                      ) : (
                        <span className="text-sm font-medium">{c.label}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <Select value={c.type} onValueChange={(v) => updateComponent(c.id, "type", v)}>
                          <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="earning">Earning</SelectItem>
                            <SelectItem value="deduction">Deduction</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={c.type === "earning" ? "default" : "destructive"} className="text-[10px]">
                          {c.type === "earning" ? "Earning" : "Deduction"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editMode ? (
                        <Input type="number" value={c.amount || ""} onChange={(e) => updateComponent(c.id, "amount", Number(e.target.value) || 0)} className="h-8 text-xs w-28 ml-auto text-right" />
                      ) : (
                        <span className="text-sm font-semibold">RM {c.amount.toFixed(2)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editMode ? (
                        <Switch checked={c.is_statutory} onCheckedChange={(v) => updateComponent(c.id, "is_statutory", v)} />
                      ) : (
                        <Badge variant={c.is_statutory ? "secondary" : "outline"} className="text-[10px]">
                          {c.is_statutory ? "Yes" : "No"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {editMode ? (
                        <Switch checked={c.is_active} onCheckedChange={(v) => updateComponent(c.id, "is_active", v)} />
                      ) : (
                        c.is_active ? <Badge variant="secondary" className="text-[10px]">Active</Badge> : <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                      )}
                    </TableCell>
                    {editMode && (
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeComponent(c.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Summary */}
            {components.length > 0 && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
                <span>Statutory Earnings: <strong className="text-foreground">RM {statutoryEarnings.toFixed(2)}</strong></span>
                <span>Non-Statutory Earnings: <strong className="text-foreground">RM {nonStatutoryEarnings.toFixed(2)}</strong></span>
                <span>Deductions: <strong className="text-destructive">RM {totalDeductions.toFixed(2)}</strong></span>
              </div>
            )}

            {editMode && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => addComponent()}>
                  <Plus className="h-3 w-3" /> Add Component
                </Button>
                {PRESETS.filter(p => !components.some(c => c.label === p)).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {PRESETS.filter(p => !components.some(c => c.label === p)).slice(0, 4).map(preset => (
                      <Button key={preset} variant="ghost" size="sm" className="text-[10px] h-7 px-2" onClick={() => addComponent(preset)}>
                        + {preset}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editMode && (
              <div className="flex gap-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Components
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setInitialized(false); setEditMode(false); }}>Cancel</Button>
              </div>
            )}
          </>
        )}

        <p className="text-[10px] text-muted-foreground">
          <strong>Statutory</strong> = included in EPF/SOCSO/EIS/PCB calculation base. <strong>Non-statutory</strong> = added to gross but excluded from statutory deductions.
          Per EPF Act 1991, <strong>overtime is always excluded from EPF (KWSP)</strong> but remains subject to SOCSO &amp; EIS up to the statutory wage cap.
        </p>
        <p className="text-[10px] text-muted-foreground">
          <strong>Compliance:</strong> All <em>fixed monthly</em> allowances (housing, transport, phone, COLA, performance, attendance, KPI, incentive) MUST be Statutory per EPF Act 1991 and SOCSO Act 1969. Only ad-hoc items (duit raya, festive gifts, mileage, gratuity, retrenchment) should be Non-Statutory.
        </p>
        {misclassified.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Possible misclassification</p>
              <p>{misclassified.map(c => `"${c.label}"`).join(", ")} look like fixed allowance(s) but {misclassified.length > 1 ? "are" : "is"} tagged <strong>Non-Statutory</strong>. This excludes {misclassified.length > 1 ? "them" : "it"} from EPF/SOCSO/EIS and may underpay statutory contributions. Toggle <strong>Statutory = Yes</strong> unless they are genuinely ad-hoc.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
