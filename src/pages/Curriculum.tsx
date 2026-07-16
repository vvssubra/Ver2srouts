import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, ChevronRight, ChevronDown, BookOpen, Layers, FileText, Minus,
  Plus, Pencil, Trash2, Filter, Upload, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ─── Types ───
interface LearningArea {
  id: string;
  code: string;
  name_ms: string;
  name_en: string | null;
  description_ms: string | null;
  sort_order: number;
}

interface CurriculumStandard {
  id: string;
  learning_area_id: string;
  parent_id: string | null;
  code: string;
  level: "skill" | "standard" | "sub_standard";
  title_ms: string;
  title_en: string | null;
  description_ms: string | null;
  notes: string | null;
  sort_order: number;
}

// ─── Constants ───
const levelIcons = { skill: Layers, standard: FileText, sub_standard: Minus };
const levelColors: Record<string, string> = {
  skill: "bg-primary/10 text-primary border-primary/20",
  standard: "bg-accent/10 text-accent border-accent/20",
  sub_standard: "bg-muted text-muted-foreground border-border",
};
const areaColorMap: Record<string, string> = {
  SE: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
  FK: "from-green-500/10 to-green-500/5 border-green-500/20",
  KNK: "from-purple-500/10 to-purple-500/5 border-purple-500/20",
  BL: "from-blue-500/10 to-blue-500/5 border-blue-500/20",
  KG: "from-rose-500/10 to-rose-500/5 border-rose-500/20",
  KE: "from-teal-500/10 to-teal-500/5 border-teal-500/20",
};
const areaBadgeColor: Record<string, string> = {
  SE: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  FK: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  KNK: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  BL: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  KG: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  KE: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
};

// ─── Helpers ───
function getDescendantIds(id: string, standards: CurriculumStandard[]): Set<string> {
  const result = new Set<string>();
  const children = standards.filter((s) => s.parent_id === id);
  for (const child of children) {
    result.add(child.id);
    for (const gid of getDescendantIds(child.id, standards)) result.add(gid);
  }
  return result;
}

// ─── Standard Form ───
interface StandardFormData {
  code: string; title_ms: string; title_en: string; description_ms: string;
  notes: string; level: "skill" | "standard" | "sub_standard";
  parent_id: string | null; sort_order: string;
}
const emptyStandardForm: StandardFormData = {
  code: "", title_ms: "", title_en: "", description_ms: "", notes: "",
  level: "skill", parent_id: null, sort_order: "0",
};

