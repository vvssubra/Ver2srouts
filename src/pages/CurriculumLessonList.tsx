import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Eye, Trash2, Loader2, BookOpen, ChevronRight, Sparkles, Send } from "lucide-react";
import { format } from "date-fns";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function CurriculumLessonList() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch, branches } = useGlobalBranch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", selectedBranch],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, class_name, age_group")
        .eq("branch_id", selectedBranch).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!selectedBranch,
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["curriculum-lessons", selectedBranch, selectedClass, statusFilter],
    queryFn: async () => {
      let q: any = supabase.from("lesson_plans")
        .select("id, title, age_group, theme, status, created_at, plan_mode, class_id, classes(class_name)")
        .order("created_at", { ascending: false });

      if (selectedClass && selectedClass !== "all") {
        q = q.eq("class_id", selectedClass);
      } else if (selectedBranch) {
        q = q.eq("branch_id", selectedBranch);
      }

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data } = await q.limit(100);
      return data ?? [];
    },
    enabled: !!selectedBranch,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lesson_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["curriculum-lessons"] });
    },
  });

  const submitForReviewMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("lesson_plans")
        .update({ review_status: "ready_for_review", status: "pending_review" } as any)
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Submitted for review" });
      queryClient.invalidateQueries({ queryKey: ["curriculum-lessons"] });
    },
  });

  const reviewStatusLabel = (rs: string) => {
    const labels: Record<string, string> = {
      draft: "Draft", ready_for_review: "Pending Review",
      approved: "Approved", published: "Published",
      returned_for_revision: "Needs Revision",
    };
    return labels[rs] || rs;
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Curriculum</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">Lesson Plans</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Lesson Plans</h1>
            <p className="text-muted-foreground">Curriculum-aligned lesson plans</p>
          </div>
          <Button onClick={() => navigate("/lesson-planner")}>
            <Sparkles className="h-4 w-4 mr-2" /> Generate New Plan
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Branch</Label>
              </div>
              <div>
                <Label>Class</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plans list */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : plans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No lesson plans yet</h3>
              <p className="text-muted-foreground mb-4">Generate your first curriculum-aligned lesson plan</p>
              <Button onClick={() => navigate("/lesson-planner")}>
                <Sparkles className="h-4 w-4 mr-2" /> Generate Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan: any) => (
                  <TableRow key={plan.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/curriculum/lessons/${plan.id}`)}>
                    <TableCell className="font-medium">{plan.title}</TableCell>
                    <TableCell>{plan.classes?.class_name || "—"}</TableCell>
                    <TableCell>{plan.age_group}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{plan.theme}</TableCell>
                   <TableCell>
                      {(() => {
                        const rs = (plan as any).review_status || "draft";
                        const labels: Record<string, { text: string; cls: string }> = {
                          draft: { text: "Draft", cls: "" },
                          ready_for_review: { text: "Pending Review", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" },
                          approved: { text: "Approved", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300" },
                          published: { text: "Published", cls: "bg-primary/15 text-primary border-primary/30" },
                          returned_for_revision: { text: "Needs Revision", cls: "bg-destructive/15 text-destructive border-destructive/30" },
                        };
                        const cfg = labels[rs] || labels.draft;
                        return <Badge variant="outline" className={cfg.cls}>{cfg.text}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(plan.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {((plan as any).review_status || "draft") === "draft" && (
                          <Button size="sm" variant="ghost" className="text-primary" onClick={() => submitForReviewMutation.mutate(plan.id)}>
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(plan.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
