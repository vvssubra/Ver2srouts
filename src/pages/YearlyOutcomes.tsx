import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { SmartGoalHelper, SmartBadge } from "@/components/academic/SmartGoalHelper";
import { LinkedItemsPanel } from "@/components/academic/LinkedItemsPanel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Target, Plus, Pencil, Trash2, GraduationCap, Sparkles } from "lucide-react";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

export default function YearlyOutcomes() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin" || role === "franchisee";

  const [ageFilter, setAgeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingObj, setEditingObj] = useState<any>(null);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [aiAgeGroup, setAiAgeGroup] = useState("");
  const [aiDomain, setAiDomain] = useState("");

  const [form, setForm] = useState({
    outcome_code: "", outcome_title: "", outcome_description: "",
    age_group_id: "", domain_id: "", mastery_expectation: "",
    smart_specific: "", smart_measurable: "", smart_achievable: "",
    smart_relevant: "", smart_timebound: "",
  });

  const { data: ageGroups = [] } = useQuery({
    queryKey: ["age-groups-canonical"],
    queryFn: async () => {
      const { data } = await supabase.from("age_groups").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: outcomes = [], isLoading } = useQuery({
    queryKey: ["yearly-outcomes", ageFilter, domainFilter],
    queryFn: async () => {
      let q = supabase
        .from("yearly_outcomes")
        .select("*, age_groups!inner(code, label), development_domains!inner(name, code)")
        .order("outcome_code");
      if (ageFilter !== "all") q = q.eq("age_group_id", ageFilter);
      if (domainFilter !== "all") q = q.eq("domain_id", domainFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: objCounts = {} } = useQuery({
    queryKey: ["yearly-outcome-obj-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("lesson_objectives").select("yearly_outcome_id").eq("is_active", true).not("yearly_outcome_id", "is", null);
      const counts: Record<string, number> = {};
      data?.forEach((r: any) => { counts[r.yearly_outcome_id] = (counts[r.yearly_outcome_id] || 0) + 1; });
      return counts;
    },
  });

  const resetForm = () => {
    setForm({ outcome_code: "", outcome_title: "", outcome_description: "", age_group_id: "", domain_id: "", mastery_expectation: "", smart_specific: "", smart_measurable: "", smart_achievable: "", smart_relevant: "", smart_timebound: "" });
    setEditingObj(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };
  const openEdit = (o: any) => {
    setEditingObj(o);
    setForm({
      outcome_code: o.outcome_code || "", outcome_title: o.outcome_title || "",
      outcome_description: o.outcome_description || "", age_group_id: o.age_group_id || "",
      domain_id: o.domain_id || "", mastery_expectation: o.mastery_expectation || "",
      smart_specific: o.smart_specific || "", smart_measurable: o.smart_measurable || "",
      smart_achievable: o.smart_achievable || "", smart_relevant: o.smart_relevant || "",
      smart_timebound: o.smart_timebound || "",
    });
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        outcome_description: form.outcome_description || null,
        mastery_expectation: form.mastery_expectation || null,
        smart_specific: form.smart_specific || null,
        smart_measurable: form.smart_measurable || null,
        smart_achievable: form.smart_achievable || null,
        smart_relevant: form.smart_relevant || null,
        smart_timebound: form.smart_timebound || null,
        smart_score: [form.smart_specific, form.smart_measurable, form.smart_achievable, form.smart_relevant, form.smart_timebound].filter(v => v && v.trim()).length,
      };
      if (editingObj?.id) {
        const { error } = await supabase.from("yearly_outcomes").update(payload).eq("id", editingObj.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("yearly_outcomes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yearly-outcomes"] });
      setShowForm(false); resetForm();
      toast({ title: "Learning goal saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("yearly_outcomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yearly-outcomes"] });
      toast({ title: "Learning goal deleted" });
    },
  });

  // AI Brainstorm
  const aiBrainstormMutation = useMutation({
    mutationFn: async () => {
      if (!aiAgeGroup || !aiDomain) throw new Error("Select age group and domain first");
      const { data, error } = await supabase.functions.invoke("brainstorm-outcomes", {
        body: { age_group_id: aiAgeGroup, domain_id: aiDomain },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setAiSuggestions(data.outcomes || []);
      setSelectedSuggestions(new Set(data.outcomes?.map((_: any, i: number) => i) || []));
    },
    onError: (e: any) => toast({ title: "AI Error", description: e.message, variant: "destructive" }),
  });

  const addSelectedMutation = useMutation({
    mutationFn: async () => {
      const toAdd = aiSuggestions.filter((_: any, i: number) => selectedSuggestions.has(i));
      if (toAdd.length === 0) throw new Error("No outcomes selected");
      const rows = toAdd.map((s: any) => ({
        outcome_code: s.outcome_code,
        outcome_title: s.outcome_title,
        outcome_description: s.outcome_description || null,
        mastery_expectation: s.mastery_expectation || null,
        age_group_id: aiAgeGroup,
        domain_id: aiDomain,
      }));
      const { error } = await supabase.from("yearly_outcomes").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yearly-outcomes"] });
      setShowAiDialog(false);
      setAiSuggestions([]);
      toast({ title: `${selectedSuggestions.size} learning goals added! ✨` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="foundation" />
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Learning Goals
            </h1>
            <p className="text-muted-foreground">
              Broad year-level development outcomes by age and domain. Lesson objectives link to these.
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button onClick={() => { setAiAgeGroup(ageFilter !== "all" ? ageFilter : ""); setAiDomain(domainFilter !== "all" ? domainFilter : ""); setAiSuggestions([]); setShowAiDialog(true); }} variant="outline" size="sm">
                <Sparkles className="h-4 w-4 mr-1" /> AI Suggest
              </Button>
              <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Goal</Button>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Age Group</Label>
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    {ageGroups.map((ag: any) => <SelectItem key={ag.id} value={ag.id}>{ag.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={domainFilter} onValueChange={setDomainFilter}>
                  <SelectTrigger><SelectValue placeholder="All Domains" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Domains</SelectItem>
                    {domains.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : outcomes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No learning goals found</h3>
              <p className="text-sm text-muted-foreground mt-1">Use AI Suggest or add goals manually.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Learning Goal</TableHead>
                      <TableHead className="hidden md:table-cell">Age</TableHead>
                      <TableHead className="hidden md:table-cell">Domain</TableHead>
                      <TableHead className="hidden lg:table-cell">Objectives</TableHead>
                      <TableHead className="hidden lg:table-cell">Mastery</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outcomes.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">{o.outcome_code}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div>
                              <p className="font-medium text-sm">{o.outcome_title}</p>
                              {o.outcome_description && <p className="text-xs text-muted-foreground line-clamp-1 hidden sm:block">{o.outcome_description}</p>}
                            </div>
                            <SmartBadge score={o.smart_score || 0} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell"><Badge variant="secondary">{o.age_groups?.label}</Badge></TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{o.development_domains?.name}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline">{(objCounts as any)[o.id] || 0} linked</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{o.mastery_expectation}</TableCell>
                        <TableCell>
                          {canEdit && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(o.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingObj ? "Edit Learning Goal" : "Add Learning Goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Age Group *</Label>
                <Select value={form.age_group_id} onValueChange={(v) => setForm(f => ({ ...f, age_group_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select age" /></SelectTrigger>
                  <SelectContent>
                    {ageGroups.map((ag: any) => <SelectItem key={ag.id} value={ag.id}>{ag.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain *</Label>
                <Select value={form.domain_id} onValueChange={(v) => setForm(f => ({ ...f, domain_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    {domains.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Outcome Code *</Label>
              <Input value={form.outcome_code} onChange={(e) => setForm(f => ({ ...f, outcome_code: e.target.value }))} placeholder="e.g. YO-AGE4-CL-01" />
            </div>
            <div className="space-y-2">
              <Label>Outcome Title *</Label>
              <Input value={form.outcome_title} onChange={(e) => setForm(f => ({ ...f, outcome_title: e.target.value }))} placeholder="e.g. Communicates ideas using short phrases" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.outcome_description} onChange={(e) => setForm(f => ({ ...f, outcome_description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Mastery Expectation</Label>
              <Input value={form.mastery_expectation} onChange={(e) => setForm(f => ({ ...f, mastery_expectation: e.target.value }))} placeholder="e.g. By end of year, child can..." />
            </div>
            {/* SMART Goal Helper */}
            <SmartGoalHelper
              smart_specific={form.smart_specific}
              smart_measurable={form.smart_measurable}
              smart_achievable={form.smart_achievable}
              smart_relevant={form.smart_relevant}
              smart_timebound={form.smart_timebound}
              onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.outcome_code || !form.outcome_title || !form.age_group_id || !form.domain_id}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Suggest Dialog */}
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Suggest Learning Goals
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Age Group *</Label>
                <Select value={aiAgeGroup} onValueChange={setAiAgeGroup}>
                  <SelectTrigger><SelectValue placeholder="Select age" /></SelectTrigger>
                  <SelectContent>
                    {ageGroups.map((ag: any) => <SelectItem key={ag.id} value={ag.id}>{ag.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain *</Label>
                <Select value={aiDomain} onValueChange={setAiDomain}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    {domains.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => aiBrainstormMutation.mutate()} disabled={aiBrainstormMutation.isPending || !aiAgeGroup || !aiDomain}>
              {aiBrainstormMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate Suggestions</>}
            </Button>

            {aiSuggestions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select outcomes to add:</p>
                {aiSuggestions.map((s: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer" onClick={() => toggleSuggestion(idx)}>
                    <Checkbox checked={selectedSuggestions.has(idx)} onCheckedChange={() => toggleSuggestion(idx)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono text-xs">{s.outcome_code}</Badge>
                        <span className="font-medium text-sm">{s.outcome_title}</span>
                      </div>
                      {s.outcome_description && <p className="text-xs text-muted-foreground">{s.outcome_description}</p>}
                      {s.mastery_expectation && <p className="text-xs text-primary/70 mt-1">🎯 {s.mastery_expectation}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiDialog(false)}>Cancel</Button>
            {aiSuggestions.length > 0 && (
              <Button onClick={() => addSelectedMutation.mutate()} disabled={addSelectedMutation.isPending || selectedSuggestions.size === 0}>
                {addSelectedMutation.isPending ? "Adding..." : `Add ${selectedSuggestions.size} Selected`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
