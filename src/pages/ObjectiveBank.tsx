import { useState, useRef, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Loader2, Target, Plus, Pencil, Trash2, ChevronRight, GraduationCap, X, Sparkles, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Grid3X3, List } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "core", label: "Core" },
  { value: "support", label: "Support" },
  { value: "stretch", label: "Stretch" },
];

const TERM_OPTIONS = [
  { value: "1", label: "Term 1" },
  { value: "2", label: "Term 2" },
  { value: "3", label: "Term 3" },
  { value: "4", label: "Term 4" },
];

const EVIDENCE_OPTIONS = [
  { value: "observation", label: "Observation" },
  { value: "work_sample", label: "Work Sample" },
  { value: "verbal", label: "Verbal Response" },
  { value: "photo", label: "Photo Evidence" },
  { value: "checklist", label: "Checklist" },
];

export default function ObjectiveBank() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = role === "super_admin" || role === "admin" || role === "franchisee";

  const [activeTab, setActiveTab] = useState("matrix");
  const [ageFilter, setAgeFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [termFilter, setTermFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedObjective, setSelectedObjective] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingObj, setEditingObj] = useState<any>(null);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [aiAgeGroup, setAiAgeGroup] = useState("");
  const [aiDomain, setAiDomain] = useState("");
  const [aiOutcomeId, setAiOutcomeId] = useState("");

  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => {
    if (selectedIds.size === objectives.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(objectives.map((o: any) => o.id)));
  };

  // Matrix cell click state
  const [matrixPreFill, setMatrixPreFill] = useState<{ outcomeId: string; term: number } | null>(null);

  // Form state
  const [form, setForm] = useState({
    code: "", title: "", description: "", age_group_id: "", domain_id: "",
    learning_area: "", yearly_outcome_id: "", objective_type: "core", term: "" as string,
  });
  const [formIndicators, setFormIndicators] = useState<{ text: string; evidence_type: string }[]>([]);
  const [newIndText, setNewIndText] = useState("");
  const [newIndEvidence, setNewIndEvidence] = useState("");

  // Indicator form (detail drawer)
  const [indicatorText, setIndicatorText] = useState("");
  const [indicatorEvidence, setIndicatorEvidence] = useState("");

  const { data: ageGroups = [] } = useQuery({
    queryKey: ["age-groups-canonical"],
    queryFn: async () => {
      const { data } = await supabase.from("age_groups").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: learningAreas = [] } = useQuery({
    queryKey: ["learning-areas-obj"],
    queryFn: async () => {
      const { data } = await supabase.from("learning_areas").select("id, code, name_ms, name_en").order("sort_order");
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

  const { data: yearlyOutcomes = [] } = useQuery({
    queryKey: ["yearly-outcomes-all"],
    queryFn: async () => {
      const { data } = await supabase.from("yearly_outcomes").select("*, age_groups(label), development_domains(name, id)").order("outcome_code");
      return data ?? [];
    },
  });

  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ["lesson-objectives", ageFilter, domainFilter, typeFilter, termFilter, searchTerm],
    queryFn: async () => {
      let q = supabase
        .from("lesson_objectives")
        .select("*, age_groups!inner(code, label), development_domains!inner(name, code), yearly_outcomes(outcome_code, outcome_title)")
        .eq("is_active", true)
        .order("code");
      if (ageFilter !== "all") q = q.eq("age_group_id", ageFilter);
      if (domainFilter !== "all") q = q.eq("domain_id", domainFilter);
      if (typeFilter !== "all") q = q.eq("objective_type", typeFilter);
      if (termFilter !== "all") q = q.eq("term", parseInt(termFilter));
      if (searchTerm.trim()) q = q.or(`title.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Unfiltered objectives for matrix counts (only filtered by age group)
  const { data: matrixObjectives = [] } = useQuery({
    queryKey: ["lesson-objectives-matrix", ageFilter],
    queryFn: async () => {
      if (ageFilter === "all") return [];
      let q = supabase
        .from("lesson_objectives")
        .select("id, yearly_outcome_id, term, title, code")
        .eq("is_active", true)
        .eq("age_group_id", ageFilter);
      const { data } = await q;
      return data ?? [];
    },
    enabled: ageFilter !== "all",
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ["objective-indicators", selectedObjective?.id],
    queryFn: async () => {
      const { data } = await supabase.from("objective_indicators").select("*")
        .eq("lesson_objective_id", selectedObjective.id).order("sort_order");
      return data ?? [];
    },
    enabled: !!selectedObjective?.id,
  });

  const resetForm = () => {
    setForm({ code: "", title: "", description: "", age_group_id: "", domain_id: "", learning_area: "", yearly_outcome_id: "", objective_type: "core", term: "" });
    setFormIndicators([]);
    setNewIndText("");
    setNewIndEvidence("");
    setEditingObj(null);
    setMatrixPreFill(null);
  };

  const openCreate = (preFill?: { outcomeId: string; term: number; ageGroupId?: string; domainId?: string }) => {
    resetForm();
    if (preFill) {
      setMatrixPreFill(preFill);
      setForm(f => ({
        ...f,
        yearly_outcome_id: preFill.outcomeId,
        term: String(preFill.term),
        age_group_id: preFill.ageGroupId || "",
        domain_id: preFill.domainId || "",
      }));
    }
    setShowForm(true);
  };

  const openEdit = async (obj: any) => {
    setEditingObj(obj);
    setForm({
      code: obj.code || "", title: obj.title || "", description: obj.description || "",
      age_group_id: obj.age_group_id || "", domain_id: obj.domain_id || "",
      learning_area: obj.learning_area || "", yearly_outcome_id: obj.yearly_outcome_id || "",
      objective_type: obj.objective_type || "core",
      term: obj.term ? String(obj.term) : "",
    });
    // Load existing indicators for editing
    const { data: existingInds } = await supabase.from("objective_indicators").select("indicator_text, evidence_type").eq("lesson_objective_id", obj.id).order("sort_order");
    setFormIndicators((existingInds || []).map((ind: any) => ({ text: ind.indicator_text, evidence_type: ind.evidence_type || "" })));
    setNewIndText("");
    setNewIndEvidence("");
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: form.code, title: form.title, description: form.description || null,
        age_group_id: form.age_group_id, domain_id: form.domain_id,
        learning_area: form.learning_area || "", yearly_outcome_id: form.yearly_outcome_id || null,
        objective_type: form.objective_type,
        term: form.term ? parseInt(form.term) : null,
      };
      let objectiveId: string;
      if (editingObj?.id) {
        const { error } = await supabase.from("lesson_objectives").update(payload).eq("id", editingObj.id);
        if (error) throw error;
        objectiveId = editingObj.id;
        // Replace indicators: delete old, insert new
        await supabase.from("objective_indicators").delete().eq("lesson_objective_id", objectiveId);
      } else {
        const { data: inserted, error } = await supabase.from("lesson_objectives").insert(payload).select("id").single();
        if (error) throw error;
        objectiveId = inserted.id;
      }
      // Insert indicators
      if (formIndicators.length > 0) {
        const indRows = formIndicators.map((ind, idx) => ({
          lesson_objective_id: objectiveId,
          indicator_text: ind.text,
          evidence_type: ind.evidence_type || null,
          sort_order: idx + 1,
        }));
        const { error: indErr } = await supabase.from("objective_indicators").insert(indRows as any);
        if (indErr) throw indErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["objective-indicators"] });
      setShowForm(false); resetForm();
      toast({ title: "Term objective saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("objective_indicators").delete().eq("lesson_objective_id", id);
      const { error } = await supabase.from("lesson_objectives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives-matrix"] });
      toast({ title: "Objective deleted" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("objective_indicators").delete().in("lesson_objective_id", ids);
      const { error } = await supabase.from("lesson_objectives").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives"] });
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives-matrix"] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} objectives deleted` });
    },
  });

  const addIndicatorMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("objective_indicators").insert({
        lesson_objective_id: selectedObjective.id,
        indicator_text: indicatorText,
        evidence_type: indicatorEvidence || null,
        sort_order: indicators.length + 1,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objective-indicators"] });
      setIndicatorText(""); setIndicatorEvidence("");
      toast({ title: "Indicator added" });
    },
  });

  const deleteIndicatorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("objective_indicators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objective-indicators"] });
      toast({ title: "Indicator removed" });
    },
  });

  // AI Brainstorm
  const aiBrainstormMutation = useMutation({
    mutationFn: async () => {
      if (!aiAgeGroup || !aiDomain) throw new Error("Select age group and domain");
      const { data, error } = await supabase.functions.invoke("brainstorm-objectives", {
        body: { age_group_id: aiAgeGroup, domain_id: aiDomain, yearly_outcome_id: aiOutcomeId || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setAiSuggestions(data.objectives || []);
      setSelectedSuggestions(new Set(data.objectives?.map((_: any, i: number) => i) || []));
    },
    onError: (e: any) => toast({ title: "AI Error", description: e.message, variant: "destructive" }),
  });

  const addAiObjectivesMutation = useMutation({
    mutationFn: async () => {
      const toAdd = aiSuggestions.filter((_: any, i: number) => selectedSuggestions.has(i));
      if (toAdd.length === 0) throw new Error("No objectives selected");
      for (const s of toAdd) {
        const { data: inserted, error } = await supabase.from("lesson_objectives").insert({
          code: s.code, title: s.title, description: s.description || null,
          age_group_id: aiAgeGroup, domain_id: aiDomain,
          learning_area: s.learning_area || "", yearly_outcome_id: aiOutcomeId || null,
          objective_type: s.objective_type,
        } as any).select("id").single();
        if (error) throw error;
        if (inserted && s.indicators?.length > 0) {
          const indRows = s.indicators.map((ind: any, idx: number) => ({
            lesson_objective_id: inserted.id,
            indicator_text: ind.indicator_text,
            evidence_type: ind.evidence_type || null,
            sort_order: idx + 1,
          }));
          await supabase.from("objective_indicators").insert(indRows as any);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives"] });
      setShowAiDialog(false); setAiSuggestions([]);
      toast({ title: `${selectedSuggestions.size} objectives added with indicators! ✨` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleAiSuggestion = (idx: number) => {
    setSelectedSuggestions(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  };

  const filteredOutcomes = yearlyOutcomes.filter((yo: any) => {
    if (form.age_group_id && yo.age_group_id !== form.age_group_id) return false;
    if (form.domain_id && yo.domain_id !== form.domain_id) return false;
    return true;
  });

  const aiFilteredOutcomes = yearlyOutcomes.filter((yo: any) => {
    if (aiAgeGroup && yo.age_group_id !== aiAgeGroup) return false;
    if (aiDomain && yo.domain_id !== aiDomain) return false;
    return true;
  });

  const typeBadge = (t: string) => {
    const cls = t === "core" ? "bg-primary/10 text-primary" : t === "stretch" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground";
    return <Badge variant="outline" className={cls}>{t}</Badge>;
  };

  // ─── Matrix data computation ───
  const matrixAgeFilter = ageFilter;
  const matrixOutcomes = useMemo(() => {
    if (matrixAgeFilter === "all") return yearlyOutcomes;
    return yearlyOutcomes.filter((yo: any) => yo.age_group_id === matrixAgeFilter);
  }, [yearlyOutcomes, matrixAgeFilter]);

  const matrixDomainFilter = domainFilter;
  const filteredMatrixOutcomes = useMemo(() => {
    if (matrixDomainFilter === "all") return matrixOutcomes;
    return matrixOutcomes.filter((yo: any) => yo.domain_id === matrixDomainFilter);
  }, [matrixOutcomes, matrixDomainFilter]);

  // Group by domain
  const groupedOutcomes = useMemo(() => {
    const groups: Record<string, { domainName: string; domainId: string; outcomes: any[] }> = {};
    for (const yo of filteredMatrixOutcomes) {
      const dName = yo.development_domains?.name || "Unknown";
      const dId = yo.domain_id || yo.development_domains?.id || "";
      if (!groups[dId]) groups[dId] = { domainName: dName, domainId: dId, outcomes: [] };
      groups[dId].outcomes.push(yo);
    }
    return Object.values(groups);
  }, [filteredMatrixOutcomes]);

  // Build a map: outcomeId -> term -> list of objective titles
  const objectiveTitleMap = useMemo(() => {
    const map: Record<string, Record<number, { id: string; title: string; code: string }[]>> = {};
    for (const obj of matrixObjectives) {
      const oId = (obj as any).yearly_outcome_id;
      if (!oId) continue;
      const t = (obj as any).term || 0;
      if (!map[oId]) map[oId] = {};
      if (!map[oId][t]) map[oId][t] = [];
      map[oId][t].push({ id: (obj as any).id, title: (obj as any).title || "", code: (obj as any).code || "" });
    }
    return map;
  }, [matrixObjectives]);

  const getCount = (outcomeId: string, term: number) => objectiveTitleMap[outcomeId]?.[term]?.length || 0;
  const getObjectives = (outcomeId: string, term: number) => objectiveTitleMap[outcomeId]?.[term] || [];
  const getTotalForOutcome = (outcomeId: string) => {
    const terms = objectiveTitleMap[outcomeId];
    if (!terms) return 0;
    return Object.values(terms).reduce((s, arr) => s + arr.length, 0);
  };

  // Coverage stats per domain
  const domainCoverage = useMemo(() => {
    return groupedOutcomes.map(g => {
      const total = g.outcomes.length;
      const covered = g.outcomes.filter(yo => getTotalForOutcome(yo.id) > 0).length;
      return { domainName: g.domainName, total, covered, pct: total > 0 ? Math.round((covered / total) * 100) : 0 };
    });
  }, [groupedOutcomes, objectiveTitleMap]);

  // Proper CSV line parser that handles quoted fields with commas
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current.trim()); current = ""; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  };

  // CSV parsing
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setCsvErrors(["File must have a header row and at least one data row"]); return; }
      let headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, "").trim());
      // Map column aliases to expected names
      const aliasMap: Record<string, string> = {
        objective_code: "code", objective_title: "title", indicator_no: "indicator_no",
        evidence_guide: "evidence_guide", outcome_code: "learning_goal", outcome_title: "outcome_title",
      };
      headers = headers.map(h => aliasMap[h] || h);
      const requiredHeaders = ["code", "title", "age_group", "domain"];
      const missing = requiredHeaders.filter(h => !headers.includes(h));
      if (missing.length > 0) { setCsvErrors([`Missing required columns: ${missing.join(", ")}. Required: code, title, age_group, domain`]); return; }
      const warnings: string[] = [];
      // Parse all raw rows first
      const rawRows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
        row._row = i + 1;
        rawRows.push(row);
      }
      // Group rows by objective code (CSV may have one row per indicator)
      const grouped = new Map<string, any[]>();
      for (const row of rawRows) {
        const key = row.code || `__empty_${row._row}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
      }
      const rows: any[] = [];
      for (const [, group] of grouped) {
        const first = group[0];
        if (!first.code || !first.title || !first.age_group || !first.domain) {
          warnings.push(`Row ${first._row}: missing required field (code, title, age_group, or domain)`);
        }
        const matchedAge = ageGroups.find((ag: any) => ag.label.toLowerCase() === first.age_group?.toLowerCase() || ag.code?.toLowerCase() === first.age_group?.toLowerCase() || ag.label.replace(/[^0-9]/g, "") === first.age_group?.trim());
        const matchedDomain = domains.find((d: any) => d.name.toLowerCase() === first.domain?.toLowerCase() || d.code?.toLowerCase() === first.domain?.toLowerCase());
        if (first.age_group && !matchedAge) warnings.push(`Row ${first._row}: unknown age group "${first.age_group}". Use: 1, 2, 3, 4, 5, 6`);
        if (first.domain && !matchedDomain) warnings.push(`Row ${first._row}: unknown domain "${first.domain}". Use: CL, EL, NT, PM, SE, CD, VC`);
        const lgValue = first.learning_goal || first.yearly_outcome || "";
        let matchedOutcome: any = null;
        if (lgValue) {
          matchedOutcome = yearlyOutcomes.find((yo: any) =>
            yo.outcome_code?.toLowerCase() === lgValue.toLowerCase() ||
            yo.outcome_title?.toLowerCase() === lgValue.toLowerCase()
          );
          if (!matchedOutcome) {
            matchedOutcome = yearlyOutcomes.find((yo: any) => yo.outcome_code?.toLowerCase().includes(lgValue.toLowerCase()));
          }
          if (!matchedOutcome && matchedAge) {
            matchedOutcome = yearlyOutcomes.find((yo: any) =>
              yo.age_group_id === matchedAge.id && (
                yo.outcome_code?.toLowerCase().includes(lgValue.toLowerCase()) ||
                yo.outcome_title?.toLowerCase().includes(lgValue.toLowerCase())
              )
            );
          }
          if (!matchedOutcome) warnings.push(`Row ${first._row}: could not match learning goal "${lgValue}" (will import without link)`);
        }
        // Collect indicators from grouped rows
        const parsedIndicators: string[] = [];
        const parsedEvidence: string[] = [];
        for (const r of group) {
          const indText = r.indicators || "";
          const evType = r.evidence_type || r.evidence_types || "";
          if (indText) {
            parsedIndicators.push(indText.trim());
            parsedEvidence.push(evType.trim());
          }
        }
        // Also handle pipe-separated format in single row
        if (parsedIndicators.length === 0 && first.indicators) {
          parsedIndicators.push(...first.indicators.split("|").map((t: string) => t.trim()).filter(Boolean));
          if (first.evidence_types) parsedEvidence.push(...first.evidence_types.split("|").map((t: string) => t.trim()).filter(Boolean));
        }
        rows.push({
          ...first, _age_group_id: matchedAge?.id, _domain_id: matchedDomain?.id,
          _outcome_id: matchedOutcome?.id || null, _outcome_code: matchedOutcome?.outcome_code || lgValue || "",
          _indicators: parsedIndicators, _evidence_types: parsedEvidence, _row: first._row,
        });
      }
      setCsvErrors(warnings);
      setCsvData(rows);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const csvUploadMutation = useMutation({
    mutationFn: async () => {
      const valid = csvData.filter(r => r._age_group_id && r._domain_id && r.code && r.title);
      if (valid.length === 0) throw new Error("No valid rows to import");
      let importedCount = 0;
      for (const r of valid) {
        const row = {
          code: r.code,
          title: r.title,
          description: r.description || null,
          age_group_id: r._age_group_id,
          domain_id: r._domain_id,
          learning_area: r.learning_area || "",
          objective_type: r.type?.toLowerCase() || "core",
          term: r.term ? parseInt(r.term) : null,
          yearly_outcome_id: r._outcome_id || null,
          is_active: true,
        };
        let objectiveId: string;
        const { data: existing } = await supabase
          .from("lesson_objectives")
          .select("id")
          .eq("code", r.code)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase.from("lesson_objectives").update(row as any).eq("id", existing.id);
          if (error) throw error;
          objectiveId = existing.id;
          // Clear old indicators before re-inserting
          await supabase.from("objective_indicators").delete().eq("lesson_objective_id", objectiveId);
        } else {
          const { data: inserted, error } = await supabase.from("lesson_objectives").insert(row as any).select("id").single();
          if (error) throw error;
          objectiveId = inserted.id;
        }
        // Insert indicators from CSV
        const inds: string[] = r._indicators || [];
        const evTypes: string[] = r._evidence_types || [];
        if (inds.length > 0) {
          const evMap: Record<string, string> = { "observation": "observation", "photo evidence": "photo", "verbal response": "verbal", "work sample": "work_sample", "checklist": "checklist" };
          const indRows = inds.map((text: string, idx: number) => ({
            lesson_objective_id: objectiveId,
            indicator_text: text,
            evidence_type: evMap[(evTypes[idx] || "").toLowerCase()] || evTypes[idx] || null,
            sort_order: idx + 1,
          }));
          await supabase.from("objective_indicators").insert(indRows as any);
        }
        importedCount++;
      }
      return valid.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["lesson-objectives"] });
      setShowCsvDialog(false);
      setCsvData([]);
      setCsvErrors([]);
      toast({ title: `${count} objectives imported successfully! 🎉` });
    },
    onError: (e: any) => toast({ title: "Import Error", description: e.message, variant: "destructive" }),
  });

  // ─── Render ───
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Term Objectives
            </h1>
            <p className="text-muted-foreground">
              Map specific, measurable objectives to yearly learning goals across each term.
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button onClick={() => { setCsvData([]); setCsvErrors([]); setCsvFileName(""); setShowCsvDialog(true); }} variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1" /> CSV Upload
              </Button>
              <Button onClick={() => { setAiAgeGroup(ageFilter !== "all" ? ageFilter : ""); setAiDomain(domainFilter !== "all" ? domainFilter : ""); setAiOutcomeId(""); setAiSuggestions([]); setShowAiDialog(true); }} variant="outline" size="sm">
                <Sparkles className="h-4 w-4 mr-1" /> AI Suggest
              </Button>
              <Button onClick={() => openCreate()} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Objective
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
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
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={termFilter} onValueChange={setTermFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Terms</SelectItem>
                    {TERM_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Search</Label>
                <Input placeholder="Code or title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Matrix + List */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="matrix" className="gap-1.5"><Grid3X3 className="h-4 w-4" /> Matrix View</TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5"><List className="h-4 w-4" /> List View</TabsTrigger>
          </TabsList>

          {/* ─── Matrix Tab ─── */}
          <TabsContent value="matrix">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : ageFilter === "all" ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Grid3X3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">Select an Age Group</h3>
                  <p className="text-sm text-muted-foreground mt-1">Choose an age group above to view the term objectives matrix.</p>
                </CardContent>
              </Card>
            ) : groupedOutcomes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Target className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">No yearly outcomes found</h3>
                  <p className="text-sm text-muted-foreground mt-1">Add yearly learning goals first, then map term objectives to them.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Coverage Summary */}
                {domainCoverage.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Coverage by Domain</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {domainCoverage.map(dc => (
                          <div key={dc.domainName} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium truncate mr-2">{dc.domainName}</span>
                              <span className="text-muted-foreground shrink-0">{dc.covered}/{dc.total} goals</span>
                            </div>
                            <Progress value={dc.pct} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Matrix Grid per Domain */}
                {groupedOutcomes.map(group => (
                  <Card key={group.domainId}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        {group.domainName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[200px]">Yearly Outcome</TableHead>
                              <TableHead className="min-w-[180px]">T1</TableHead>
                              <TableHead className="min-w-[180px]">T2</TableHead>
                              <TableHead className="min-w-[180px]">T3</TableHead>
                              <TableHead className="min-w-[180px]">T4</TableHead>
                              <TableHead className="text-center w-[70px]">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.outcomes.map((yo: any) => {
                              const total = getTotalForOutcome(yo.id);
                              const hasGap = total === 0;
                              return (
                                <TableRow key={yo.id} className={hasGap ? "bg-destructive/5" : ""}>
                                  <TableCell className="align-top">
                                    <div>
                                      <Badge variant="outline" className="font-mono text-[10px] mr-1.5">{yo.outcome_code}</Badge>
                                      <span className="text-sm">{yo.outcome_title}</span>
                                    </div>
                                  </TableCell>
                                  {[1, 2, 3, 4].map(term => {
                                    const objs = getObjectives(yo.id, term);
                                    return (
                                      <TableCell key={term} className="align-top p-2">
                                        {objs.length > 0 ? (
                                          <div className="space-y-1">
                                            {objs.map(o => (
                                              <div key={o.id} className="text-xs rounded-md bg-muted/60 px-2 py-1.5">
                                                <span className="font-mono text-[10px] text-muted-foreground mr-1">{o.code}</span>
                                                <span>{o.title}</span>
                                              </div>
                                            ))}
                                            {canEdit && (
                                              <Button variant="ghost" size="sm" className="h-6 w-full text-[10px] text-muted-foreground"
                                                onClick={() => openCreate({ outcomeId: yo.id, term, ageGroupId: yo.age_group_id, domainId: yo.domain_id })}>
                                                <Plus className="h-3 w-3 mr-0.5" /> Add
                                              </Button>
                                            )}
                                          </div>
                                        ) : (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 w-full text-xs text-muted-foreground/40 border border-dashed border-muted-foreground/20"
                                            onClick={() => {
                                              if (canEdit) openCreate({ outcomeId: yo.id, term, ageGroupId: yo.age_group_id, domainId: yo.domain_id });
                                            }}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell className="text-center align-top">
                                    <Badge variant={total > 0 ? "default" : "destructive"} className="text-xs">
                                      {total}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── List Tab ─── */}
          <TabsContent value="list">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : objectives.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <GraduationCap className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">No objectives found</h3>
                  <p className="text-sm text-muted-foreground mt-1">Adjust filters or add new term objectives.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                {canEdit && selectedIds.size > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30">
                    <span className="text-sm font-medium">{selectedIds.size} selected</span>
                    <Button variant="destructive" size="sm" onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))} disabled={bulkDeleteMutation.isPending}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> {bulkDeleteMutation.isPending ? "Deleting..." : "Delete Selected"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                  </div>
                )}
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {canEdit && (
                            <TableHead className="w-[40px]">
                              <Checkbox checked={objectives.length > 0 && selectedIds.size === objectives.length} onCheckedChange={toggleSelectAll} />
                            </TableHead>
                          )}
                          <TableHead>Code</TableHead>
                          <TableHead>Objective</TableHead>
                          <TableHead className="hidden md:table-cell">Description</TableHead>
                          <TableHead className="hidden md:table-cell">Age</TableHead>
                          <TableHead className="hidden md:table-cell">Domain</TableHead>
                          <TableHead className="hidden lg:table-cell">Term</TableHead>
                          <TableHead className="hidden lg:table-cell">Type</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {objectives.map((o: any) => (
                          <TableRow key={o.id} className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(o.id) ? "bg-muted/30" : ""}`} onClick={() => { if (!showForm) setSelectedObjective(o); }}>
                            {canEdit && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selectedIds.has(o.id)} onCheckedChange={() => toggleSelect(o.id)} />
                              </TableCell>
                            )}
                            <TableCell><Badge variant="outline" className="font-mono text-xs">{o.code}</Badge></TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{o.title}</p>
                              {o.learning_area && <p className="text-xs text-muted-foreground">{o.learning_area}</p>}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">{o.description || "—"}</TableCell>
                            <TableCell className="hidden md:table-cell"><Badge variant="secondary">{o.age_groups?.label}</Badge></TableCell>
                            <TableCell className="hidden md:table-cell text-sm">{o.development_domains?.name}</TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {(o as any).term ? <Badge variant="outline">T{(o as any).term}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">{typeBadge(o.objective_type || "core")}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {canEdit && (
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
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Drawer with Indicators */}
      <Sheet open={!!selectedObjective && !showForm} onOpenChange={(open) => { if (!open) setSelectedObjective(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">
              {selectedObjective?.code}: {selectedObjective?.title}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{selectedObjective?.age_groups?.label}</Badge>
              <Badge variant="outline">{selectedObjective?.development_domains?.name}</Badge>
              {selectedObjective?.objective_type && typeBadge(selectedObjective.objective_type)}
              {(selectedObjective as any)?.term && <Badge variant="outline">Term {(selectedObjective as any).term}</Badge>}
            </div>
            {selectedObjective?.learning_area && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Learning Area</p>
                <p className="text-sm">{selectedObjective.learning_area}</p>
              </div>
            )}
            {selectedObjective?.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selectedObjective.description}</p>
              </div>
            )}
            {selectedObjective?.yearly_outcomes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Linked Learning Goal</p>
                <p className="text-sm">{selectedObjective.yearly_outcomes.outcome_code}: {selectedObjective.yearly_outcomes.outcome_title}</p>
              </div>
            )}

            {/* Observation Indicators */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Observation Indicators ({indicators.length})</p>
              {indicators.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No indicators added yet.</p>
              ) : (
                <div className="space-y-2">
                  {indicators.map((ind: any) => (
                    <div key={ind.id} className="rounded-md border p-3 flex justify-between items-start gap-2">
                      <div>
                        <p className="text-sm font-medium">{ind.indicator_text}</p>
                        {ind.evidence_type && <Badge variant="outline" className="mt-1 text-xs">{ind.evidence_type}</Badge>}
                      </div>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => deleteIndicatorMutation.mutate(ind.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="mt-4 space-y-3 rounded-md border border-dashed p-3">
                  <p className="text-xs font-medium text-muted-foreground">Add Observation Indicator</p>
                  <Textarea placeholder="What observable behavior demonstrates this objective?" value={indicatorText} onChange={(e) => setIndicatorText(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Select value={indicatorEvidence} onValueChange={setIndicatorEvidence}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Evidence type" /></SelectTrigger>
                      <SelectContent>
                        {EVIDENCE_OPTIONS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!indicatorText.trim() || addIndicatorMutation.isPending} onClick={() => addIndicatorMutation.mutate()}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingObj ? "Edit Term Objective" : "Add Term Objective"}</DialogTitle>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Objective Code *</Label>
                <Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. TO-AGE4-CL-01" />
              </div>
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={form.term || "__none__"} onValueChange={(v) => setForm(f => ({ ...f, term: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="All Terms" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">All Terms</SelectItem>
                    {TERM_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tunjang / Learning Area</Label>
              <Select value={form.learning_area} onValueChange={(v) => setForm(f => ({ ...f, learning_area: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select learning area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {learningAreas.map(la => (
                    <SelectItem key={la.id} value={la.code}>{la.name_ms}{la.name_en ? ` / ${la.name_en}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Objective Title *</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Uses short phrases to communicate needs" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.objective_type} onValueChange={(v) => setForm(f => ({ ...f, objective_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Linked Learning Goal (optional)</Label>
              <Select value={form.yearly_outcome_id || "__none__"} onValueChange={(v) => setForm(f => ({ ...f, yearly_outcome_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {filteredOutcomes.map((yo: any) => (
                    <SelectItem key={yo.id} value={yo.id}>{yo.outcome_code}: {yo.outcome_title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observation Indicators */}
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <Label className="text-sm font-medium">Observation Indicators</Label>
              <p className="text-xs text-muted-foreground">What observable behaviors demonstrate this objective?</p>
              {formIndicators.length > 0 && (
                <div className="space-y-1.5">
                  {formIndicators.map((ind, idx) => (
                    <div key={idx} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{ind.text}</p>
                        {ind.evidence_type && <Badge variant="outline" className="text-[10px] mt-0.5">{EVIDENCE_OPTIONS.find(e => e.value === ind.evidence_type)?.label || ind.evidence_type}</Badge>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => setFormIndicators(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea placeholder="e.g. Child uses 2-3 word phrases to express needs" value={newIndText} onChange={(e) => setNewIndText(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Select value={newIndEvidence} onValueChange={setNewIndEvidence}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Evidence type" /></SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_OPTIONS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" disabled={!newIndText.trim()} onClick={() => {
                  setFormIndicators(prev => [...prev, { text: newIndText.trim(), evidence_type: newIndEvidence }]);
                  setNewIndText("");
                  setNewIndEvidence("");
                }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.code || !form.title || !form.age_group_id || !form.domain_id}>
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
              <Sparkles className="h-5 w-5 text-primary" /> AI Suggest Term Objectives
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
            <div className="space-y-2">
              <Label>Linked Learning Goal (optional)</Label>
              <Select value={aiOutcomeId || "__none__"} onValueChange={(v) => setAiOutcomeId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="None — general objectives" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {aiFilteredOutcomes.map((yo: any) => (
                    <SelectItem key={yo.id} value={yo.id}>{yo.outcome_code}: {yo.outcome_title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => aiBrainstormMutation.mutate()} disabled={aiBrainstormMutation.isPending || !aiAgeGroup || !aiDomain}>
              {aiBrainstormMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-2" /> Generate Suggestions</>}
            </Button>

            {aiSuggestions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select objectives to add (indicators included):</p>
                {aiSuggestions.map((s: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg border hover:bg-muted/30 cursor-pointer" onClick={() => toggleAiSuggestion(idx)}>
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selectedSuggestions.has(idx)} onCheckedChange={() => toggleAiSuggestion(idx)} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs">{s.code}</Badge>
                          <span className="font-medium text-sm">{s.title}</span>
                          {s.objective_type && typeBadge(s.objective_type)}
                        </div>
                        {s.description && <p className="text-xs text-muted-foreground mb-1">{s.description}</p>}
                        {s.indicators?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {s.indicators.map((ind: any, i: number) => (
                              <p key={i} className="text-xs text-muted-foreground">• {ind.indicator_text} <Badge variant="outline" className="text-[10px] ml-1">{ind.evidence_type}</Badge></p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiDialog(false)}>Cancel</Button>
            {aiSuggestions.length > 0 && (
              <Button onClick={() => addAiObjectivesMutation.mutate()} disabled={addAiObjectivesMutation.isPending || selectedSuggestions.size === 0}>
                {addAiObjectivesMutation.isPending ? "Adding..." : `Add ${selectedSuggestions.size} Selected`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Upload Dialog */}
      <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Upload Term Objectives
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Upload area */}
            <div className="rounded-lg border border-dashed border-primary/30 p-6 text-center bg-muted/20">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium mb-1">Upload a CSV file</p>
              <p className="text-xs text-muted-foreground mb-3">
                Required: <span className="font-mono text-foreground/70">objective_code, objective_title, age_group, domain</span>
                &nbsp;·&nbsp;Optional: <span className="font-mono text-foreground/70">term, learning_area, outcome_code, indicators, evidence_type, evidence_guide</span>
              </p>
              <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
              <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
                {csvFileName || "Choose CSV File"}
              </Button>
            </div>

            {/* Collapsible reference */}
            <details className="rounded-md border bg-muted/30 text-xs">
              <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground hover:text-foreground select-none">
                Column Reference Guide
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2 text-muted-foreground">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div><span className="font-semibold text-foreground">age_group:</span> <span className="font-mono">1, 2, 3, 4, 5, 6 (1–2 = Taska)</span></div>
                  <div><span className="font-semibold text-foreground">term:</span> <span className="font-mono">1, 2, 3, 4</span></div>
                  <div><span className="font-semibold text-foreground">type:</span> <span className="font-mono">Core, Support, Stretch</span></div>
                  <div><span className="font-semibold text-foreground">learning_area:</span> <span className="font-mono">SE, FK, KNK, BL, KG, KE</span></div>
                </div>
                <div>
                  <span className="font-semibold text-foreground">domain codes:</span>
                  <div className="grid grid-cols-2 gap-x-6 mt-1 pl-2">
                    <span><span className="font-mono">CL</span> Communication & Language</span>
                    <span><span className="font-mono">EL</span> Early Literacy</span>
                    <span><span className="font-mono">NT</span> Numeracy & Thinking</span>
                    <span><span className="font-mono">PM</span> Physical & Motor</span>
                    <span><span className="font-mono">SE</span> Social-Emotional</span>
                    <span><span className="font-mono">CD</span> Creativity & Discovery</span>
                    <span><span className="font-mono">VC</span> Values & Community</span>
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-foreground">outcome_code:</span> short code e.g. <span className="font-mono">CD3.1</span> to link to yearly outcome
                </div>
                <div>
                  <span className="font-semibold text-foreground">indicators:</span> one indicator per row (multiple rows share same objective_code)
                </div>
                <div>
                  <span className="font-semibold text-foreground">evidence_type:</span> per-row: <span className="font-mono">Observation, Photo Evidence, Verbal Response, Work Sample, Checklist</span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">evidence_guide:</span> guidance text for how to collect evidence
                </div>
              </div>
            </details>

            {csvErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> {csvErrors.length} warning{csvErrors.length > 1 ? "s" : ""}
                </p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {csvErrors.map((err, i) => <p key={i} className="text-xs text-destructive/80">{err}</p>)}
                </div>
              </div>
            )}

            {csvData.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {csvData.filter(r => r._age_group_id && r._domain_id && r.code && r.title).length} of {csvData.length} rows valid
                </p>
                <div className="max-h-48 overflow-y-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Code</TableHead>
                        <TableHead className="text-xs">Title</TableHead>
                        <TableHead className="text-xs">Age</TableHead>
                        <TableHead className="text-xs">Domain</TableHead>
                        <TableHead className="text-xs">Learning Goal</TableHead>
                        <TableHead className="text-xs">Indicators</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.map((r, i) => {
                        const valid = r._age_group_id && r._domain_id && r.code && r.title;
                        return (
                          <TableRow key={i} className={valid ? "" : "bg-destructive/5"}>
                            <TableCell className="text-xs">{r._row}</TableCell>
                            <TableCell className="text-xs font-mono">{r.code}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{r.title}</TableCell>
                            <TableCell className="text-xs">{r.age_group}</TableCell>
                            <TableCell className="text-xs">{r.domain}</TableCell>
                            <TableCell className="text-xs font-mono">{r._outcome_code || "—"}</TableCell>
                            <TableCell className="text-xs">{r._indicators?.length || 0}</TableCell>
                            <TableCell>
                              {valid ? (
                                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Ready</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">Error</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsvDialog(false)}>Cancel</Button>
            {csvData.length > 0 && csvData.some(r => r._age_group_id && r._domain_id && r.code && r.title) && (
              <Button
                onClick={() => csvUploadMutation.mutate()}
                disabled={csvUploadMutation.isPending}
                className="min-w-[140px]"
              >
                {csvUploadMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                ) : (
                  `Import ${csvData.filter(r => r._age_group_id && r._domain_id && r.code && r.title).length} Objectives`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
