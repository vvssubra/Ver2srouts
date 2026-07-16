import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Target, Plus, Pencil, Trash2, ShieldCheck, AlertTriangle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { canViewCurriculumModule, canManageCurriculumModule } from "@/lib/curriculum-access";
import {
  useCatalogueDomains, useCatalogueAgeProfiles, useCatalogueObjectives,
  useCatalogueIndicators, useCatalogueBackfillDryRun, summarizeCatalogue,
  type CatalogueObjective, type CatalogueIndicator,
} from "@/lib/objective-catalogue";

type ObjectiveDraft = Partial<CatalogueObjective> & {
  indicators?: Array<Partial<CatalogueIndicator> & { _tmpId?: string }>;
};

function emptyDraft(ageProfileId: string, domainId: string): ObjectiveDraft {
  return {
    age_profile_id: ageProfileId,
    domain_id: domainId,
    objective_code: "",
    parent_title: "",
    parent_description: "",
    teacher_title: "",
    teacher_description: "",
    observable_evidence: [],
    objective_type: "core",
    parent_visible: true,
    source: "sprouts",
    is_active: true,
    sort_order: 0,
    indicators: [],
  };
}

export default function ObjectiveCatalogue() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role, allowedRoutes, managedRoutes } = useAuth();
  const canView = canViewCurriculumModule({ role, allowedRoutes, moduleKey: "curriculum.objectives" });
  const canManage = canManageCurriculumModule({ role, managedRoutes, moduleKey: "curriculum.objectives" }) ||
    role === "super_admin" || role === "franchisee" || role === "admin";

  const { data: ageProfiles = [] } = useCatalogueAgeProfiles();
  const { data: domains = [] } = useCatalogueDomains();

  const [ageProfileId, setAgeProfileId] = useState<string>("");
  useEffect(() => {
    if (!ageProfileId && ageProfiles.length) setAgeProfileId(ageProfiles[0].id);
  }, [ageProfiles, ageProfileId]);

  const [domainFilter, setDomainFilter] = useState<string>("all");

  const { data: objectives = [] } = useCatalogueObjectives(ageProfileId || null);
  const objIds = objectives.map((o) => o.id);
  const { data: indicators = [] } = useCatalogueIndicators(objIds);

  // Batch 6B-5 — historical mapping dry-run (READ-ONLY, no rows written).
  const { data: dryRun } = useCatalogueBackfillDryRun(ageProfileId || null);

  const summary = useMemo(
    () => summarizeCatalogue(objectives, indicators, domains as any),
    [objectives, indicators, domains],
  );

  const visible = objectives.filter((o) => domainFilter === "all" || o.domain_id === domainFilter);

  // Batch 6B-4 — admin usage diagnostic. Counts how many catalogue objectives
  // have at least one piece of Learning Journey evidence linked via the new
  // additive mapping columns (curriculum_objective_id) versus how many skill
  // rows for the same domains are still saved as custom free-text.
  const { data: usage } = useQuery({
    queryKey: ["catalogue-usage", ageProfileId, objectives.map((o) => o.id).join(",")],
    enabled: !!ageProfileId && objectives.length > 0,
    queryFn: async () => {
      const objIdsLocal = objectives.map((o) => o.id);
      const domainIds = Array.from(new Set(objectives.map((o) => o.domain_id)));
      const [linkedRes, customRes] = await Promise.all([
        (supabase as any)
          .from("child_update_skills")
          .select("curriculum_objective_id, curriculum_indicator_id")
          .in("curriculum_objective_id", objIdsLocal),
        (supabase as any)
          .from("child_update_skills")
          .select("id", { count: "exact", head: true })
          .in("domain_id", domainIds)
          .is("curriculum_objective_id", null),
      ]);
      const linkedRows = (linkedRes.data ?? []) as Array<{
        curriculum_objective_id: string | null;
        curriculum_indicator_id: string | null;
      }>;
      const observedObjectives = new Set(linkedRows.map((r) => r.curriculum_objective_id).filter(Boolean));
      const observedIndicators = new Set(linkedRows.map((r) => r.curriculum_indicator_id).filter(Boolean));
      const linkedCount = linkedRows.length;
      const customCount = customRes.count ?? 0;
      const totalEvidence = linkedCount + customCount;
      return {
        observedObjectives: observedObjectives.size,
        notYetObserved: Math.max(0, objIdsLocal.length - observedObjectives.size),
        observedIndicators: observedIndicators.size,
        linkedCount,
        customCount,
        linkedPct: totalEvidence > 0 ? Math.round((linkedCount / totalEvidence) * 100) : 0,
      };
    },
    staleTime: 60 * 1000,
  });

  // ---- editor state ----
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObjectiveDraft | null>(null);
  const [evidenceText, setEvidenceText] = useState("");

  const openCreate = () => {
    const d = emptyDraft(ageProfileId, domainFilter !== "all" ? domainFilter : (domains[0]?.id ?? ""));
    setDraft(d);
    setEvidenceText("");
    setOpen(true);
  };
  const openEdit = (o: CatalogueObjective) => {
    const inds = (summary.indicatorsByObjective.get(o.id) ?? []).map((i) => ({ ...i }));
    setDraft({ ...o, indicators: inds });
    setEvidenceText((o.observable_evidence ?? []).join("\n"));
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async (d: ObjectiveDraft) => {
      const evidence = evidenceText.split("\n").map((s) => s.trim()).filter(Boolean);
      const payload = {
        age_profile_id: d.age_profile_id,
        domain_id: d.domain_id,
        objective_code: d.objective_code,
        parent_title: d.parent_title,
        parent_description: d.parent_description || null,
        teacher_title: d.teacher_title,
        teacher_description: d.teacher_description || null,
        observable_evidence: evidence,
        level: d.level || null,
        recommended_term: d.recommended_term || null,
        objective_type: d.objective_type ?? "core",
        parent_visible: d.parent_visible ?? true,
        source: d.source ?? "sprouts",
        is_active: d.is_active ?? true,
        sort_order: d.sort_order ?? 0,
      };
      let objectiveId = d.id;
      const sb = supabase as any;
      if (objectiveId) {
        const { error } = await sb.from("curriculum_objectives").update(payload).eq("id", objectiveId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("curriculum_objectives").insert(payload).select("id").single();
        if (error) throw error;
        objectiveId = data.id;
      }

      // Sync indicators: simple "replace if changed" — delete removed, upsert rest.
      const inds = d.indicators ?? [];
      const existing = (summary.indicatorsByObjective.get(objectiveId!) ?? []);
      const keptIds = new Set(inds.filter((i) => i.id).map((i) => i.id));
      const toDelete = existing.filter((e) => !keptIds.has(e.id)).map((e) => e.id);
      if (toDelete.length) {
        await sb.from("curriculum_objective_indicators").delete().in("id", toDelete);
      }
      for (let idx = 0; idx < inds.length; idx++) {
        const i = inds[idx];
        const ipayload = {
          objective_id: objectiveId,
          indicator_label: i.indicator_label ?? "",
          evidence_example: i.evidence_example || null,
          observation_prompt: i.observation_prompt || null,
          proficiency_levels: i.proficiency_levels ?? ["not_yet", "emerging", "developing", "secure"],
          is_active: i.is_active ?? true,
          sort_order: idx,
        };
        if (!ipayload.indicator_label.trim()) continue;
        if (i.id) {
          await sb.from("curriculum_objective_indicators").update(ipayload).eq("id", i.id);
        } else {
          await sb.from("curriculum_objective_indicators").insert(ipayload);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Objective saved to the catalogue." });
      qc.invalidateQueries({ queryKey: ["catalogue-objectives"] });
      qc.invalidateQueries({ queryKey: ["catalogue-indicators"] });
      setOpen(false);
      setDraft(null);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message ?? "Unknown error", variant: "destructive" }),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (o: CatalogueObjective) => {
      const { error } = await (supabase as any)
        .from("curriculum_objectives")
        .update({ is_active: !o.is_active })
        .eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalogue-objectives"] }),
  });

  if (!canView) {
    return (
      <DashboardLayout>
        <PageHeader icon={<ShieldCheck className="h-5 w-5" />} title="Objective Catalogue" />
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>No access</AlertTitle>
          <AlertDescription>
            Your access group does not include the Objective Catalogue. Ask a Super Admin to grant
            <span className="font-mono"> curriculum.objectives</span> via Users → Access Groups.
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  // ---- draft mutators ----
  const updateDraft = (patch: Partial<ObjectiveDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateIndicator = (idx: number, patch: Partial<CatalogueIndicator>) =>
    setDraft((d) => {
      if (!d) return d;
      const arr = [...(d.indicators ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...d, indicators: arr };
    });
  const addIndicator = () =>
    setDraft((d) =>
      d ? { ...d, indicators: [...(d.indicators ?? []), { indicator_label: "", proficiency_levels: ["not_yet","emerging","developing","secure"], is_active: true, _tmpId: crypto.randomUUID() }] } : d,
    );
  const removeIndicator = (idx: number) =>
    setDraft((d) => (d ? { ...d, indicators: (d.indicators ?? []).filter((_, i) => i !== idx) } : d));

  const draftValid = !!(draft && draft.age_profile_id && draft.domain_id && draft.parent_title?.trim() && draft.teacher_title?.trim() && evidenceText.trim().length > 0);

  const draftWarnings: string[] = [];
  if (draft) {
    if (!(draft.indicators ?? []).some((i) => (i.indicator_label ?? "").trim())) draftWarnings.push("No teacher indicators added — recommended for evidence depth.");
    if (!draft.parent_description?.trim()) draftWarnings.push("Parent description is empty — parents won't see context.");
    if (!(draft.indicators ?? []).some((i) => (i.evidence_example ?? "").trim())) draftWarnings.push("No evidence example on any indicator.");
    const dup = objectives.some((o) => o.id !== draft.id && o.objective_code === (draft.objective_code ?? "").trim() && o.age_profile_id === draft.age_profile_id && o.domain_id === draft.domain_id);
    if (dup && (draft.objective_code ?? "").trim()) draftWarnings.push("Objective code already exists for this age + domain.");
  }

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="foundation" />
      <PageHeader
        icon={<Target className="h-5 w-5" />}
        title="Objective Catalogue"
        subtitle="Age-based learning objectives for ages 2–6 across the Sprouts 7-domain growth curriculum."
        actions={canManage ? <Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> Add objective</Button> : null}
      />

      <SectionCard title="Readiness" description="Where the catalogue is thin — fix these to strengthen lesson planning, progress tracking and parent reports.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Active objectives</p>
            <p className="text-2xl font-semibold">{summary.totalActive}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Domains missing objectives</p>
            <p className="text-2xl font-semibold">{summary.missingDomains.length}</p>
            {summary.missingDomains.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">{summary.missingDomains.map((d) => d.code).join(", ")}</p>
            )}
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Objectives without indicators</p>
            <p className="text-2xl font-semibold">{summary.objectivesWithoutIndicator}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Missing parent wording</p>
            <p className="text-2xl font-semibold">{summary.objectivesMissingParentWording}</p>
          </CardContent></Card>
        </div>
      </SectionCard>

      <SectionCard
        title="Catalogue usage"
        description="How much Learning Journey evidence is linked to official objectives versus saved as custom observations. Updates as teachers tag Moments."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Objectives observed</p>
            <p className="text-2xl font-semibold">{usage?.observedObjectives ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">of {objectives.length} for this age</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Objectives not yet observed</p>
            <p className="text-2xl font-semibold">{usage?.notYetObserved ?? objectives.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Most-used indicators</p>
            <p className="text-2xl font-semibold">{usage?.observedIndicators ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">distinct indicators with evidence</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Custom observations</p>
            <p className="text-2xl font-semibold">{usage?.customCount ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">teacher free-text, not linked to an objective</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Evidence linked to official objectives</p>
            <p className="text-2xl font-semibold">{usage?.linkedPct ?? 0}%</p>
            <p className="text-[11px] text-muted-foreground mt-1">{usage?.linkedCount ?? 0} of {(usage?.linkedCount ?? 0) + (usage?.customCount ?? 0)} skill rows</p>
          </CardContent></Card>
        </div>
      </SectionCard>

      <SectionCard
        title="Historical mapping readiness"
        description="Dry-run only — no historical data is changed. Estimates how much existing Learning Journey evidence for this age could be mapped to official objectives by exact label match."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Unmapped historical evidence</p>
            <p className="text-2xl font-semibold">{dryRun?.totalUnmapped ?? 0}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Exact match candidates</p>
            <p className="text-2xl font-semibold">{dryRun?.exactMatches ?? 0}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Ambiguous matches</p>
            <p className="text-2xl font-semibold">{dryRun?.ambiguousMatches ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">label matches more than one objective</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">No-match rows</p>
            <p className="text-2xl font-semibold">{dryRun?.noMatches ?? 0}</p>
          </CardContent></Card>
        </div>
        {(dryRun?.topUnmatchedLabels?.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Top unmatched labels</p>
            <div className="flex flex-wrap gap-1.5">
              {(dryRun?.topUnmatchedLabels ?? []).map((u) => (
                <Badge key={u.label} variant="outline" className="text-[11px]">
                  {u.label} <span className="ml-1 text-muted-foreground">×{u.count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
        {(dryRun?.sampleAmbiguousLabels?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Sample ambiguous labels</p>
            <div className="flex flex-wrap gap-1.5">
              {(dryRun?.sampleAmbiguousLabels ?? []).map((u) => (
                <Badge key={u.label} variant="secondary" className="text-[11px]">
                  {u.label} <span className="ml-1 text-muted-foreground">{u.candidates} candidates</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Available in a future batch once review tooling is added">
            Run backfill (coming soon)
          </Button>
          <span className="text-[11px] text-muted-foreground">Dry-run only — no historical data changed.</span>
        </div>
      </SectionCard>

      <SectionCard title="Browse by age and domain">
        <Tabs value={ageProfileId} onValueChange={setAgeProfileId}>
          <TabsList className="flex flex-wrap h-auto">
            {ageProfiles.map((a: any) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.age_group === 2 ? "2–3" : `Age ${a.age_group}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2 mt-4">
          <Badge
            variant={domainFilter === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setDomainFilter("all")}
          >
            All ({objectives.filter((o) => o.is_active).length})
          </Badge>
          {(domains as any[]).map((d) => {
            const n = objectives.filter((o) => o.is_active && o.domain_id === d.id).length;
            return (
              <Badge
                key={d.id}
                variant={domainFilter === d.id ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setDomainFilter(d.id)}
              >
                {d.code} · {n}
              </Badge>
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          {visible.length === 0 ? (
            <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
              No objectives added for this age/domain yet. Add objectives so lesson planning,
              progress tracking and parent reports have a stronger foundation.
            </div>
          ) : (
            visible.map((o) => {
              const inds = summary.indicatorsByObjective.get(o.id) ?? [];
              const domain = (domains as any[]).find((d) => d.id === o.domain_id);
              return (
                <Card key={o.id} className={!o.is_active ? "opacity-60" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{domain?.code ?? "?"}</Badge>
                          {o.objective_code && <span className="text-xs font-mono text-muted-foreground">{o.objective_code}</span>}
                          <Badge variant="outline" className="text-[10px] capitalize">{o.objective_type}</Badge>
                          {!o.parent_visible && <Badge variant="outline" className="text-[10px] gap-1"><EyeOff className="h-3 w-3" /> internal</Badge>}
                          {!o.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                        </div>
                        <p className="font-semibold mt-1">{o.parent_title}</p>
                        <p className="text-xs text-muted-foreground">Teacher: {o.teacher_title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {inds.length} indicator{inds.length === 1 ? "" : "s"} · {(o.observable_evidence ?? []).length} evidence statement(s)
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(o)}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => toggleActiveMut.mutate(o)}>
                            {o.is_active ? <><EyeOff className="h-3 w-3" /> Mark inactive</> : <><Eye className="h-3 w-3" /> Activate</>}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </SectionCard>

      {/* Editor */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDraft(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit objective" : "Add objective"}</DialogTitle>
            <DialogDescription>
              Objectives drive parent-facing progress and teacher-facing planning. Indicators capture evidence depth.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Age</Label>
                  <Select value={draft.age_profile_id ?? ""} onValueChange={(v) => updateDraft({ age_profile_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ageProfiles.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.age_group === 2 ? "2–3 (Toddler)" : `Age ${a.age_group} — ${a.stage_name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Domain</Label>
                  <Select value={draft.domain_id ?? ""} onValueChange={(v) => updateDraft({ domain_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(domains as any[]).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Objective code</Label>
                  <Input value={draft.objective_code ?? ""} onChange={(e) => updateDraft({ objective_code: e.target.value })} placeholder="e.g. CL-3-01" />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={draft.objective_type ?? "core"} onValueChange={(v) => updateDraft({ objective_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="core">Core</SelectItem>
                      <SelectItem value="emerging">Emerging</SelectItem>
                      <SelectItem value="extension">Extension</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Parent title *</Label>
                <Input value={draft.parent_title ?? ""} onChange={(e) => updateDraft({ parent_title: e.target.value })} placeholder="What parents see, e.g. 'Speaks in short sentences'" />
              </div>
              <div>
                <Label>Parent description</Label>
                <Textarea rows={2} value={draft.parent_description ?? ""} onChange={(e) => updateDraft({ parent_description: e.target.value })} />
              </div>
              <div>
                <Label>Teacher title *</Label>
                <Input value={draft.teacher_title ?? ""} onChange={(e) => updateDraft({ teacher_title: e.target.value })} />
              </div>
              <div>
                <Label>Teacher description</Label>
                <Textarea rows={2} value={draft.teacher_description ?? ""} onChange={(e) => updateDraft({ teacher_description: e.target.value })} />
              </div>
              <div>
                <Label>Observable evidence * (one per line)</Label>
                <Textarea rows={3} value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder={"Combines 3-4 words to make a sentence\nResponds to simple questions"} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Level / stage</Label>
                  <Input value={draft.level ?? ""} onChange={(e) => updateDraft({ level: e.target.value })} />
                </div>
                <div>
                  <Label>Recommended term</Label>
                  <Input value={draft.recommended_term ?? ""} onChange={(e) => updateDraft({ recommended_term: e.target.value })} placeholder="Term 1" />
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={draft.source ?? "sprouts"} onValueChange={(v) => updateDraft({ source: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sprouts">Sprouts</SelectItem>
                      <SelectItem value="kspk_aligned">KSPK-aligned</SelectItem>
                      <SelectItem value="school_custom">School custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.parent_visible ?? true} onCheckedChange={(v) => updateDraft({ parent_visible: v })} />
                  <Label className="m-0">Parent visible</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => updateDraft({ is_active: v })} />
                  <Label className="m-0">Active</Label>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label>Indicators</Label>
                  <Button size="sm" variant="outline" className="gap-1" onClick={addIndicator}><Plus className="h-3 w-3" /> Add indicator</Button>
                </div>
                <div className="space-y-2 mt-2">
                  {(draft.indicators ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No indicators yet. Indicators give teachers more ways to capture evidence without inflating progress beyond 100%.</p>
                  )}
                  {(draft.indicators ?? []).map((i, idx) => (
                    <div key={i.id ?? i._tmpId ?? idx} className="border rounded p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Indicator label"
                          value={i.indicator_label ?? ""}
                          onChange={(e) => updateIndicator(idx, { indicator_label: e.target.value })}
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeIndicator(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input placeholder="Evidence example" value={i.evidence_example ?? ""} onChange={(e) => updateIndicator(idx, { evidence_example: e.target.value })} />
                      <Input placeholder="Observation prompt" value={i.observation_prompt ?? ""} onChange={(e) => updateIndicator(idx, { observation_prompt: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>

              {draftWarnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings (you can still save)</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5 text-xs">
                      {draftWarnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {!draftValid && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Required</AlertTitle>
                  <AlertDescription className="text-xs">
                    Age, domain, parent title, teacher title and at least one observable evidence statement are required.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!draftValid || saveMut.isPending} onClick={() => draft && saveMut.mutate(draft)}>
              {saveMut.isPending ? "Saving…" : "Save objective"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}