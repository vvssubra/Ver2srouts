import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Sparkles, Calendar, Users, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

interface PtmPrepProps { embedded?: boolean }
export default function PtmPrep({ embedded = false }: PtmPrepProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeBranchIds: branchIds } = useGlobalBranch();
  const branchIdForTeacher = branchIds[0];
  const { teacherClassIds, isTeacher } = useTeacherClasses(branchIdForTeacher);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const { data: classes } = useQuery({
    queryKey: ["classes", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").in("branch_id", branchIds).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });
  const visibleClasses = isTeacher && teacherClassIds && teacherClassIds.length > 0
    ? (classes ?? []).filter((c: any) => teacherClassIds.includes(c.id))
    : (classes ?? []);

  const { data: students } = useQuery({
    queryKey: ["students-ptm", branchIds, classFilter, isTeacher, (teacherClassIds ?? []).join(",")],
    queryFn: async () => {
      let q = supabase.from("students").select("*").in("branch_id", branchIds).eq("is_active", true).order("first_name");
      if (classFilter !== "all") q = q.eq("class_id", classFilter);
      else if (isTeacher && teacherClassIds && teacherClassIds.length > 0) q = q.in("class_id", teacherClassIds);
      const { data } = await q;
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const { data: reports } = useQuery({
    queryKey: ["ptm-reports-all", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_reports").select("student_id, status, report_type, created_at").in("branch_id", branchIds).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const { data: meetings } = useQuery({
    queryKey: ["ptm-meetings-all", branchIds],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_meetings").select("student_id, status, meeting_date").in("branch_id", branchIds).order("meeting_date", { ascending: false });
      return data ?? [];
    },
    enabled: branchIds.length > 0,
  });

  const filteredStudents = students?.filter((s: any) =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const getStudentReportStatus = (studentId: string) => {
    const studentReports = (reports ?? []).filter((r: any) => r.student_id === studentId);
    if (studentReports.length === 0) return "none";
    return studentReports[0]?.status;
  };

  const getStudentMeeting = (studentId: string) => {
    return (meetings ?? []).find((m: any) => m.student_id === studentId);
  };

  const totalStudents = filteredStudents.length;
  const withReports = filteredStudents.filter(s => getStudentReportStatus(s.id) !== "none").length;
  const published = filteredStudents.filter(s => getStudentReportStatus(s.id) === "published").length;

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>;

  return (
    <Wrapper>
      <div className="space-y-6">
        {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            PTM Preparation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Prepare Parent-Teacher Meeting reports for each student</p>
        </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
              <p className="text-xs text-muted-foreground">Total Students</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-foreground">{withReports}</p>
              <p className="text-xs text-muted-foreground">Reports Generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-accent mb-1" />
              <p className="text-2xl font-bold text-accent">{published}</p>
              <p className="text-xs text-muted-foreground">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="text-2xl font-bold text-destructive">{totalStudents - withReports}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {visibleClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Report Status</TableHead>
                <TableHead>Meeting</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student: any) => {
                const status = getStudentReportStatus(student.id);
                const meeting = getStudentMeeting(student.id);
                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {student.first_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{student.first_name} {student.last_name}</p>
                          <p className="text-xs text-muted-foreground">{student.class_id ? classes?.find((c: any) => c.id === student.class_id)?.class_name : "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        status === "published" ? "bg-accent/15 text-accent border-accent/30" :
                        status === "draft" ? "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30" :
                        "bg-muted text-muted-foreground"
                      }>
                        {status === "none" ? "No Report" : status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {meeting ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Calendar className="h-3 w-3" />
                          {(meeting as any).meeting_date}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => navigate(`/curriculum/ptm/generate/${student.id}`)}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {status === "none" ? "Generate" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No students found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Wrapper>
  );
}