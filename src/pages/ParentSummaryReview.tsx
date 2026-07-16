import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Eye, EyeOff, Sparkles, Loader2, Edit2, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ParentSummaryReview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [classFilter, setClassFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches-review"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = memberships[0]?.branch_id || "";
  const { teacherClassIds } = useTeacherClasses(branchId);

  const { data: classes = [] } = useQuery({
    queryKey: ["review-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Pending entries = have parent_summary but not yet visible
  const { data: pendingEntries = [], isLoading } = useQuery({
    queryKey: ["pending-parent-review", classFilter],
    queryFn: async () => {
      let query = supabase
        .from("daily_learning_journey_entries")
        .select("*, students(first_name, last_name, class_id, class_name), development_domains(name)")
        .eq("visible_to_parent", false)
        .not("parent_summary", "is", null)
        .order("created_at", { ascending: false });
      const { data } = await query;
      let list = data ?? [];
      if (teacherClassIds) {
        list = list.filter((e: any) => e.students?.class_id && teacherClassIds.includes(e.students.class_id));
      }
      if (classFilter !== "all") {
        list = list.filter((e: any) => e.class_id === classFilter);
      }
      return list;
    },
    enabled: !!user,
  });

  const approveEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from("daily_learning_journey_entries")
        .update({ visible_to_parent: true } as any)
        .eq("id", entryId);
      if (error) throw error;
      // Create parent feed notifications
      const entry = pendingEntries.find((e: any) => e.id === entryId);
      if (entry) {
        const { data: parentLinks } = await supabase.from("parent_students")
          .select("parent_id").eq("student_id", entry.student_id).eq("status", "approved");
        if (parentLinks?.length) {
          await supabase.from("parent_feed_notifications").insert(
            parentLinks.map((pl: any) => ({ parent_id: pl.parent_id, journey_entry_id: entryId })) as any
          );
          // Push + bell to parents (deep-link to /journey)
          const childName = entry.students?.first_name || "your child";
          const { notifyParents } = await import("@/lib/parent-notify");
          await notifyParents({
            userIds: parentLinks.map((pl: any) => pl.parent_id),
            title: `✨ New update for ${childName}`,
            message: (entry.parent_summary || "A new learning moment has been shared.").slice(0, 200),
            type: "learning_journey",
            actionUrl: "/journey",
            referenceId: entryId,
            groupKey: `journey:${entry.student_id}`,
            priority: "normal",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-parent-review"] });
      toast({ title: "Approved & shared with parent" });
    },
  });

  const updateSummary = useMutation({
    mutationFn: async ({ id, summary }: { id: string; summary: string }) => {
      const { error } = await supabase.from("daily_learning_journey_entries")
        .update({ parent_summary: summary } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-parent-review"] });
      setEditingId(null);
      toast({ title: "Summary updated" });
    },
  });

  const approveAll = async () => {
    for (const entry of pendingEntries) {
      await approveEntry.mutateAsync(entry.id);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Parent Summary Review</h1>
            <p className="text-sm text-muted-foreground">Review and approve observations before sharing with parents</p>
          </div>
          {pendingEntries.length > 0 && (
            <Button onClick={approveAll} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> Approve All ({pendingEntries.length})
            </Button>
          )}
        </div>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.filter((c: any) => !teacherClassIds || teacherClassIds.includes(c.id)).map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid gap-3">
          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : !pendingEntries.length ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-accent" />
              <p className="text-lg mb-1">All caught up!</p>
              <p className="text-sm">No observations pending review</p>
            </CardContent></Card>
          ) : pendingEntries.map((entry: any) => (
            <Card key={entry.id} className="border-l-4 border-l-primary/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{entry.students?.first_name} {entry.students?.last_name}</span>
                      <Badge variant="outline" className="text-xs">{entry.students?.class_name}</Badge>
                      {entry.development_domains?.name && (
                        <Badge variant="secondary" className="text-xs">{entry.development_domains.name}</Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm mt-1">{entry.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</span>
                </div>

                {entry.teacher_note && (
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Teacher Note (internal)</p>
                    <p className="text-sm">{entry.teacher_note}</p>
                  </div>
                )}

                <div className="bg-primary/5 rounded-lg border border-primary/10 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-primary">Parent Summary</p>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => {
                        if (editingId === entry.id) { setEditingId(null); }
                        else { setEditingId(entry.id); setEditSummary(entry.parent_summary || ""); }
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {editingId === entry.id ? (
                    <div className="space-y-2">
                      <Textarea value={editSummary} onChange={e => setEditSummary(e.target.value)} rows={3} />
                      <Button size="sm" onClick={() => updateSummary.mutate({ id: entry.id, summary: editSummary })} className="gap-1">
                        <Save className="h-3 w-3" /> Save
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/80">{entry.parent_summary}</p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => approveEntry.mutate(entry.id)}
                    disabled={approveEntry.isPending}
                    className="gap-2"
                  >
                    <Eye className="h-3.5 w-3.5" /> Approve & Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
