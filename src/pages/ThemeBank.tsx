import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ThemeCard from "@/components/academic/ThemeCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, Palette, X, Pencil, Trash2, Save, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

export default function ThemeBank() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";

  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState<any>(null);
  const [aiRefining, setAiRefining] = useState(false);

  const [editName, setEditName] = useState("");
  const [editBigIdea, setEditBigIdea] = useState("");
  const [editVocab, setEditVocab] = useState("");
  const [editConcepts, setEditConcepts] = useState("");

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ["theme-bank"],
    queryFn: async () => {
      const { data } = await supabase.from("theme_bank").select("*").order("month_number");
      return data ?? [];
    },
  });

  const { data: weeklyFocuses = [] } = useQuery({
    queryKey: ["theme-weekly-focuses"],
    queryFn: async () => {
      const { data } = await supabase.from("theme_weekly_focuses").select("*").order("week_number");
      return data ?? [];
    },
  });

  const { data: domains = [] } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("id, name").order("sort_order");
      return data ?? [];
    },
  });

  const getFocusesForTheme = (themeId: string) =>
    (weeklyFocuses as any[]).filter((wf: any) => wf.theme_bank_id === themeId);

  const selectedTheme = selectedThemeId
    ? (themes as any[]).find((t: any) => t.id === selectedThemeId)
    : null;

  const selectedFocuses = selectedThemeId ? getFocusesForTheme(selectedThemeId) : [];

  const openEdit = (theme: any) => {
    setEditTheme(theme);
    setEditName(theme.theme_name || "");
    setEditBigIdea(theme.big_idea || "");
    setEditVocab((theme.key_vocabulary ?? []).join(", "));
    setEditConcepts((theme.key_concepts ?? []).join(", "));
  };

  const parseCommaSeparated = (val: string) => val.split(",").map(s => s.trim()).filter(Boolean);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("theme_bank").update({
        theme_name: editName,
        big_idea: editBigIdea,
        key_vocabulary: parseCommaSeparated(editVocab),
        key_concepts: parseCommaSeparated(editConcepts),
      } as any).eq("id", editTheme.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-bank"] });
      setEditTheme(null);
      toast({ title: "Theme updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("theme_bank").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-bank"] });
      setSelectedThemeId(null);
      toast({ title: "Theme deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleAiRefine = async (theme: any) => {
    setAiRefining(true);
    try {
      const focuses = getFocusesForTheme(theme.id);
      const { data, error } = await supabase.functions.invoke("refine-theme-bank", {
        body: {
          theme_name: theme.theme_name,
          big_idea: theme.big_idea || "",
          key_vocabulary: theme.key_vocabulary || [],
          key_concepts: theme.key_concepts || [],
          weekly_focuses: focuses.map((wf: any) => ({
            week_number: wf.week_number,
            focus_title: wf.focus_title,
            key_questions: wf.key_questions || [],
          })),
        },
      });
      if (error) throw error;
      if (data) {
        await supabase.from("theme_bank").update({
          big_idea: data.big_idea,
          key_vocabulary: data.key_vocabulary,
          key_concepts: data.key_concepts,
        } as any).eq("id", theme.id);

        if (Array.isArray(data.weekly_focuses)) {
          for (const wf of data.weekly_focuses) {
            const existing = focuses.find((f: any) => f.week_number === wf.week_number);
            if (existing) {
              await supabase.from("theme_weekly_focuses").update({
                focus_title: wf.focus_title,
                key_questions: wf.key_questions,
              } as any).eq("id", existing.id);
            }
          }
        }

        queryClient.invalidateQueries({ queryKey: ["theme-bank"] });
        queryClient.invalidateQueries({ queryKey: ["theme-weekly-focuses"] });

        // Show domain alignment suggestions if returned
        if (data.suggested_domain_alignments?.length > 0) {
          toast({
            title: "Theme refined with AI! ✨",
            description: `Suggested domains: ${data.suggested_domain_alignments.join(", ")}`,
          });
        } else {
          toast({ title: "Theme refined with AI! ✨" });
        }
      }
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    } finally {
      setAiRefining(false);
    }
  };

  // Get domain alignment from theme's key_concepts matching domain names
  const getDomainAlignments = (theme: any): string[] => {
    if (!domains.length) return [];
    const domainNames = (domains as any[]).map((d: any) => d.name.toLowerCase());
    const concepts = (theme.key_concepts ?? []).map((c: string) => c.toLowerCase());
    const vocab = (theme.key_vocabulary ?? []).map((v: string) => v.toLowerCase());
    const allTerms = [...concepts, ...vocab, (theme.big_idea || "").toLowerCase()];
    
    return (domains as any[]).filter((d: any) => {
      const dLow = d.name.toLowerCase();
      return allTerms.some((t: string) => t.includes(dLow) || dLow.includes(t));
    }).map((d: any) => d.name);
  };

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="foundation" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Theme Bank
          </h1>
          <p className="text-muted-foreground">
            Master reference of 12 monthly themes with weekly focuses, vocabulary, and key concepts.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(themes as any[]).map((theme: any) => (
              <ThemeCard
                key={theme.id}
                theme={{
                  ...theme,
                  key_vocabulary: theme.key_vocabulary ?? [],
                  key_concepts: theme.key_concepts ?? [],
                }}
                weeklyFocuses={getFocusesForTheme(theme.id)}
                onClick={() => setSelectedThemeId(theme.id === selectedThemeId ? null : theme.id)}
                selected={theme.id === selectedThemeId}
              />
            ))}
          </div>
        )}

        {/* Detail Panel */}
        {selectedTheme && (
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xl">
                Month {selectedTheme.month_number}: {selectedTheme.theme_name}
              </CardTitle>
              <div className="flex gap-1">
                {isSuperAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAiRefine(selectedTheme)}
                      disabled={aiRefining}
                    >
                      {aiRefining ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                      {aiRefining ? "Refining..." : "Refine with AI"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(selectedTheme)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(selectedTheme.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedThemeId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[80vh]">
                <div className="space-y-6">
                  {selectedTheme.big_idea && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Big Idea</h4>
                      <p className="text-sm italic">"{selectedTheme.big_idea}"</p>
                    </div>
                  )}

                  {/* Domain Alignment Badges */}
                  {(() => {
                    const alignments = getDomainAlignments(selectedTheme);
                    return alignments.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-2">Domain Alignment</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {alignments.map((d, i) => (
                            <Badge key={i} className="bg-primary/10 text-primary border-primary/20">{d}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {selectedTheme.key_vocabulary?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Key Vocabulary</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedTheme.key_vocabulary as string[]).map((v: string, i: number) => (
                          <Badge key={i} variant="outline">{v}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTheme.key_concepts?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Key Concepts</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedTheme.key_concepts as string[]).map((c: string, i: number) => (
                          <Badge key={i} variant="secondary">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-3">Weekly Focuses</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedFocuses.map((wf: any) => (
                        <Card key={wf.id} className="bg-muted/30">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">Week {wf.week_number}</Badge>
                              <span className="text-sm font-medium">{wf.focus_title}</span>
                            </div>
                            {wf.key_questions?.length > 0 && (
                              <div className="space-y-1">
                                {(wf.key_questions as string[]).map((q: string, i: number) => (
                                  <p key={i} className="text-xs text-muted-foreground italic">❓ {q}</p>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Theme Dialog */}
      <Dialog open={!!editTheme} onOpenChange={(open) => { if (!open) setEditTheme(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Theme</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Theme Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Big Idea</Label>
              <Textarea value={editBigIdea} onChange={(e) => setEditBigIdea(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Key Vocabulary (comma-separated)</Label>
              <Input value={editVocab} onChange={(e) => setEditVocab(e.target.value)} placeholder="e.g. seasons, weather, rain, sunshine" />
            </div>
            <div className="space-y-2">
              <Label>Key Concepts (comma-separated)</Label>
              <Input value={editConcepts} onChange={(e) => setEditConcepts(e.target.value)} placeholder="e.g. change, growth, patterns" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTheme(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
