import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, FolderOpen, FileText, Eye, EyeOff, Sparkles, Loader2, Calendar, BookOpen, Microscope, HeartPulse, MessageSquare, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UpdateDetailDialog } from "@/components/daily-updates/UpdateDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendParentEmailForStudent } from "@/lib/parent-email";
import { buildAppUrl } from "@/lib/app-url";

type TimelineItem = {
  id: string;
  type: "journey" | "observation" | "ptm" | "milestone" | "update";
  date: string;
  title: string;
  description?: string;
  domain?: string;
  milestone_flag?: boolean;
  portfolio_candidate?: boolean;
  visible_to_parent?: boolean;
  parent_visibility_status?: string;
  raw: any;
};

const filterOptions = [
  { value: "all", label: "All", icon: BookOpen },
  { value: "milestones", label: "Milestones", icon: Star },
  { value: "parent_visible", label: "Parent shared", icon: Eye },
];

interface StudentJourneyTimelineProps {
  embedded?: boolean;
  studentId?: string;
}

export default function StudentJourneyTimeline({ embedded = false, studentId: studentIdProp }: StudentJourneyTimelineProps = {}) {
  const params = useParams<{ studentId: string }>();
  const studentId = studentIdProp ?? params.studentId;
  const { user } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [openUpdateId, setOpenUpdateId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TimelineItem | null>(null);

  // Student list for picker when no studentId
  const { data: studentList = [] } = useQuery({
    queryKey: ["timeline-student-list", selectedBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, class_name").eq("branch_id", selectedBranchId).eq("is_active", true).order("first_name");
      return data ?? [];
    },
    enabled: !studentId && !!selectedBranchId,
  });

  // Get student info
  const { data: student } = useQuery({
    queryKey: ["timeline-student", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("first_name, last_name, branch_id, class_id, class_name").eq("id", studentId!).single();
      return data;
    },
    enabled: !!studentId,
  });

  // Journey entries
  const { data: journeyEntries = [] } = useQuery({
    queryKey: ["timeline-journey", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("*, development_domains(name)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!studentId,
  });

  // Observations
  const { data: observations = [] } = useQuery({
    queryKey: ["timeline-observations", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("*")
        .eq("student_id", studentId!)
        .order("observed_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!studentId,
  });

  // PTM reports
  const { data: ptmReports = [] } = useQuery({
    queryKey: ["timeline-ptm", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ptm_reports")
        .select("*")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
  });

  // Child updates (new unified daily updates)
  const { data: childUpdates = [] } = useQuery({
    queryKey: ["timeline-child-updates", studentId],
    queryFn: async () => {
      const { data: tags } = await supabase
        .from("child_update_students")
        .select("update_id")
        .eq("student_id", studentId!);
      const ids = (tags ?? []).map((r: any) => r.update_id);
      const { data: direct } = await supabase
        .from("child_updates")
        .select("id, caption, parent_summary, ai_learning_story, activity_date, status, visible_to_parent, milestone_flag, development_domains(name)")
        .eq("student_id", studentId!)
        .order("activity_date", { ascending: false })
        .limit(200);
      let group: any[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from("child_updates")
          .select("id, caption, parent_summary, ai_learning_story, activity_date, status, visible_to_parent, milestone_flag, development_domains(name)")
          .in("id", ids)
          .order("activity_date", { ascending: false })
          .limit(200);
        group = data ?? [];
      }
      // Dedupe by id
      const map = new Map<string, any>();
      for (const u of [...(direct ?? []), ...group]) map.set(u.id, u);
      return Array.from(map.values());
    },
    enabled: !!studentId,
  });

  // Monthly summaries
  const { data: monthlySummaries = [] } = useQuery({
    queryKey: ["timeline-monthly-summaries", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_monthly_summaries")
        .select("*")
        .eq("student_id", studentId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
  });

  // Build unified timeline
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const e of journeyEntries) {
      items.push({
        id: `j-${e.id}`,
        type: e.milestone_flag ? "milestone" : "journey",
        date: e.created_at,
        title: e.title || "Learning Entry",
        description: e.teacher_note || e.parent_summary,
        domain: (e as any).development_domains?.name,
        milestone_flag: e.milestone_flag ?? false,
        portfolio_candidate: e.portfolio_candidate ?? false,
        visible_to_parent: e.visible_to_parent,
        parent_visibility_status: e.parent_visibility_status ?? "draft",
        raw: e,
      });
    }

    for (const o of observations) {
      items.push({
        id: `o-${o.id}`,
        type: "observation",
        date: o.observed_at,
        title: o.notes?.slice(0, 50) || "Observation",
        description: o.notes,
        milestone_flag: false,
        portfolio_candidate: false,
        visible_to_parent: false,
        raw: o,
      });
    }

    for (const p of ptmReports) {
      items.push({
        id: `p-${p.id}`,
        type: "ptm",
        date: p.created_at,
        title: `PTM Report — ${p.academic_term || "Term"}`,
        description: p.academic_term || undefined,
        milestone_flag: false,
        portfolio_candidate: false,
        visible_to_parent: p.status === "published",
        raw: p,
      });
    }

    for (const u of childUpdates) {
      items.push({
        id: `u-${u.id}`,
        type: u.milestone_flag ? "milestone" : "update",
        date: u.activity_date,
        title: u.caption || "Daily update",
        description: u.parent_summary || u.ai_learning_story || u.caption,
        domain: (u as any).development_domains?.name,
        milestone_flag: u.milestone_flag ?? false,
        portfolio_candidate: false,
        visible_to_parent: u.visible_to_parent,
        raw: u,
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [journeyEntries, observations, ptmReports, childUpdates]);

  // Apply filter
  const filteredItems = useMemo(() => {
    switch (filter) {
      case "observations": return timelineItems.filter(i => i.type === "observation");
      case "milestones": return timelineItems.filter(i => i.milestone_flag);
      case "ptm": return timelineItems.filter(i => i.type === "ptm");
      case "parent_visible": return timelineItems.filter(i => i.visible_to_parent);
      case "internal": return timelineItems.filter(i => !i.visible_to_parent);
      default: return timelineItems;
    }
  }, [timelineItems, filter]);

  // Toggle mutations
  const toggleMutation = useMutation({
    mutationFn: async ({ entryId, field, value }: { entryId: string; field: string; value: boolean }) => {
      const updates: any = { [field]: value };
      if (field === "teacher_approved" && value) updates.approved_at = new Date().toISOString();
      const { error } = await supabase.from("daily_learning_journey_entries").update(updates).eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline-journey", studentId] });
      toast({ title: "Updated" });
    },
  });

  // Generate monthly summary
  const [generatingMonth, setGeneratingMonth] = useState<string | null>(null);
  const generateSummary = async (month: number, year: number) => {
    if (!student?.branch_id) return;
    setGeneratingMonth(`${year}-${month}`);
    try {
      const { data, error } = await supabase.functions.invoke("generate-monthly-summary", {
        body: { student_id: studentId, month, year, branch_id: student.branch_id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["timeline-monthly-summaries", studentId] });
      toast({ title: "Monthly summary generated!", description: data?.summary_text?.slice(0, 100) + "..." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingMonth(null);
    }
  };

  // Group items by month
  const groupedByMonth = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    for (const item of filteredItems) {
      const d = new Date(item.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredItems]);

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const typeIcon = (type: string) => {
    switch (type) {
      case "journey": return <BookOpen className="h-3.5 w-3.5 text-primary" />;
      case "observation": return <Microscope className="h-3.5 w-3.5 text-muted-foreground" />;
      case "ptm": return <FileText className="h-3.5 w-3.5 text-accent" />;
      case "milestone": return <Star className="h-3.5 w-3.5 text-accent fill-accent" />;
      case "update": return <Camera className="h-3.5 w-3.5 text-primary" />;
      default: return <BookOpen className="h-3.5 w-3.5" />;
    }
  };

  const handleItemClick = (item: TimelineItem) => {
    if (item.type === "update") {
      setOpenUpdateId(item.raw.id);
      return;
    }
    if (item.type === "ptm") {
      // Open the PTM workspace with the meetings tab; deep-linking by id can be added later.
      navigate(`/curriculum/ptm?tab=meetings`);
      return;
    }
    setDetailItem(item);
  };

  // If no studentId, show student picker
  if (!studentId && !embedded) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Student Journey Timeline</h1>
            <p className="text-sm text-muted-foreground">Select a student to view their learning journey</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {studentList.map((s: any) => (
              <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/curriculum/journey/timeline/${s.id}`)}>
                <CardContent className="p-4">
                  <p className="font-medium text-sm">{s.first_name} {s.last_name}</p>
                  {s.class_name && <p className="text-xs text-muted-foreground">{s.class_name}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>;

  return (
    <Wrapper>
      <div className="space-y-4 sm:space-y-6">
        {!embedded && (
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {student ? `${student.first_name} ${student.last_name}'s Journey` : "Student Journey"}
          </h1>
          <p className="text-sm text-muted-foreground">Unified timeline of learning, observations, milestones & PTM</p>
        </div>
        )}

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {filterOptions.map(f => (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              size="sm"
              className="gap-1 text-xs h-7"
              onClick={() => setFilter(f.value)}
            >
              <f.icon className="h-3 w-3" />
              {f.label}
            </Button>
          ))}
        </div>

        {/* Monthly summaries tab */}
        <Tabs defaultValue="timeline">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="summaries" className="text-xs">Monthly Summaries</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4 space-y-6">
            {!groupedByMonth.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p>No entries yet for this student</p>
              </CardContent></Card>
            ) : groupedByMonth.map(([monthKey, items]) => {
              const [y, m] = monthKey.split("-").map(Number);
              const summary = monthlySummaries.find((s: any) => s.month === m && s.year === y);
              return (
                <div key={monthKey} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {monthNames[m - 1]} {y}
                      <Badge variant="secondary" className="text-xs">{items.length} entries</Badge>
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs h-7"
                      disabled={generatingMonth === monthKey}
                      onClick={() => generateSummary(m, y)}
                    >
                      {generatingMonth === monthKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {summary ? "Regenerate" : "Generate"} Summary
                    </Button>
                  </div>

                  {summary && (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span className="text-xs font-medium text-primary">Monthly Summary</span>
                          <Badge variant={summary.status === "published" ? "default" : "outline"} className="text-xs ml-auto">
                            {summary.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground/80">{summary.summary_text}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Timeline items */}
                  <div className="relative pl-4 border-l-2 border-primary/20 space-y-3">
                    {items.map(item => (
                      <div key={item.id} className="relative">
                        <div className="absolute -left-[1.35rem] top-3 w-3 h-3 rounded-full bg-background border-2 border-primary/40" />
                        <Card
                          className={`cursor-pointer hover:shadow-md transition-shadow ${item.milestone_flag ? "ring-1 ring-yellow-400/50" : ""}`}
                          onClick={() => handleItemClick(item)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">{typeIcon(item.type)}</div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-sm truncate">{item.title}</span>
                                  {item.domain && <Badge variant="secondary" className="text-xs">{item.domain}</Badge>}
                                  {item.milestone_flag && (
                                    <Badge className="bg-accent/10 text-accent text-xs gap-0.5">
                                      <Star className="h-2.5 w-2.5 fill-accent" /> Milestone
                                    </Badge>
                                  )}
                                  {item.portfolio_candidate && (
                                    <Badge className="bg-primary/10 text-primary text-xs gap-0.5">
                                      <FolderOpen className="h-2.5 w-2.5" /> Portfolio
                                    </Badge>
                                  )}
                                </div>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                                )}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>{format(new Date(item.date), "d MMM, h:mm a")}</span>
                                  {item.visible_to_parent && (
                                    <span className="flex items-center gap-0.5 text-accent"><Eye className="h-2.5 w-2.5" /> Shared</span>
                                  )}
                                </div>
                              </div>

                              {/* Toggle controls for journey entries */}
                              {item.type === "journey" || item.type === "milestone" ? (
                                <div className="flex flex-col gap-1.5 items-end shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    className={`p-1 rounded transition-colors ${item.milestone_flag ? "text-yellow-500" : "text-muted-foreground/40 hover:text-yellow-500"}`}
                                    title="Toggle milestone"
                                    onClick={() => toggleMutation.mutate({ entryId: item.raw.id, field: "milestone_flag", value: !item.milestone_flag })}
                                  >
                                    <Star className={`h-4 w-4 ${item.milestone_flag ? "fill-yellow-500" : ""}`} />
                                  </button>
                                  <button
                                    className={`p-1 rounded transition-colors ${item.portfolio_candidate ? "text-primary" : "text-muted-foreground/40 hover:text-primary"}`}
                                    title="Toggle portfolio"
                                    onClick={() => toggleMutation.mutate({ entryId: item.raw.id, field: "portfolio_candidate", value: !item.portfolio_candidate })}
                                  >
                                    <FolderOpen className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="summaries" className="mt-4 space-y-4">
            {!monthlySummaries.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-lg mb-1">No monthly summaries yet</p>
                <p className="text-sm">Generate summaries from the Timeline tab</p>
              </CardContent></Card>
            ) : monthlySummaries.map((s: any) => (
              <Card key={s.id} className="border-primary/10">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {monthNames[s.month - 1]} {s.year}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.status === "published" ? "default" : "outline"} className="text-xs">{s.status}</Badge>
                      {s.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-6"
                          onClick={async () => {
                            await supabase.from("student_monthly_summaries").update({ status: "published" }).eq("id", s.id);
                            queryClient.invalidateQueries({ queryKey: ["timeline-monthly-summaries", studentId] });
                            toast({ title: "Summary published to parents" });
                            // Parent push + bell: progress report published
                            if (studentId) {
                              const { notifyStudentParents } = await import("@/lib/parent-notify");
                              const childName = (student as any)?.first_name || "your child";
                              await notifyStudentParents(
                                studentId,
                                "📈 New progress update",
                                `${childName}'s ${monthNames[s.month - 1]} progress summary is ready.`,
                                "progress",
                                {
                                  actionUrl: "/progress",
                                  referenceId: s.id,
                                  groupKey: `progress:${studentId}`,
                                  priority: "normal",
                                }
                              );
                            }
                            // Parent email — learning-story-ready (best-effort)
                            if (studentId) {
                              const childName = (student as any)?.first_name || undefined;
                              const monthLabel = `${monthNames[s.month - 1]?.toUpperCase()} ${s.year}`;
                              sendParentEmailForStudent(
                                studentId,
                                "learning-story-ready",
                                (r) => ({
                                  parentName: r.first_name || undefined,
                                  childName,
                                  storyTitle: childName ? `${childName}'s ${monthNames[s.month - 1]} story` : undefined,
                                  monthLabel,
                                  previewText: typeof s.summary_text === "string" ? s.summary_text.slice(0, 220) : undefined,
                                  storyUrl: buildAppUrl("/journey"),
                                }),
                                `learning-story-${s.id}`
                              );
                            }
                          }}
                        >
                          Publish
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground/80">{s.summary_text}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{s.entry_count} entries</span>
                    <span>•</span>
                    <span>{s.milestone_count} milestones</span>
                  </div>
                  {s.strengths_json?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Strengths</p>
                      <div className="flex flex-wrap gap-1">
                        {(s.strengths_json as string[]).map((str, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{str}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.home_extensions_json?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Home Activities</p>
                      <ul className="space-y-0.5">
                        {(s.home_extensions_json as string[]).map((ext, i) => (
                          <li key={i} className="text-xs text-foreground/70">• {ext}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {s.domains_explored?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(s.domains_explored as string[]).map((d, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
      <UpdateDetailDialog updateId={openUpdateId} open={!!openUpdateId} onOpenChange={(v) => !v && setOpenUpdateId(null)} />
      <Dialog open={!!detailItem} onOpenChange={(v) => !v && setDetailItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{detailItem?.title}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{format(new Date(detailItem.date), "PPPp")}</p>
              {detailItem.domain && <Badge variant="secondary" className="text-xs">{detailItem.domain}</Badge>}
              {detailItem.description && <p className="whitespace-pre-wrap">{detailItem.description}</p>}
              {detailItem.raw?.media_url && (
                <img src={detailItem.raw.media_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg" />
              )}
              {detailItem.raw?.evidence_url && !String(detailItem.raw.evidence_url).toLowerCase().endsWith(".pdf") && (
                <img src={detailItem.raw.evidence_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg" />
              )}
              {detailItem.raw?.ai_learning_story && detailItem.raw.ai_learning_story !== detailItem.description && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-primary mb-1">Learning story</p>
                  <p className="text-sm whitespace-pre-wrap">{detailItem.raw.ai_learning_story}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}
