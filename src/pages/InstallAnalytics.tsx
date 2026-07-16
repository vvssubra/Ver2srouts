import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBranches } from "@/hooks/use-branches";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { Smartphone } from "lucide-react";

type EventName =
  | "get_mobile_app_clicked"
  | "install_page_viewed"
  | "install_prompt_available"
  | "install_prompt_accepted"
  | "install_completed";

const FUNNEL_STEPS: { key: EventName; label: string }[] = [
  { key: "get_mobile_app_clicked", label: "Clicked CTA" },
  { key: "install_page_viewed", label: "Page viewed" },
  { key: "install_prompt_available", label: "Prompt shown" },
  { key: "install_prompt_accepted", label: "Prompt accepted" },
  { key: "install_completed", label: "Installed" },
];

interface AnalyticsRow {
  event_name: string;
  role: string | null;
  branch_id: string | null;
  path: string | null;
  platform: string | null;
  display_mode: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
}

function inferVariant(row: AnalyticsRow): "parents" | "teachers" | "unknown" {
  const v = (row.properties as any)?.variant;
  if (v === "parents" || v === "teachers") return v;
  if (row.path?.includes("/install/parents")) return "parents";
  if (row.path?.includes("/install/teachers")) return "teachers";
  // Fall back to role inference
  if (row.role === "parent") return "parents";
  if (row.role === "teacher") return "teachers";
  return "unknown";
}

