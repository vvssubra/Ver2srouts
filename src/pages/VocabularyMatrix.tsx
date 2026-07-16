import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Library, Plus, Pencil, AlertTriangle, ShieldCheck, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { canViewCurriculumModule, canManageCurriculumModule } from "@/lib/curriculum-access";
import {
  useCatalogueAgeProfiles, useCatalogueDomains, useCatalogueObjectives,
} from "@/lib/objective-catalogue";
import {
  useVocabularyByAge, useUpsertVocabulary, useToggleVocabularyActive,
  summarizeVocabulary, WORD_TYPES, VOCAB_LEVELS, type VocabularyEntry, type WordType, type VocabularyLevel,
} from "@/lib/vocabulary-matrix";

type Draft = Partial<VocabularyEntry> & { age_profile_id: string };

const NONE = "__none__";

function emptyDraft(ageProfileId: string): Draft {
  return {
    age_profile_id: ageProfileId,
    english_word: "",
    bm_word: "",
    word_type: "theme_word",
    vocabulary_level: "receptive",
    parent_example_sentence_en: "",
    parent_example_sentence_bm: "",
    teacher_prompt_en: "",
    teacher_prompt_bm: "",
    activity_context: "",
    active_status: true,
    sort_order: 0,
    domain_id: null,
    theme_id: null,
    objective_id: null,
  };
}

