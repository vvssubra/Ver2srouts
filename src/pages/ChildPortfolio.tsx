import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useParentChildren } from "@/hooks/use-parent-children";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Star, FolderOpen, Calendar, FileText, Sparkles, Camera } from "lucide-react";
import { VideoThumb } from "@/components/daily-updates/VideoThumb";

const parentStatusMap: Record<string, { label: string; color: string }> = {
  TP1: { label: "Building", color: "bg-muted text-muted-foreground" },
  TP2: { label: "Growing", color: "bg-primary/15 text-primary" },
  TP3: { label: "Confident", color: "bg-accent/15 text-accent" },
  not_yet: { label: "Building", color: "bg-muted text-muted-foreground" },
  emerging: { label: "Growing", color: "bg-primary/15 text-primary" },
  consistent: { label: "Confident", color: "bg-accent/15 text-accent" },
};

interface ChildPortfolioProps {
  studentId?: string;
}

export default function ChildPortfolio({ studentId: propStudentId }: ChildPortfolioProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("timeline");

  // Shared parent-children query. We still derive the active studentId
  // locally so an explicit prop (when embedded inside StudentDetail-like
  // contexts) wins over the parent's first linked child.
  const { children } = useParentChildren();
  const studentId = propStudentId || children[0]?.id || "";
  const student = children.find((c) => c.id === studentId) ?? null;

  // Journey entries visible to parent
  const { data: journeyEntries = [] } = useQuery({
    queryKey: ["portfolio-journey", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_learning_journey_entries")
        .select("*, development_domains(name), learning_journey_media(*)")
        .eq("student_id", studentId)
        .eq("visible_to_parent", true)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 60 * 1000,
  });

  // Learning activities shared with this student
  const { data: sharedActivities = [] } = useQuery({
    queryKey: ["portfolio-activities", studentId],
    queryFn: async () => {
      const { data: tags } = await supabase
        .from("learning_activity_students")
        .select("activity_id")
        .eq("student_id", studentId);
      if (!tags?.length) return [];
      const activityIds = tags.map((t: any) => t.activity_id);
      const { data } = await supabase
        .from("learning_activities")
        .select("*, development_domains(name), learning_activity_media(*), learning_albums(title)")
        .in("id", activityIds)
        .eq("visible_to_parents", true)
        .order("activity_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 60 * 1000,
  });

  // Milestones only
  const milestoneEntries = journeyEntries.filter((e: any) => e.milestone_flag);

  // Monthly summaries (published only)
  const { data: monthlySummaries = [] } = useQuery({
    queryKey: ["portfolio-monthly", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_monthly_summaries")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "published")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });

  // Evidence for progress
  const { data: evidence = [] } = useQuery({
    queryKey: ["portfolio-evidence", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observation_evidence")
        .select("*, observation_indicators(indicator_text, domain_id, development_domains(name))")
        .eq("student_id", studentId)
        .eq("internal_only", false)
        .order("observed_on", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });

  // PTM reports (published)
  const { data: ptmReports = [] } = useQuery({
    queryKey: ["portfolio-ptm", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ptm_reports")
        .select("*")
        .eq("student_id", studentId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
    staleTime: 2 * 60 * 1000,
  });

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  if (!studentId) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-12 text-center text-muted-foreground">No child linked yet</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {student ? `${(student as any).first_name}'s Portfolio` : "Child Portfolio"}
          </h1>
          <p className="text-sm text-muted-foreground">Your child's learning journey, milestones, and progress</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="timeline" className="gap-1 text-xs"><BookOpen className="h-3 w-3" />Timeline</TabsTrigger>
            <TabsTrigger value="milestones" className="gap-1 text-xs"><Star className="h-3 w-3" />Milestones</TabsTrigger>
            <TabsTrigger value="progress" className="gap-1 text-xs"><FolderOpen className="h-3 w-3" />Progress</TabsTrigger>
            <TabsTrigger value="monthly" className="gap-1 text-xs"><Calendar className="h-3 w-3" />Monthly</TabsTrigger>
            <TabsTrigger value="ptm" className="gap-1 text-xs"><FileText className="h-3 w-3" />PTM</TabsTrigger>
          </TabsList>

          {/* Timeline - merge journey entries + shared activities */}
          <TabsContent value="timeline" className="space-y-3 mt-4">
            {/* Shared Activities */}
            {sharedActivities.map((activity: any) => (
              <Card key={`act-${activity.id}`} className="border-primary/10">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-primary/5">
                        <Camera className="h-3 w-3 mr-1" />Class Activity
                      </Badge>
                      {activity.learning_albums?.title && (
                        <Badge variant="secondary" className="text-xs">{activity.learning_albums.title}</Badge>
                      )}
                      {activity.development_domains?.name && (
                        <Badge variant="secondary" className="text-xs">{activity.development_domains.name}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(activity.activity_date).toLocaleDateString()}</span>
                  </div>
                  <p className="font-medium text-sm">{activity.title}</p>
                  {activity.description && <p className="text-sm text-foreground/80">{activity.description}</p>}
                  {activity.learning_activity_media?.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {activity.learning_activity_media.sort((a: any, b: any) => a.sort_order - b.sort_order).map((m: any) => (
                        <div key={m.id} className="aspect-square rounded-lg overflow-hidden">
                          {m.media_type === "video" ? (
                            <a href={m.media_url} target="_blank" rel="noreferrer" className="block h-full w-full">
                              <VideoThumb src={m.media_url} posterSrc={m.thumbnail_url} badgeSize="sm" />
                            </a>
                          ) : (
                            <img src={m.media_url} alt={m.caption || ""} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-lg" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Journey entries */}
            {!journeyEntries.length && !sharedActivities.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No learning updates yet</CardContent></Card>
            ) : journeyEntries.map((entry: any) => (
              <Card key={entry.id} className={entry.milestone_flag ? "ring-1 ring-accent/30" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {entry.milestone_flag && <Star className="h-4 w-4 text-accent fill-accent" />}
                      {entry.development_domains?.name && (
                        <Badge variant="secondary" className="text-xs">{entry.development_domains.name}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="font-medium text-sm">{entry.title}</p>
                  {entry.parent_summary && <p className="text-sm text-foreground/80">{entry.parent_summary}</p>}
                  {entry.learning_journey_media?.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {entry.learning_journey_media.map((m: any) => (
                        <img key={m.id} src={m.media_url} alt={m.caption || ""} loading="lazy" decoding="async" className="w-20 h-20 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Milestones */}
          <TabsContent value="milestones" className="space-y-3 mt-4">
            {!milestoneEntries.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-lg mb-1">No milestones yet</p>
                <p className="text-sm">Special moments will appear here as your child grows</p>
              </CardContent></Card>
            ) : milestoneEntries.map((entry: any) => (
              <Card key={entry.id} className="ring-1 ring-accent/20 bg-accent/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-accent fill-accent" />
                    <span className="font-semibold text-sm">{entry.title}</span>
                  </div>
                  {entry.parent_summary && <p className="text-sm text-foreground/80">{entry.parent_summary}</p>}
                  {entry.development_domains?.name && (
                    <Badge variant="secondary" className="text-xs">{entry.development_domains.name}</Badge>
                  )}
                  <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</p>
                  {entry.learning_journey_media?.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {entry.learning_journey_media.map((m: any) => (
                        <img key={m.id} src={m.media_url} alt={m.caption || ""} loading="lazy" decoding="async" className="w-24 h-24 rounded-lg object-cover" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Progress */}
          <TabsContent value="progress" className="space-y-3 mt-4">
            {!evidence.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No progress records yet</CardContent></Card>
            ) : evidence.map((ev: any) => {
              const statusInfo = parentStatusMap[ev.status] || { label: ev.status, color: "bg-muted" };
              return (
                <Card key={ev.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{ev.observation_indicators?.indicator_text || "Observation"}</p>
                        <p className="text-xs text-muted-foreground">{ev.observation_indicators?.development_domains?.name}</p>
                      </div>
                      <Badge className={`${statusInfo.color} text-xs`}>{statusInfo.label}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Monthly Summaries */}
          <TabsContent value="monthly" className="space-y-4 mt-4">
            {!monthlySummaries.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-lg mb-1">No monthly summaries yet</p>
                <p className="text-sm">Your child's teacher will share monthly summaries here</p>
              </CardContent></Card>
            ) : monthlySummaries.map((s: any) => (
              <Card key={s.id} className="border-primary/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {monthNames[s.month - 1]} {s.year}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-foreground/80">{s.summary_text}</p>
                  {s.strengths_json?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">✨ Strengths</p>
                      <div className="flex flex-wrap gap-1">
                        {(s.strengths_json as string[]).map((str, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{str}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.home_extensions_json?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">🏠 Try at Home</p>
                      <ul className="space-y-0.5">
                        {(s.home_extensions_json as string[]).map((ext, i) => (
                          <li key={i} className="text-xs text-foreground/70">• {ext}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{s.entry_count} learning updates</span>
                    {s.milestone_count > 0 && <span>• {s.milestone_count} milestones</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* PTM Reports */}
          <TabsContent value="ptm" className="space-y-3 mt-4">
            {!ptmReports.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-lg mb-1">No PTM reports yet</p>
                <p className="text-sm">Conference reports will appear here after meetings</p>
              </CardContent></Card>
            ) : ptmReports.map((report: any) => (
              <Card key={report.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {report.academic_term || "Conference Report"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {report.action_plan_json && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Next Steps</p>
                      {Array.isArray(report.action_plan_json) && report.action_plan_json.map((item: any, i: number) => (
                        <p key={i} className="text-xs text-foreground/70">• {typeof item === "string" ? item : item.action || item.description || JSON.stringify(item)}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
