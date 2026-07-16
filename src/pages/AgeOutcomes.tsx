import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Target, Plus, Pencil, Trash2, ChevronRight, GraduationCap } from "lucide-react";

const AGE_OPTIONS = [
  { value: "all", label: "All Ages" },
  { value: "3", label: "Age 3" },
  { value: "4", label: "Age 4" },
  { value: "5", label: "Age 5" },
  { value: "6", label: "Age 6" },
];

export default function AgeOutcomes() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";

  const [ageFilter, setAgeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [selectedOutcome, setSelectedOutcome] = useState<any>(null);
  const [showCreateOutcome, setShowCreateOutcome] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgeProfile, setFormAgeProfile] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formMastery, setFormMastery] = useState("");
  const [formTermTargets, setFormTermTargets] = useState({ term_1: "", term_2: "", term_3: "", term_4: "" });

  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: ageProfiles = [] } = useQuery({
    queryKey: ["age-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("age_profiles").select("*").order("age_group");
      return data ?? [];
    },
  });

  const { data: outcomes = [], isLoading } = useQuery({
    queryKey: ["development-outcomes-list", ageFilter, domainFilter],
    queryFn: async () => {
      let q = supabase
        .from("development_outcomes")
        .select("*, age_profiles!inner(age_group, stage_name), development_domains!inner(name, code)")
        .order("outcome_code");
      if (ageFilter !== "all") q = q.eq("age_profiles.age_group", parseInt(ageFilter));
      if (domainFilter !== "all") q = q.eq("domain_id", domainFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Indicators for detail drawer
  const { data: indicators = [] } = useQuery({
    queryKey: ["outcome-indicators", selectedOutcome?.id],
    queryFn: async () => {
      const { data } = await supabase.from("development_indicators").select("*")
        .eq("outcome_id", selectedOutcome.id).order("sort_order");
      return data ?? [];
    },
    enabled: !!selectedOutcome?.id,
  });

  const openCreate = () => {
    setShowCreateOutcome(true);
    setFormCode("");
    setFormTitle("");
    setFormDescription("");
    setFormAgeProfile("");
    setFormDomain("");
    setFormMastery("");
    setFormTermTargets({ term_1: "", term_2: "", term_3: "", term_4: "" });
  };

  const openEdit = (o: any) => {
    setShowCreateOutcome(true);
    setSelectedOutcome(o);
    setFormCode(o.outcome_code || "");
    setFormTitle(o.outcome_title || "");
    setFormDescription(o.outcome_description || "");
    setFormAgeProfile(o.age_profile_id || "");
    setFormDomain(o.domain_id || "");
    setFormMastery(o.mastery_expectation || "");
    setFormTermTargets(o.term_targets ? { term_1: (o.term_targets as any).term_1 || "", term_2: (o.term_targets as any).term_2 || "", term_3: (o.term_targets as any).term_3 || "", term_4: (o.term_targets as any).term_4 || "" } : { term_1: "", term_2: "", term_3: "", term_4: "" });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        outcome_code: formCode,
        outcome_title: formTitle,
        outcome_description: formDescription,
        age_profile_id: formAgeProfile,
        domain_id: formDomain,
        mastery_expectation: formMastery,
        term_targets: formTermTargets,
      };
      if (selectedOutcome?.id && showCreateOutcome) {
        const { error } = await supabase.from("development_outcomes").update(payload as any).eq("id", selectedOutcome.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("development_outcomes").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["development-outcomes-list"] });
      setShowCreateOutcome(false);
      setSelectedOutcome(null);
      toast({ title: "Outcome saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("development_outcomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["development-outcomes-list"] });
      toast({ title: "Outcome deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Age-Based Outcomes
            </h1>
            <p className="text-muted-foreground">
              Development outcomes mapped by age group and domain, with observable indicators.
            </p>
          </div>
          {isSuperAdmin && (
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Outcome
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Age Group</Label>
                <Select value={ageFilter} onValueChange={setAgeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={domainFilter} onValueChange={setDomainFilter}>
                  <SelectTrigger><SelectValue placeholder="All Domains" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Domains</SelectItem>
                    {(domains as any[]).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : outcomes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No outcomes found</h3>
              <p className="text-sm text-muted-foreground mt-1">Adjust filters or add new development outcomes.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="hidden md:table-cell">Age</TableHead>
                    <TableHead className="hidden md:table-cell">Domain</TableHead>
                    <TableHead className="hidden lg:table-cell">Mastery</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(outcomes as any[]).map((o: any) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { if (!showCreateOutcome) setSelectedOutcome(o); }}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{o.outcome_code}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{o.outcome_title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 hidden sm:block">{o.outcome_description}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">Age {o.age_profiles?.age_group}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{o.development_domains?.name}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{o.mastery_expectation}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isSuperAdmin && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(o); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(o.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground mt-1.5" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detail Drawer */}
      <Sheet open={!!selectedOutcome && !showCreateOutcome} onOpenChange={(open) => { if (!open) setSelectedOutcome(null); }}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-lg">
              {selectedOutcome?.outcome_code}: {selectedOutcome?.outcome_title}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="flex gap-2">
              <Badge variant="secondary">Age {selectedOutcome?.age_profiles?.age_group}</Badge>
              <Badge variant="outline">{selectedOutcome?.development_domains?.name}</Badge>
            </div>
            {selectedOutcome?.outcome_description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selectedOutcome.outcome_description}</p>
              </div>
            )}
            {selectedOutcome?.term_targets && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Term Targets</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedOutcome.term_targets as Record<string, string>).map(([k, v]) => (
                    <div key={k} className="rounded-md border p-2">
                      <p className="text-xs font-medium text-muted-foreground capitalize">{k.replace("_", " ")}</p>
                      <p className="text-sm">{v || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedOutcome?.mastery_expectation && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Mastery Expectation</p>
                <p className="text-sm">{selectedOutcome.mastery_expectation}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Observable Indicators ({indicators.length})</p>
              {indicators.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No indicators added yet.</p>
              ) : (
                <div className="space-y-2">
                  {(indicators as any[]).map((ind: any) => (
                    <div key={ind.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{ind.indicator_text}</p>
                      {ind.evidence_type && (
                        <Badge variant="outline" className="mt-1 text-xs">{ind.evidence_type}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create/Edit Outcome Dialog */}
      <Dialog open={showCreateOutcome} onOpenChange={(open) => { if (!open) { setShowCreateOutcome(false); setSelectedOutcome(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedOutcome ? "Edit Outcome" : "Add Outcome"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Age Profile</Label>
                <Select value={formAgeProfile} onValueChange={setFormAgeProfile}>
                  <SelectTrigger><SelectValue placeholder="Select age" /></SelectTrigger>
                  <SelectContent>
                    {(ageProfiles as any[]).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>Age {a.age_group} — {a.stage_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Select value={formDomain} onValueChange={setFormDomain}>
                  <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
                  <SelectContent>
                    {(domains as any[]).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Outcome Code</Label>
              <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="e.g. CL-3-01" />
            </div>
            <div className="space-y-2">
              <Label>Outcome Title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Uses short phrases to communicate" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Term Targets</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Term 1</Label>
                  <Input value={formTermTargets.term_1} onChange={(e) => setFormTermTargets(prev => ({ ...prev, term_1: e.target.value }))} placeholder="e.g. Introduce basic vocabulary" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Term 2</Label>
                  <Input value={formTermTargets.term_2} onChange={(e) => setFormTermTargets(prev => ({ ...prev, term_2: e.target.value }))} placeholder="e.g. Practice in context" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Term 3</Label>
                  <Input value={formTermTargets.term_3} onChange={(e) => setFormTermTargets(prev => ({ ...prev, term_3: e.target.value }))} placeholder="e.g. Apply independently" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Term 4</Label>
                  <Input value={formTermTargets.term_4} onChange={(e) => setFormTermTargets(prev => ({ ...prev, term_4: e.target.value }))} placeholder="e.g. Demonstrate mastery" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mastery Expectation</Label>
              <Input value={formMastery} onChange={(e) => setFormMastery(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateOutcome(false); setSelectedOutcome(null); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formCode || !formTitle || !formAgeProfile || !formDomain}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
