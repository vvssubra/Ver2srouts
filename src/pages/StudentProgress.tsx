import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Printer } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Calendar } from "lucide-react";
import ProgressRadarChart from "@/components/student-progress/ProgressRadarChart";
import WatchdogAlert from "@/components/student-progress/WatchdogAlert";
import AddObservationDialog from "@/components/AddObservationDialog";
import BackToContextBar from "@/components/navigation/BackToContextBar";

const proficiencyColors: Record<string, string> = {
  TP1: "bg-destructive/15 text-destructive border-destructive/30",
  TP2: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  TP3: "bg-accent/15 text-accent border-accent/30",
};

const proficiencyValue: Record<string, number> = { TP1: 1, TP2: 2, TP3: 3 };

export default function StudentProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("grid");
  const [selectedArea, setSelectedArea] = useState("all");

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: areas } = useQuery({
    queryKey: ["learning-areas"],
    queryFn: async () => {
      const { data } = await supabase.from("learning_areas").select("*").order("sort_order");
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: observations } = useQuery({
    queryKey: ["student-observations", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_observations")
        .select("*, curriculum_standards(code, title_ms, title_en, learning_area_id, level)")
        .eq("student_id", id!)
        .order("observed_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  const { data: allStandards } = useQuery({
    queryKey: ["all-standards"],
    queryFn: async () => {
      const { data } = await supabase.from("curriculum_standards").select("*").order("sort_order");
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Compute per-area summary
  const areaSummary = areas?.map((area) => {
    const areaStandards = allStandards?.filter((s) => s.learning_area_id === area.id && s.level === "sub_standard") ?? [];
    const areaObs = observations?.filter((o: any) => o.curriculum_standards?.learning_area_id === area.id) ?? [];

    const latestByStandard = new Map<string, any>();
    areaObs.forEach((o: any) => {
      const existing = latestByStandard.get(o.standard_id);
      if (!existing || o.observed_at > existing.observed_at) {
        latestByStandard.set(o.standard_id, o);
      }
    });

    const assessed = latestByStandard.size;
    const total = areaStandards.length || 1;
    const avgScore = assessed > 0
      ? Array.from(latestByStandard.values()).reduce((sum, o) => sum + proficiencyValue[o.proficiency_level], 0) / assessed
      : 0;

    // Find oldest TP1 observation for watchdog
    const tp1Obs = Array.from(latestByStandard.values()).filter((o) => o.proficiency_level === "TP1");
    const oldestTp1Date = tp1Obs.length > 0
      ? tp1Obs.reduce((oldest, o) => (o.observed_at < oldest ? o.observed_at : oldest), tp1Obs[0].observed_at)
      : null;

    return { area, assessed, total, avgScore, latestByStandard, oldestTp1Date, tp1Count: tp1Obs.length };
  }) ?? [];

  const timeline = observations?.map((obs: any) => ({
    ...obs,
    studentName: student ? `${student.first_name} ${student.last_name}` : "",
  })) ?? [];

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !student) return;

    const today = new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" });
    const totalAssessed = areaSummary.reduce((s, a) => s + a.assessed, 0);
    const totalStandards = areaSummary.reduce((s, a) => s + a.total, 0);

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Laporan Kemajuan – ${student.first_name} ${student.last_name}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #1a1a2e; font-size: 12px; line-height: 1.5; }
      .header { text-align: center; border-bottom: 3px solid #6c3fcf; padding-bottom: 16px; margin-bottom: 20px; }
      .header h1 { font-size: 22px; color: #6c3fcf; margin-bottom: 2px; }
      .header .subtitle { font-size: 11px; color: #666; }
      .student-info { display: flex; justify-content: space-between; background: #f8f7ff; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
      .student-info .name { font-size: 16px; font-weight: 700; }
      .student-info .detail { font-size: 11px; color: #666; }
      .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
      .summary-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; }
      .summary-card .area-code { font-weight: 700; font-size: 13px; color: #6c3fcf; }
      .summary-card .area-name { font-size: 10px; color: #888; margin-bottom: 6px; }
      .summary-card .bar-bg { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
      .summary-card .bar-fill { height: 6px; background: #6c3fcf; border-radius: 3px; }
      .summary-card .stats { display: flex; justify-content: space-between; font-size: 10px; color: #888; margin-top: 4px; }
      .area-section { margin-bottom: 18px; page-break-inside: avoid; }
      .area-section h2 { font-size: 13px; background: #f3f0ff; padding: 6px 10px; border-left: 3px solid #6c3fcf; margin-bottom: 8px; }
      .std-row { display: flex; align-items: center; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
      .std-row .code { width: 70px; font-family: monospace; font-size: 10px; color: #888; flex-shrink: 0; }
      .std-row .title { flex: 1; font-size: 11px; }
      .std-row .badge { font-size: 10px; font-weight: 600; padding: 1px 8px; border-radius: 4px; }
      .std-row .badge-tp1 { background: #fef2f2; color: #ef4444; }
      .std-row .badge-tp2 { background: #fffbeb; color: #d97706; }
      .std-row .badge-tp3 { background: #f0fdfa; color: #0d9488; }
      .std-row .not-assessed { font-size: 10px; color: #ccc; }
      .legend { display: flex; gap: 16px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; justify-content: center; }
      .legend span { font-size: 10px; display: flex; align-items: center; gap: 4px; }
      .legend .dot { width: 8px; height: 8px; border-radius: 50%; }
      .footer { text-align: center; font-size: 9px; color: #aaa; margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div class="header">
      <h1>📋 Laporan Kemajuan Pelajar</h1>
      <div class="subtitle">Student Progress Report · KP2026 Curriculum</div>
    </div>
    <div class="student-info">
      <div>
        <div class="name">${student.first_name} ${student.last_name}</div>
        <div class="detail">${student.date_of_birth ? `Tarikh Lahir: ${student.date_of_birth}` : ""}${student.gender ? ` · ${student.gender === "male" ? "Lelaki" : "Perempuan"}` : ""}</div>
      </div>
      <div style="text-align:right;">
        <div class="detail">Tarikh Laporan: ${today}</div>
        <div class="detail">Standard dinilai: ${totalAssessed} / ${totalStandards}</div>
      </div>
    </div>
    <div class="summary-grid">
      ${areaSummary.map(({ area, assessed, total, avgScore }) => `
        <div class="summary-card">
          <div class="area-code">${area.code}</div>
          <div class="area-name">${area.name_ms}</div>
          <div class="bar-bg"><div class="bar-fill" style="width:${Math.round((assessed / total) * 100)}%"></div></div>
          <div class="stats">
            <span>${assessed}/${total} dinilai</span>
            ${avgScore > 0 ? `<span>Purata: ${avgScore >= 2.5 ? "TP3" : avgScore >= 1.5 ? "TP2" : "TP1"}</span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
    ${areaSummary.map(({ area, latestByStandard }) => {
      const areaStds = allStandards?.filter((s) => s.learning_area_id === area.id && s.level !== "skill") ?? [];
      if (!areaStds.length) return "";
      return `<div class="area-section">
        <h2>${area.code} – ${area.name_ms}</h2>
        ${areaStds.map((std) => {
          const obs = latestByStandard.get(std.id);
          return `<div class="std-row">
            <span class="code">${std.code}</span>
            <span class="title">${std.title_ms}</span>
            ${obs
              ? `<span class="badge badge-${obs.proficiency_level.toLowerCase()}">${obs.proficiency_level}</span>`
              : `<span class="not-assessed">—</span>`}
          </div>`;
        }).join("")}
      </div>`;
    }).join("")}
    <div class="legend">
      <span><span class="dot" style="background:#ef4444"></span> TP1 – Belum Menguasai</span>
      <span><span class="dot" style="background:#f59e0b"></span> TP2 – Menguasai</span>
      <span><span class="dot" style="background:#14b8a6"></span> TP3 – Melebihi</span>
    </div>
    <div class="footer">Dijana oleh Preschool OS · ${today}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <BackToContextBar
              fallbackLabel="Back"
              onFallback={() => navigate(-1)}
            />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {student ? `${student.first_name} ${student.last_name}` : "Loading..."}
              </h1>
              <p className="text-sm text-muted-foreground">Student Progress Report / Laporan Kemajuan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {areas && allStandards && student && (
              <AddObservationDialog
                students={student ? [student] : []}
                areas={areas ?? []}
                standards={allStandards ?? []}
                selectedArea={selectedArea}
                setSelectedArea={setSelectedArea}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ["student-observations", id] })}
              />
            )}
            <Button variant="outline" size="sm" onClick={handlePrintReport} disabled={!student}>
              <Printer className="mr-1.5 h-4 w-4" />Print Report
            </Button>
          </div>
        </div>

        {/* AI Watchdog Alert */}
        <WatchdogAlert areaSummary={areaSummary} />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="grid">Progress Grid</TabsTrigger>
            <TabsTrigger value="detail">Detailed Report</TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-4">
            {/* Radar Chart */}
            <ProgressRadarChart areaSummary={areaSummary} />

            {/* Overview cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {areaSummary.map(({ area, assessed, total, avgScore }) => (
                <Card key={area.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <span>{area.code} – {area.name_ms}</span>
                      <Badge variant="outline" className="text-xs">
                        {assessed}/{total}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress value={total > 0 ? (assessed / total) * 100 : 0} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{assessed} standards assessed</span>
                      {avgScore > 0 && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Avg: {avgScore >= 2.5 ? "TP3" : avgScore >= 1.5 ? "TP2" : "TP1"}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Per-area standard grid */}
            {areaSummary.map(({ area, latestByStandard }) => {
              const areaStds = allStandards?.filter((s) => s.learning_area_id === area.id && s.level !== "skill") ?? [];
              if (!areaStds.length) return null;
              return (
                <Card key={area.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">{area.code} – {area.name_ms}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2">
                      {areaStds.map((std) => {
                        const obs = latestByStandard.get(std.id);
                        return (
                          <div key={std.id} className="flex items-center gap-3 text-sm">
                            <span className="w-20 font-mono text-xs text-muted-foreground">{std.code}</span>
                            <span className="flex-1 truncate">{std.title_ms}</span>
                            {obs ? (
                              <Badge variant="outline" className={proficiencyColors[obs.proficiency_level]}>
                                {obs.proficiency_level}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="detail" className="space-y-3">
            {!timeline.length ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No observations recorded yet.</CardContent></Card>
            ) : timeline.map((obs: any) => (
              <Card key={obs.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={proficiencyColors[obs.proficiency_level]}>
                        {obs.proficiency_level}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {obs.curriculum_standards?.code}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {obs.curriculum_standards?.title_ms}
                      {obs.curriculum_standards?.title_en ? ` / ${obs.curriculum_standards.title_en}` : ""}
                    </p>
                    {obs.notes && <p className="text-sm text-foreground/80">{obs.notes}</p>}
                    {obs.evidence_url && (
                      <a href={obs.evidence_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">
                        View Evidence
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                    <Calendar className="h-3 w-3" />{obs.observed_at}
                  </span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}