export default function InstallAnalytics() {
  const { branches } = useBranches();
  const [days, setDays] = useState<string>("30");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [variantFilter, setVariantFilter] = useState<string>("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["install-analytics", days],
    queryFn: async (): Promise<AnalyticsRow[]> => {
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, role, branch_id, path, platform, display_mode, properties, created_at")
        .in("event_name", FUNNEL_STEPS.map((s) => s.key))
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data || []) as AnalyticsRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (branchFilter !== "all" && r.branch_id !== branchFilter) return false;
      if (variantFilter !== "all" && inferVariant(r) !== variantFilter) return false;
      return true;
    });
  }, [rows, branchFilter, variantFilter]);

  // Overall funnel counts
  const funnelCounts = useMemo(() => {
    const map: Record<string, number> = {};
    FUNNEL_STEPS.forEach((s) => (map[s.key] = 0));
    filtered.forEach((r) => {
      if (map[r.event_name] !== undefined) map[r.event_name] += 1;
    });
    return FUNNEL_STEPS.map((s) => ({
      step: s.label,
      count: map[s.key],
    }));
  }, [filtered]);

  // By variant (parents/teachers)
  const byVariant = useMemo(() => {
    const init = () => Object.fromEntries(FUNNEL_STEPS.map((s) => [s.key, 0])) as Record<string, number>;
    const buckets: Record<string, Record<string, number>> = {
      parents: init(),
      teachers: init(),
      unknown: init(),
    };
    filtered.forEach((r) => {
      const v = inferVariant(r);
      if (buckets[v][r.event_name] !== undefined) buckets[v][r.event_name] += 1;
    });
    return FUNNEL_STEPS.map((s) => ({
      step: s.label,
      parents: buckets.parents[s.key],
      teachers: buckets.teachers[s.key],
      unknown: buckets.unknown[s.key],
    }));
  }, [filtered]);

  // By tenant (branch)
  const byBranch = useMemo(() => {
    const branchMap: Record<string, Record<string, number>> = {};
    filtered.forEach((r) => {
      const id = r.branch_id ?? "__none__";
      if (!branchMap[id]) branchMap[id] = Object.fromEntries(FUNNEL_STEPS.map((s) => [s.key, 0]));
      if (branchMap[id][r.event_name] !== undefined) branchMap[id][r.event_name] += 1;
    });
    const branchName = (id: string) =>
      id === "__none__" ? "(unattributed)" : branches.find((b) => b.id === id)?.name ?? id.slice(0, 8);
    return Object.entries(branchMap)
      .map(([id, counts]) => ({
        branchId: id,
        branch: branchName(id),
        ...counts,
        conversion:
          counts.get_mobile_app_clicked > 0
            ? Math.round((counts.install_completed / counts.get_mobile_app_clicked) * 100)
            : 0,
      }))
      .sort((a, b) => (b as any).get_mobile_app_clicked - (a as any).get_mobile_app_clicked);
  }, [filtered, branches]);

  // By role
  const byRole = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    filtered.forEach((r) => {
      const role = r.role ?? "(anonymous)";
      if (!map[role]) map[role] = Object.fromEntries(FUNNEL_STEPS.map((s) => [s.key, 0]));
      if (map[role][r.event_name] !== undefined) map[role][r.event_name] += 1;
    });
    return Object.entries(map).map(([role, counts]) => ({
      role,
      ...counts,
      conversion:
        counts.get_mobile_app_clicked > 0
          ? Math.round((counts.install_completed / counts.get_mobile_app_clicked) * 100)
          : 0,
    }));
  }, [filtered]);

  const totalClicked = funnelCounts[0]?.count ?? 0;
  const totalInstalled = funnelCounts[funnelCounts.length - 1]?.count ?? 0;
  const overallConversion = totalClicked > 0 ? Math.round((totalInstalled / totalClicked) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Smartphone className="h-6 w-6 text-primary" />
              Install Funnel Analytics
            </h1>
            <p className="text-sm text-muted-foreground">
              PWA installation funnel for parents and teachers across tenants and roles.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Select value={variantFilter} onValueChange={setVariantFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All apps</SelectItem>
                <SelectItem value="parents">Parents app</SelectItem>
                <SelectItem value="teachers">Teachers app</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tenants</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="CTA clicks" value={totalClicked} />
          <KpiCard label="Page views" value={funnelCounts[1]?.count ?? 0} />
          <KpiCard label="Installed" value={totalInstalled} />
          <KpiCard label="Click → Install" value={`${overallConversion}%`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overall funnel</CardTitle>
            <CardDescription>Step counts within selected filters</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelCounts}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="variant" className="w-full">
          <TabsList>
            <TabsTrigger value="variant">By app</TabsTrigger>
            <TabsTrigger value="tenant">By tenant</TabsTrigger>
            <TabsTrigger value="role">By role</TabsTrigger>
          </TabsList>

          <TabsContent value="variant" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funnel by app</CardTitle>
                <CardDescription>Parents vs teachers PWA install path</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byVariant}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Legend />
                    <Bar dataKey="parents" fill="hsl(var(--role-parent))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="teachers" fill="hsl(var(--role-teacher))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="unknown" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tenant" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funnel by tenant</CardTitle>
                <CardDescription>Each row counts events from that branch</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      {FUNNEL_STEPS.map((s) => (
                        <TableHead key={s.key} className="text-right">{s.label}</TableHead>
                      ))}
                      <TableHead className="text-right">Conv. %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byBranch.length === 0 && (
                      <TableRow><TableCell colSpan={FUNNEL_STEPS.length + 2} className="text-center text-sm text-muted-foreground py-8">No data in range.</TableCell></TableRow>
                    )}
                    {byBranch.map((row) => (
                      <TableRow key={row.branchId}>
                        <TableCell className="font-medium">{row.branch}</TableCell>
                        {FUNNEL_STEPS.map((s) => (
                          <TableCell key={s.key} className="text-right tabular-nums">{(row as any)[s.key]}</TableCell>
                        ))}
                        <TableCell className="text-right">
                          <Badge variant={row.conversion >= 30 ? "default" : "secondary"}>{row.conversion}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="role" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funnel by role</CardTitle>
                <CardDescription>Anonymous = events fired before login (e.g. install page hits)</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      {FUNNEL_STEPS.map((s) => (
                        <TableHead key={s.key} className="text-right">{s.label}</TableHead>
                      ))}
                      <TableHead className="text-right">Conv. %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byRole.length === 0 && (
                      <TableRow><TableCell colSpan={FUNNEL_STEPS.length + 2} className="text-center text-sm text-muted-foreground py-8">No data in range.</TableCell></TableRow>
                    )}
                    {byRole.map((row) => (
                      <TableRow key={row.role}>
                        <TableCell className="font-medium capitalize">{row.role.replace("_", " ")}</TableCell>
                        {FUNNEL_STEPS.map((s) => (
                          <TableCell key={s.key} className="text-right tabular-nums">{(row as any)[s.key]}</TableCell>
                        ))}
                        <TableCell className="text-right">
                          <Badge variant={row.conversion >= 30 ? "default" : "secondary"}>{row.conversion}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}