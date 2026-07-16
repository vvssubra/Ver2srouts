import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { BarChart3, Layers, Target, AlertTriangle } from "lucide-react";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";

export default function CurriculumCoverageDashboard() {
  const { branches } = useGlobalBranch();
  const activeBranchId = branches[0]?.id;
  const [classFilter, setClassFilter] = useState("all");

  const { data: classes } = useQuery({
    queryKey: ["classes", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", activeBranchId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: domains, isLoading: loadingDomains } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: outcomes } = useQuery({
    queryKey: ["yearly-outcomes-coverage"],
    queryFn: async () => {
      const { data } = await supabase.from("yearly_outcomes").select("*");
      return data ?? [];
    },
  });

  const { data: coverageLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ["coverage-logs", activeBranchId, classFilter],
    queryFn: async () => {
      let q = supabase.from("class_coverage_logs").select("*").eq("branch_id", activeBranchId!);
      if (classFilter !== "all") q = q.eq("class_id", classFilter);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: themes } = useQuery({
    queryKey: ["theme-bank"],
    queryFn: async () => {
      const { data } = await supabase.from("theme_bank").select("*");
      return data ?? [];
    },
  });

  const isLoading = loadingDomains || loadingLogs;

  const domainCoverage = domains?.map((domain: any) => {
    const domainOutcomes = outcomes?.filter((o: any) => o.domain_id === domain.id) ?? [];
    const coveredOutcomeIds = new Set(
      coverageLogs?.filter((l: any) => l.domain_id === domain.id).map((l: any) => l.outcome_id)
    );
    const covered = coveredOutcomeIds.size;
    const total = domainOutcomes.length || 1;
    const pct = Math.round((covered / total) * 100);
    return { domain, covered, total, pct };
  }) ?? [];

  const themeFreq = new Map<string, number>();
  coverageLogs?.forEach((l: any) => {
    if (l.theme_bank_id) themeFreq.set(l.theme_bank_id, (themeFreq.get(l.theme_bank_id) || 0) + 1);
  });
  const topThemes = Array.from(themeFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ theme: themes?.find((t: any) => t.id === id), count }));

  const weakDomains = domainCoverage.filter(d => d.pct < 30);
  const totalCoverage = domainCoverage.length > 0
    ? Math.round(domainCoverage.reduce((s, d) => s + d.pct, 0) / domainCoverage.length)
    : 0;

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="quality" />
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Curriculum Coverage
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Track domain and outcome coverage across classes</p>
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="All Classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="p-4 text-center">
                  <Layers className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{totalCoverage}%</p>
                  <p className="text-xs text-muted-foreground">Overall Coverage</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Target className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{coverageLogs?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Coverage Entries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${weakDomains.length > 0 ? "text-destructive" : "text-accent"}`} />
                  <p className="text-2xl font-bold">{weakDomains.length}</p>
                  <p className="text-xs text-muted-foreground">Weak Domains</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{domains?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Domains</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Domain Coverage Bars */}
        <Card>
          <CardHeader><CardTitle className="text-base">Domain Coverage</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : domainCoverage.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No coverage data recorded</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Coverage logs are created when lesson plans are linked to curriculum outcomes.</p>
              </div>
            ) : (
              domainCoverage.map(({ domain, covered, total, pct }) => (
                <div key={domain.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{domain.name_en || domain.code}</span>
                    <span className="text-xs text-muted-foreground">{covered}/{total} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Themes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Most Used Themes</CardTitle></CardHeader>
          <CardContent>
            {topThemes.length > 0 ? (
              <div className="space-y-2">
                {topThemes.map(({ theme, count }, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm">{(theme as any)?.theme_name_en || theme?.theme_name || "Unknown"}</span>
                    <Badge variant="outline">{count} uses</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Target className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No theme data yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Themes appear once lesson plans reference the theme bank.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weak Areas Alert */}
        {weakDomains.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Underplanned Areas</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weakDomains.map(({ domain, pct }) => (
                  <div key={domain.id} className="flex items-center justify-between p-2 rounded border border-destructive/20 bg-destructive/5">
                    <span className="text-sm font-medium">{domain.name_en || domain.code}</span>
                    <Badge variant="outline" className="text-destructive">{pct}% covered</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
