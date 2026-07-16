import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Calendar, CheckCircle2, Clock, AlertTriangle, ClipboardList, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatePtmReportPdf } from "@/lib/ptm-pdf";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function PtmCompletionDashboard() {
  const { branches } = useGlobalBranch();
  const activeBranchId = branches[0]?.id;

  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ["ptm-reports-dashboard", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_reports").select("*, students(first_name, last_name)").eq("branch_id", activeBranchId!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: meetings, isLoading: loadingMeetings } = useQuery({
    queryKey: ["ptm-meetings-dashboard", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_meetings" as any).select("*").eq("branch_id", activeBranchId!).order("meeting_date", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!activeBranchId,
  });

  const { data: actionItems, isLoading: loadingActions } = useQuery({
    queryKey: ["ptm-actions-dashboard", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_action_items" as any).select("*, students(first_name, last_name)").eq("branch_id", activeBranchId!);
      return (data ?? []) as any[];
    },
    enabled: !!activeBranchId,
  });

  const isLoading = loadingReports || loadingMeetings || loadingActions;

  const draftReports = reports?.filter((r: any) => r.status === "draft").length || 0;
  const publishedReports = reports?.filter((r: any) => r.status === "published").length || 0;
  const upcomingMeetings = meetings?.filter((m: any) => m.status === "scheduled" && new Date(m.meeting_date) >= new Date()).length || 0;
  const overdueActions = actionItems?.filter((a: any) => a.status === "pending" && a.due_date && new Date(a.due_date) < new Date()).length || 0;

  const hasNoData = !isLoading && (reports?.length || 0) === 0 && (meetings?.length || 0) === 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            PTM Completion Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track PTM report generation, meetings, and action items</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="p-4 text-center">
                  <Clock className="h-5 w-5 mx-auto text-[hsl(var(--role-teacher))] mb-1" />
                  <p className="text-2xl font-bold">{draftReports}</p>
                  <p className="text-xs text-muted-foreground">Draft Reports</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto text-accent mb-1" />
                  <p className="text-2xl font-bold text-accent">{publishedReports}</p>
                  <p className="text-xs text-muted-foreground">Published</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Calendar className="h-5 w-5 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{upcomingMeetings}</p>
                  <p className="text-xs text-muted-foreground">Upcoming Meetings</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <AlertTriangle className={`h-5 w-5 mx-auto mb-1 ${overdueActions > 0 ? "text-destructive" : "text-accent"}`} />
                  <p className="text-2xl font-bold">{overdueActions}</p>
                  <p className="text-xs text-muted-foreground">Overdue Actions</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Recent Reports */}
        <Card>
          <CardHeader><CardTitle className="text-base">Recent PTM Reports</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : hasNoData ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No PTM reports or meetings found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Generate PTM reports from the PTM Prep page to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Term</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports?.slice(0, 20).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">{r.students?.first_name} {r.students?.last_name}</TableCell>
                        <TableCell>{r.term_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.report_type || "summary"}</Badge></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            r.status === "published" ? "bg-accent/15 text-accent border-accent/30" : "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30"
                          }>{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => generatePtmReportPdf(r)}
                          >
                            <Download className="h-3 w-3 mr-1" /> PDF
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {reports?.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No reports yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Actions */}
        {overdueActions > 0 && (
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Overdue Action Items</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {actionItems?.filter((a: any) => a.status === "pending" && a.due_date && new Date(a.due_date) < new Date()).map((a: any) => (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded border border-destructive/20 bg-destructive/5">
                  <div>
                    <p className="text-sm font-medium">{a.action_text}</p>
                    <p className="text-xs text-muted-foreground">Owner: {a.action_owner} | Due: {a.due_date}</p>
                  </div>
                  <Badge variant="outline" className="text-destructive w-fit">Overdue</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
