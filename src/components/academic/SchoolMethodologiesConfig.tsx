import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Save, Star, CheckCircle2, Palette, TreePine, Brain, Lightbulb, GraduationCap } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const METHODOLOGY_ICONS: Record<string, any> = {
  montessori: BookOpen,
  "reggio emilia": Palette,
  waldorf: TreePine,
  "project-based": Lightbulb,
  "play-based": Brain,
};

function getMethodologyIcon(name: string) {
  const key = name.toLowerCase();
  for (const [k, Icon] of Object.entries(METHODOLOGY_ICONS)) {
    if (key.includes(k)) return Icon;
  }
  return GraduationCap;
}

export default function SchoolMethodologiesConfig() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { selectedBranchId } = useGlobalBranch();
  const canManage = role === "super_admin" || role === "franchisee" || role === "admin";

  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: frameworks = [], isLoading: loadingFrameworks } = useQuery({
    queryKey: ["methodology-frameworks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("methodology_frameworks")
        .select("id, name, core_principles")
        .order("name");
      return (data ?? []).map((f: any) => ({ ...f, description: f.core_principles }));
    },
  });

  const { data: branchMethodologies = [], isLoading: loadingBranch } = useQuery({
    queryKey: ["branch-methodologies", selectedBranchId],
    enabled: !!selectedBranchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_methodologies")
        .select("id, methodology_framework_id, is_primary")
        .eq("branch_id", selectedBranchId!);
      return data ?? [];
    },
  });

  // Sync DB state into local selection — runs on data load AND refetch
  useEffect(() => {
    if (loadingBranch || loadingFrameworks || frameworks.length === 0) return;
    const map = new Map<string, boolean>();
    let primary: string | null = null;
    for (const bm of branchMethodologies) {
      map.set(bm.methodology_framework_id, true);
      if (bm.is_primary) primary = bm.methodology_framework_id;
    }
    setSelected(map);
    setPrimaryId(primary);
    setHasUnsavedChanges(false);
  }, [branchMethodologies, frameworks, loadingBranch, loadingFrameworks]);

  const toggleMethodology = (fwId: string) => {
    const next = new Map(selected);
    if (next.has(fwId)) {
      next.delete(fwId);
      if (primaryId === fwId) setPrimaryId(null);
    } else {
      if (next.size >= 3) {
        toast({ title: "Maximum 3 methodologies", description: "Remove one before adding another.", variant: "destructive" });
        return;
      }
      next.set(fwId, true);
      if (next.size === 1) setPrimaryId(fwId);
    }
    setSelected(next);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!selectedBranchId) return;
    setSaving(true);
    try {
      await supabase.from("branch_methodologies").delete().eq("branch_id", selectedBranchId);
      const inserts = Array.from(selected.keys()).map((fwId) => ({
        branch_id: selectedBranchId,
        methodology_framework_id: fwId,
        is_primary: fwId === primaryId,
      }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("branch_methodologies").insert(inserts as any);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["branch-methodologies"] });
      toast({ title: "Methodologies saved ✓" });
      setHasUnsavedChanges(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;
  if (loadingFrameworks || loadingBranch) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-accent/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            School Teaching Methodologies
          </CardTitle>
          {selected.size > 0 && !hasUnsavedChanges && (
            <Badge variant="outline" className="gap-1 text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </Badge>
          )}
          {hasUnsavedChanges && (
            <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950">
              Unsaved changes
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Select 1–3 teaching methodologies your school adopts. The AI lesson planner will use these to suggest appropriate teaching methods.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {frameworks.map((fw: any) => {
            const isSelected = selected.has(fw.id);
            const isPrimary = primaryId === fw.id;
            const Icon = getMethodologyIcon(fw.name);
            return (
              <div
                key={fw.id}
                onClick={() => toggleMethodology(fw.id)}
                className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all hover:shadow-md ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{fw.name}</span>
                      {isPrimary && (
                        <Badge variant="default" className="text-[10px] gap-0.5 px-1.5 py-0">
                          <Star className="h-2.5 w-2.5" /> Primary
                        </Badge>
                      )}
                    </div>
                    {fw.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{fw.description}</p>
                    )}
                  </div>
                </div>
                {isSelected && !isPrimary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs h-7 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPrimaryId(fw.id);
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <Star className="h-3 w-3 mr-1" /> Set as Primary
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="pt-2 flex items-center justify-between">
            <div className="flex gap-1.5 flex-wrap">
              {Array.from(selected.keys()).map((fwId) => {
                const fw = frameworks.find((f: any) => f.id === fwId);
                return fw ? (
                  <Badge key={fwId} variant={primaryId === fwId ? "default" : "secondary"} className="text-xs">
                    {fw.name}
                  </Badge>
                ) : null;
              })}
            </div>
            <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges} size="sm">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
