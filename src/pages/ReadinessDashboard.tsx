import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors: Record<string, string> = {
  building: "bg-destructive/15 text-destructive",
  growing: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))]",
  confident: "bg-accent/15 text-accent",
};

const domainKeys = ["language", "literacy", "numeracy", "motor", "social", "self_help"] as const;
const domainLabels: Record<string, string> = {
  language: "Language",
  literacy: "Literacy",
  numeracy: "Numeracy",
  motor: "Motor",
  social: "Social",
  self_help: "Self-Help",
};

export default function ReadinessDashboard() {
  const { user } = useAuth();
  const [selectedTerm, setSelectedTerm] = useState("Term 1");

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-readiness-dash"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = memberships[0]?.branch_id || "";

  const { data: classes = [] } = useQuery({
    queryKey: ["readiness-dash-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["readiness-dash-snapshots", branchId, selectedTerm],
    queryFn: async () => {
      const classIds = classes.map((c: any) => c.id);
      if (!classIds.length) return [];
      const { data } = await supabase
        .from("class_readiness_snapshots")
        .select("*")
        .in("class_id", classIds)
        .eq("term", selectedTerm)
        .order("created_at", { ascending: false });
      // Deduplicate: latest per class
      const seen = new Set<string>();
      return (data ?? []).filter((s: any) => {
        if (seen.has(s.class_id)) return false;
        seen.add(s.class_id);
        return true;
      });
    },
    enabled: classes.length > 0,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Readiness Dashboard</h1>
            <p className="text-sm text-muted-foreground">Cross-class readiness comparison by domain</p>
          </div>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Term 1", "Term 2", "Term 3", "Term 4"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!snapshots.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg mb-2">No readiness data yet</p>
            <p className="text-sm">Generate snapshots from the Class Readiness page first</p>
          </CardContent></Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Class</th>
                  {domainKeys.map(k => (
                    <th key={k} className="text-center py-2 px-2 font-medium">{domainLabels[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap: any) => {
                  const cls = classes.find((c: any) => c.id === snap.class_id);
                  return (
                    <tr key={snap.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-3 font-medium">{cls?.class_name || "Unknown"}</td>
                      {domainKeys.map(key => {
                        const data = snap[`${key}_summary_json`] as any;
                        const status = data?.overall_status || "N/A";
                        return (
                          <td key={key} className="py-3 px-2 text-center">
                            <Badge className={`${statusColors[status] || "bg-muted text-muted-foreground"} text-xs`}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Badge>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