function StandardFormDialog({
  open, onOpenChange, initial, standards, onSubmit, isPending, title,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: StandardFormData;
  standards: CurriculumStandard[]; onSubmit: (form: StandardFormData) => void;
  isPending: boolean; title: string;
}) {
  const [form, setForm] = useState(initial);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) setForm(initial);
  if (open !== prevOpen) setPrevOpen(open);

  const potentialParents = standards.filter((s) => {
    if (form.level === "standard") return s.level === "skill";
    if (form.level === "sub_standard") return s.level === "standard";
    return false;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Fill in the curriculum standard details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Level *</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as any, parent_id: null })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skill">Kemahiran (Skill)</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="sub_standard">Sub-Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SE K1" />
            </div>
          </div>
          {form.level !== "skill" && (
            <div>
              <Label>Parent {form.level === "standard" ? "(Skill)" : "(Standard)"} *</Label>
              <Select value={form.parent_id || ""} onValueChange={(v) => setForm({ ...form, parent_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
                <SelectContent>
                  {potentialParents.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.title_ms}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Title (BM) *</Label><Input value={form.title_ms} onChange={(e) => setForm({ ...form, title_ms: e.target.value })} /></div>
          <div><Label>Title (EN)</Label><Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} /></div>
          <div><Label>Description (BM)</Label><Textarea value={form.description_ms} onChange={(e) => setForm({ ...form, description_ms: e.target.value })} rows={2} /></div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!form.code || !form.title_ms || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Standard Tree Node ───
function StandardNode({
  standard, allStandards, matchIds, depth, isAdmin, onEdit, onDelete, onAddChild,
}: {
  standard: CurriculumStandard; allStandards: CurriculumStandard[];
  matchIds: Set<string> | null; depth: number; isAdmin: boolean;
  onEdit: (s: CurriculumStandard) => void; onDelete: (s: CurriculumStandard) => void;
  onAddChild: (parentId: string, level: "standard" | "sub_standard") => void;
}) {
  const [expanded, setExpanded] = useState(
    standard.level === "skill" || (matchIds !== null && matchIds.has(standard.id))
  );
  const directChildren = allStandards
    .filter((c) => c.parent_id === standard.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const visibleChildren = matchIds
    ? directChildren.filter((c) => matchIds.has(c.id))
    : directChildren;
  const hasChildren = visibleChildren.length > 0;
  const Icon = levelIcons[standard.level];
  const canAddChild = standard.level !== "sub_standard";
  const childLevel = standard.level === "skill" ? "standard" : "sub_standard";

  return (
    <div className="group/node">
      <div className="flex items-start gap-1">
        <button
          onClick={() => (hasChildren || canAddChild) && setExpanded(!expanded)}
          className={cn(
            "flex flex-1 items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted/50",
            standard.level === "skill" && "font-semibold",
            standard.level === "sub_standard" && "text-sm",
          )}
        >
          <span className="mt-0.5 shrink-0 text-muted-foreground">
            {hasChildren || canAddChild ? (
              expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : <span className="inline-block w-4" />}
          </span>
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-mono", levelColors[standard.level])}>
                {standard.code}
              </Badge>
              <span className={cn("text-foreground", standard.level === "sub_standard" && "text-muted-foreground")}>
                {standard.title_ms}
              </span>
              {standard.title_en && standard.level !== "sub_standard" && (
                <span className="text-xs text-muted-foreground/60">({standard.title_en})</span>
              )}
            </div>
            {standard.description_ms && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{standard.description_ms}</p>
            )}
            {standard.notes && (
              <p className="mt-1 text-xs text-muted-foreground/60 italic">{standard.notes}</p>
            )}
          </div>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity pt-2 pr-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(standard)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(standard)}>
              <Trash2 className="h-3 w-3" />
            </Button>
            {canAddChild && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setExpanded(true); onAddChild(standard.id, childLevel as any); }}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="ml-6 border-l border-border/50 pl-2">
          {visibleChildren.map((child) => (
            <StandardNode
              key={child.id} standard={child} allStandards={allStandards}
              matchIds={matchIds} depth={depth + 1} isAdmin={isAdmin}
              onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function Curriculum() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "super_admin";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAreaCode, setSelectedAreaCode] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [parseCategory, setParseCategory] = useState("");

  // CRUD dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<StandardFormData>(emptyStandardForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formAreaId, setFormAreaId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CurriculumStandard | null>(null);

  // Learning area dialog
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [areaForm, setAreaForm] = useState({ code: "", name_ms: "", name_en: "", description_ms: "", sort_order: "0" });
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);

  // ─── Queries ───
  const { data: learningAreas = [], isLoading: loadingAreas } = useQuery({
    queryKey: ["learning-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("learning_areas").select("*").order("sort_order");
      if (error) throw error;
      return data as LearningArea[];
    },
  });

  const { data: allStandards = [], isLoading: loadingStandards } = useQuery({
    queryKey: ["all-curriculum-standards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum_standards").select("*").order("sort_order");
      if (error) throw error;
      return data as CurriculumStandard[];
    },
  });

  // ─── Mutations ───
  const createStandardMutation = useMutation({
    mutationFn: async ({ form, areaId }: { form: StandardFormData; areaId: string }) => {
      const { error } = await supabase.from("curriculum_standards").insert({
        learning_area_id: areaId, code: form.code, title_ms: form.title_ms,
        title_en: form.title_en || null, description_ms: form.description_ms || null,
        notes: form.notes || null, level: form.level, parent_id: form.parent_id,
        sort_order: parseInt(form.sort_order) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-curriculum-standards"] });
      setFormOpen(false);
      toast({ title: "Standard created" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStandardMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: StandardFormData }) => {
      const { error } = await supabase.from("curriculum_standards").update({
        code: form.code, title_ms: form.title_ms, title_en: form.title_en || null,
        description_ms: form.description_ms || null, notes: form.notes || null,
        level: form.level, parent_id: form.parent_id, sort_order: parseInt(form.sort_order) || 0,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-curriculum-standards"] });
      setFormOpen(false); setEditingId(null);
      toast({ title: "Standard updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteStandardMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("curriculum_standards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-curriculum-standards"] });
      setDeleteTarget(null);
      toast({ title: "Standard deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveAreaMutation = useMutation({
    mutationFn: async (form: typeof areaForm) => {
      const payload = {
        code: form.code, name_ms: form.name_ms, name_en: form.name_en || null,
        description_ms: form.description_ms || null, sort_order: parseInt(form.sort_order) || 0,
        category: parseCategory || "KP2026",
      };
      if (editingAreaId) {
        const { error } = await supabase.from("learning_areas").update(payload).eq("id", editingAreaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("learning_areas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-areas"] });
      setAreaDialogOpen(false); setEditingAreaId(null);
      toast({ title: editingAreaId ? "Learning area updated" : "Learning area created" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-areas"] });
      toast({ title: "Learning area deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Handlers ───
  const handleAddStandard = (areaId: string, level: "skill" | "standard" | "sub_standard" = "skill", parentId: string | null = null) => {
    setEditingId(null);
    setFormAreaId(areaId);
    setFormInitial({ ...emptyStandardForm, level, parent_id: parentId });
    setFormOpen(true);
  };

  const handleEditStandard = (s: CurriculumStandard) => {
    setEditingId(s.id);
    setFormAreaId(s.learning_area_id);
    setFormInitial({
      code: s.code, title_ms: s.title_ms, title_en: s.title_en || "",
      description_ms: s.description_ms || "", notes: s.notes || "",
      level: s.level, parent_id: s.parent_id, sort_order: String(s.sort_order),
    });
    setFormOpen(true);
  };

  const handleSubmitStandard = (form: StandardFormData) => {
    if (editingId) {
      updateStandardMutation.mutate({ id: editingId, form });
    } else if (formAreaId) {
      createStandardMutation.mutate({ form, areaId: formAreaId });
    }
  };

  const handleEditArea = (area: LearningArea) => {
    setEditingAreaId(area.id);
    setAreaForm({ code: area.code, name_ms: area.name_ms, name_en: area.name_en || "", description_ms: area.description_ms || "", sort_order: String(area.sort_order) });
    setAreaDialogOpen(true);
  };

  const handleAddArea = () => {
    setEditingAreaId(null);
    setAreaForm({ code: "", name_ms: "", name_en: "", description_ms: "", sort_order: String(learningAreas.length) });
    setAreaDialogOpen(true);
  };

  // ─── Derived data ───
  const matchIds = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    const areaFiltered = selectedAreaCode
      ? allStandards.filter((s) => {
          const area = learningAreas.find((a) => a.code === selectedAreaCode);
          return area && s.learning_area_id === area.id;
        })
      : allStandards;
    const directMatches = areaFiltered.filter(
      (s) => s.code.toLowerCase().includes(term) || s.title_ms.toLowerCase().includes(term) ||
        (s.title_en && s.title_en.toLowerCase().includes(term)) ||
        (s.description_ms && s.description_ms.toLowerCase().includes(term))
    );
    const ids = new Set<string>();
    for (const m of directMatches) {
      ids.add(m.id);
      for (const did of getDescendantIds(m.id, areaFiltered)) ids.add(did);
      let current: CurriculumStandard | undefined = m;
      while (current?.parent_id) {
        ids.add(current.parent_id);
        current = areaFiltered.find((s) => s.id === current!.parent_id);
      }
    }
    return ids;
  }, [searchTerm, allStandards, selectedAreaCode, learningAreas]);

  const groupedByArea = useMemo(() => {
    const areas = selectedAreaCode
      ? learningAreas.filter((a) => a.code === selectedAreaCode)
      : learningAreas;
    return areas.map((area) => {
      const areaStandards = allStandards.filter((s) => s.learning_area_id === area.id);
      const rootSkills = areaStandards.filter((s) => s.level === "skill" && !s.parent_id).sort((a, b) => a.sort_order - b.sort_order);
      if (matchIds) {
        const hasMatch = areaStandards.some((s) => matchIds.has(s.id));
        if (!hasMatch) return null;
      }
      return { area, standards: areaStandards, rootSkills };
    }).filter(Boolean) as { area: LearningArea; standards: CurriculumStandard[]; rootSkills: CurriculumStandard[] }[];
  }, [learningAreas, allStandards, selectedAreaCode, matchIds]);

  const stats = useMemo(() => {
    const displayed = selectedAreaCode
      ? allStandards.filter((s) => {
          const area = learningAreas.find((a) => a.code === selectedAreaCode);
          return area && s.learning_area_id === area.id;
        })
      : allStandards;
    return {
      skills: displayed.filter((s) => s.level === "skill").length,
      standards: displayed.filter((s) => s.level === "standard").length,
      sub_standards: displayed.filter((s) => s.level === "sub_standard").length,
    };
  }, [allStandards, selectedAreaCode, learningAreas]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Kurikulum KP2026 / Curriculum
            </h1>
            <p className="text-muted-foreground mt-1">
              Explore the KP2026 curriculum standards across all 6 learning areas
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf,.txt,.docx";
                  input.onchange = async (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingDoc(true);
                    try {
                      const text = await file.text();
                      const category = prompt("Enter category name for this curriculum (e.g., KP2026, Public Speaking, Enrichment):", "Custom");
                      setParseCategory(category || "Custom");
                      const { data, error } = await supabase.functions.invoke("parse-curriculum-document", {
                        body: { documentText: text, category: category || "Custom" },
                      });
                      if (error) throw error;
                      setParsedResult(data);
                      toast({ title: "Document parsed!", description: `Found ${data.learning_areas?.length || 0} learning areas` });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    } finally {
                      setUploadingDoc(false);
                    }
                  };
                  input.click();
                }}>
                  {uploadingDoc ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                  Upload Standard
                </Button>
                <Button size="sm" onClick={handleAddArea}><Plus className="h-4 w-4 mr-1" />Add Learning Area</Button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.skills}</p>
                <p className="text-xs text-muted-foreground">Kemahiran</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.standards}</p>
                <p className="text-xs text-muted-foreground">Standard</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Minus className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.sub_standards}</p>
                <p className="text-xs text-muted-foreground">Sub-Standard</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari standard, kemahiran, atau kod... / Search standards, skills, or codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Badge
              variant={selectedAreaCode === null ? "default" : "outline"}
              className="cursor-pointer transition-colors px-3 py-1.5"
              onClick={() => setSelectedAreaCode(null)}
            >
              <Filter className="h-3 w-3 mr-1" />
              Semua
            </Badge>
            {learningAreas.map((area) => (
              <Badge
                key={area.id}
                variant={selectedAreaCode === area.code ? "default" : "outline"}
                className={cn(
                  "cursor-pointer transition-colors px-3 py-1.5",
                  selectedAreaCode !== area.code && areaBadgeColor[area.code]
                )}
                onClick={() => setSelectedAreaCode(selectedAreaCode === area.code ? null : area.code)}
              >
                {area.code}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tree View */}
        {loadingAreas || loadingStandards ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Loading curriculum data...</CardContent></Card>
        ) : groupedByArea.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {searchTerm ? "Tiada hasil carian / No search results found" : "No curriculum data available"}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {groupedByArea.map(({ area, standards: areaStandards, rootSkills }) => (
              <Card
                key={area.id}
                className={cn("border bg-gradient-to-br overflow-hidden", areaColorMap[area.code] || "from-muted to-muted/50")}
              >
                <div className="px-4 pt-4 pb-2 flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className={cn("text-sm font-bold px-3 py-1", areaBadgeColor[area.code])}>
                    {area.code}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-foreground">{area.name_ms}</h2>
                    {area.name_en && <p className="text-xs text-muted-foreground">{area.name_en}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Badge variant="secondary" className="text-[10px]">
                      {areaStandards.filter((s) => s.level === "skill").length} kemahiran
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {areaStandards.filter((s) => s.level === "standard").length} standard
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {areaStandards.filter((s) => s.level === "sub_standard").length} sub-standard
                    </Badge>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditArea(area)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAreaMutation.mutate(area.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAddStandard(area.id, "skill")}>
                          <Plus className="h-3 w-3 mr-1" />Add
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <ScrollArea className="max-h-[600px]">
                  <div className="px-2 pb-3">
                    {rootSkills.length > 0 ? (
                      rootSkills
                        .filter((s) => !matchIds || matchIds.has(s.id))
                        .map((skill) => (
                          <StandardNode
                            key={skill.id} standard={skill} allStandards={areaStandards}
                            matchIds={matchIds} depth={0} isAdmin={isAdmin}
                            onEdit={handleEditStandard} onDelete={setDeleteTarget}
                            onAddChild={(parentId, level) => handleAddStandard(area.id, level, parentId)}
                          />
                        ))
                    ) : (
                      <p className="text-sm text-muted-foreground px-3 py-2">
                        No standards seeded yet for this area.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Standard Add/Edit Dialog */}
      {formAreaId && (
        <StandardFormDialog
          open={formOpen}
          onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingId(null); }}
          initial={formInitial}
          standards={allStandards.filter((s) => s.learning_area_id === formAreaId)}
          onSubmit={handleSubmitStandard}
          isPending={createStandardMutation.isPending || updateStandardMutation.isPending}
          title={editingId ? "Edit Standard" : "Add Standard"}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.title_ms}" and all its child standards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteStandardMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Learning Area Dialog */}
      <Dialog open={areaDialogOpen} onOpenChange={setAreaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAreaId ? "Edit Learning Area" : "Add Learning Area"}</DialogTitle>
            <DialogDescription>Configure the learning area details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Code *</Label><Input value={areaForm.code} onChange={(e) => setAreaForm({ ...areaForm, code: e.target.value })} placeholder="e.g. FK" /></div>
              <div><Label>Sort Order</Label><Input type="number" value={areaForm.sort_order} onChange={(e) => setAreaForm({ ...areaForm, sort_order: e.target.value })} /></div>
            </div>
            <div><Label>Name (BM) *</Label><Input value={areaForm.name_ms} onChange={(e) => setAreaForm({ ...areaForm, name_ms: e.target.value })} /></div>
            <div><Label>Name (EN)</Label><Input value={areaForm.name_en} onChange={(e) => setAreaForm({ ...areaForm, name_en: e.target.value })} /></div>
            <div><Label>Description (BM)</Label><Textarea value={areaForm.description_ms} onChange={(e) => setAreaForm({ ...areaForm, description_ms: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveAreaMutation.mutate(areaForm)} disabled={!areaForm.code || !areaForm.name_ms || saveAreaMutation.isPending}>
              {saveAreaMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