export default function VocabularyMatrix() {
  const navigate = useNavigate();
  const { role, allowedRoutes, managedRoutes } = useAuth();
  const canView = canViewCurriculumModule({ role, allowedRoutes, moduleKey: "curriculum.vocabulary" });
  const canManage =
    canManageCurriculumModule({ role, managedRoutes, moduleKey: "curriculum.vocabulary" }) ||
    role === "super_admin" || role === "franchisee" || role === "admin";

  const { data: ageProfiles = [] } = useCatalogueAgeProfiles();
  const { data: domains = [] } = useCatalogueDomains();

  const [ageProfileId, setAgeProfileId] = useState<string>("");
  useEffect(() => {
    if (!ageProfileId && ageProfiles.length) setAgeProfileId(ageProfiles[0].id);
  }, [ageProfiles, ageProfileId]);

  const { data: themes = [] } = useQuery({
    queryKey: ["vocab-themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_bank")
        .select("id, theme_name, age_group")
        .order("month_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: objectives = [] } = useCatalogueObjectives(ageProfileId || null);
  const { data: vocab = [] } = useVocabularyByAge(ageProfileId || null);

  const upsert = useUpsertVocabulary();
  const toggle = useToggleVocabularyActive();

  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vocab.filter((v) => {
      if (themeFilter !== "all" && v.theme_id !== themeFilter) return false;
      if (domainFilter !== "all" && v.domain_id !== domainFilter) return false;
      if (typeFilter !== "all" && v.word_type !== typeFilter) return false;
      if (q) {
        const hay = `${v.english_word ?? ""} ${v.bm_word ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vocab, themeFilter, domainFilter, typeFilter, search]);

  const summary = useMemo(() => summarizeVocabulary(vocab), [vocab]);

  const themeOptionsForAge = useMemo(() => {
    const ageGroup = ageProfiles.find((p) => p.id === ageProfileId)?.age_group;
    if (!ageGroup) return themes;
    return themes.filter((t: any) => !t.age_group || t.age_group === ageGroup);
  }, [themes, ageProfiles, ageProfileId]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const openCreate = () => {
    if (!ageProfileId) return;
    setDraft(emptyDraft(ageProfileId));
    setDialogOpen(true);
  };
  const openEdit = (entry: VocabularyEntry) => {
    setDraft({ ...entry });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft) return;
    const en = (draft.english_word || "").trim();
    const bm = (draft.bm_word || "").trim();
    if (!en && !bm) {
      toast({ title: "Add at least one language", description: "English or BM word is required.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        ...draft,
        english_word: en || null,
        bm_word: bm || null,
      } as any);
      toast({ title: draft.id ? "Vocabulary updated" : "Vocabulary added" });
      setDialogOpen(false);
      setDraft(null);
    } catch (e: any) {
      toast({ title: "Could not save vocabulary", description: e.message, variant: "destructive" });
    }
  };

  if (!canView) {
    return (
      <DashboardLayout>
        <PageHeader title="Vocabulary Matrix" />
        <Alert variant="destructive">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>No access</AlertTitle>
          <AlertDescription>
            You do not have permission to view the Vocabulary Matrix. Ask your administrator to enable the
            <code className="mx-1">curriculum.vocabulary</code> module for your access group.
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <BackToCommandCenter />
      <PageHeader
        title="Vocabulary Matrix"
        subtitle="Bilingual English / BM vocabulary linked to age, theme, domain and objectives. Powers parent home learning and teacher prompts."
      />

      <Alert className="mb-4">
        <Library className="h-4 w-4" />
        <AlertTitle>Foundation module</AlertTitle>
        <AlertDescription>
          This is the master vocabulary bank. Existing Theme Bank vocabulary still drives Parent "This Week at Home"
          and AI lesson generation — switch-over to the matrix will happen in a later sub-batch so nothing breaks today.
        </AlertDescription>
      </Alert>

      {/* Age tabs */}
      <Tabs value={ageProfileId} onValueChange={setAgeProfileId} className="mb-4">
        <TabsList>
          {ageProfiles.map((p: any) => (
            <TabsTrigger key={p.id} value={p.id}>
              Age {p.age_group}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Readiness */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <ReadinessStat label="Total words" value={summary.total} tone="primary" />
        <ReadinessStat label="Active" value={summary.active} />
        <ReadinessStat label="Missing BM word" value={summary.missingBm} warn={summary.missingBm > 0} />
        <ReadinessStat label="Missing parent example" value={summary.missingParentExample} warn={summary.missingParentExample > 0} />
      </div>

      {/* Friendly warnings */}
      {summary.total === 0 && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No vocabulary for this age yet</AlertTitle>
          <AlertDescription>
            Add a few starter words below. Aim for at least one bilingual word per theme so parent home learning becomes easier.
          </AlertDescription>
        </Alert>
      )}
      {summary.total > 0 && summary.missingTeacherPrompt > 0 && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{summary.missingTeacherPrompt} word{summary.missingTeacherPrompt === 1 ? "" : "s"} missing teacher prompt</AlertTitle>
          <AlertDescription>
            Add teacher prompts so teachers know how to use each word during activities.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <SectionCard title="Vocabulary list" description="Filter by theme, domain, or word type. Search English or BM.">
        <div className="flex items-center justify-end mb-2">
          <Button asChild variant="ghost" size="sm">
            <a href="/docs/vocabulary-matrix-import-template.csv" download>
              <Download className="h-3 w-3 mr-1" /> CSV import template
            </a>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 mb-4">
          <Input placeholder="Search English / BM…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={themeFilter} onValueChange={setThemeFilter}>
            <SelectTrigger><SelectValue placeholder="All themes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All themes</SelectItem>
              {themeOptionsForAge.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.theme_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger><SelectValue placeholder="All domains" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {domains.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="All word types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All word types</SelectItem>
              {WORD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} disabled={!canManage || !ageProfileId}>
            <Plus className="h-4 w-4 mr-1" /> Add vocabulary
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No vocabulary matches the current filters.</p>
        ) : (
          <div className="grid gap-2">
            {filtered.map((v) => {
              const theme = themes.find((t: any) => t.id === v.theme_id);
              const domain = domains.find((d: any) => d.id === v.domain_id);
              return (
                <Card key={v.id} className={v.active_status ? "" : "opacity-60"}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="font-semibold">{v.english_word || <span className="italic text-muted-foreground">no English</span>}</p>
                          <span className="text-muted-foreground text-sm">·</span>
                          <p className="text-sm">{v.bm_word || <span className="italic text-muted-foreground">no BM word</span>}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="outline" className="text-[10px]">{WORD_TYPES.find((t) => t.value === v.word_type)?.label}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{VOCAB_LEVELS.find((l) => l.value === v.vocabulary_level)?.label}</Badge>
                          {theme && <Badge variant="outline" className="text-[10px]">{(theme as any).theme_name}</Badge>}
                          {domain && <Badge variant="outline" className="text-[10px]">{(domain as any).name}</Badge>}
                          {!v.active_status && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                        </div>
                        {(v.parent_example_sentence_en || v.parent_example_sentence_bm) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            <strong>Parent:</strong> {v.parent_example_sentence_en || v.parent_example_sentence_bm}
                          </p>
                        )}
                        {(v.teacher_prompt_en || v.teacher_prompt_bm) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <strong>Teacher:</strong> {v.teacher_prompt_en || v.teacher_prompt_bm}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)} disabled={!canManage}>
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Switch
                            checked={v.active_status}
                            onCheckedChange={(checked) => toggle.mutate({ id: v.id, active_status: checked })}
                            disabled={!canManage}
                          />
                          Active
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Edit / create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setDraft(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit vocabulary" : "Add vocabulary"}</DialogTitle>
            <DialogDescription>
              At least one language is required. Add both English and BM where possible so home learning stays bilingual.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>English word</Label>
                  <Input
                    value={draft.english_word ?? ""}
                    onChange={(e) => setDraft({ ...draft, english_word: e.target.value })}
                    placeholder="e.g. family"
                  />
                </div>
                <div>
                  <Label>BM word</Label>
                  <Input
                    value={draft.bm_word ?? ""}
                    onChange={(e) => setDraft({ ...draft, bm_word: e.target.value })}
                    placeholder="e.g. keluarga"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Word type</Label>
                  <Select
                    value={draft.word_type ?? "theme_word"}
                    onValueChange={(v) => setDraft({ ...draft, word_type: v as WordType })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WORD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vocabulary level</Label>
                  <Select
                    value={draft.vocabulary_level ?? "receptive"}
                    onValueChange={(v) => setDraft({ ...draft, vocabulary_level: v as VocabularyLevel })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VOCAB_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label>Theme</Label>
                  <Select
                    value={draft.theme_id ?? NONE}
                    onValueChange={(v) => setDraft({ ...draft, theme_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="No theme" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No theme</SelectItem>
                      {themeOptionsForAge.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.theme_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Domain</Label>
                  <Select
                    value={draft.domain_id ?? NONE}
                    onValueChange={(v) => setDraft({ ...draft, domain_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="No domain" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No domain</SelectItem>
                      {domains.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Linked objective</Label>
                  <Select
                    value={draft.objective_id ?? NONE}
                    onValueChange={(v) => setDraft({ ...draft, objective_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger><SelectValue placeholder="No objective" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No objective</SelectItem>
                      {objectives.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>{o.parent_title || o.teacher_title || o.objective_code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Parent example (EN)</Label>
                  <Textarea
                    rows={2}
                    value={draft.parent_example_sentence_en ?? ""}
                    onChange={(e) => setDraft({ ...draft, parent_example_sentence_en: e.target.value })}
                    placeholder="e.g. We are a happy family."
                  />
                </div>
                <div>
                  <Label>Parent example (BM)</Label>
                  <Textarea
                    rows={2}
                    value={draft.parent_example_sentence_bm ?? ""}
                    onChange={(e) => setDraft({ ...draft, parent_example_sentence_bm: e.target.value })}
                    placeholder="cth. Kami keluarga yang gembira."
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Teacher prompt (EN)</Label>
                  <Textarea
                    rows={2}
                    value={draft.teacher_prompt_en ?? ""}
                    onChange={(e) => setDraft({ ...draft, teacher_prompt_en: e.target.value })}
                    placeholder="e.g. Ask: who lives in your family?"
                  />
                </div>
                <div>
                  <Label>Teacher prompt (BM)</Label>
                  <Textarea
                    rows={2}
                    value={draft.teacher_prompt_bm ?? ""}
                    onChange={(e) => setDraft({ ...draft, teacher_prompt_bm: e.target.value })}
                    placeholder="cth. Tanya: siapa di dalam keluarga kamu?"
                  />
                </div>
              </div>

              <div>
                <Label>Activity context (optional)</Label>
                <Input
                  value={draft.activity_context ?? ""}
                  onChange={(e) => setDraft({ ...draft, activity_context: e.target.value })}
                  placeholder="e.g. Use during circle time discussion"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={!!draft.active_status}
                  onCheckedChange={(checked) => setDraft({ ...draft, active_status: checked })}
                />
                <Label>Active</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canManage || upsert.isPending}>
              {draft?.id ? "Save changes" : "Add vocabulary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function ReadinessStat({ label, value, warn, tone }: { label: string; value: number; warn?: boolean; tone?: "primary" }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${warn ? "text-destructive" : tone === "primary" ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}