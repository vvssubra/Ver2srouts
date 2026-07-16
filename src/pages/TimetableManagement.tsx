import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, GraduationCap, Settings2, UserRound, Printer } from "lucide-react";
import { ArrowLeft, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MonthlyTimetableView from "@/components/MonthlyTimetableView";
import ScheduleEditorSheet from "@/components/ScheduleEditorSheet";
import TeacherScheduleView from "@/components/TeacherScheduleView";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Badge } from "@/components/ui/badge";
import { programLabel, programBadgeVariant, type ProgramType } from "@/lib/programType";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

const NON_TEACHING_SUBJECTS = ["Assembly", "Break", "Event / Activity"];
const ENRICHMENT_SUBJECTS = [
  "Arts & Craft", "Science Explorer", "Public Speaking & Leadership",
  "Practical Life Skills", "Cooking & Nutrition", "Outdoor Adventure & Nature",
  "Music & Movement", "Drama & Storytelling", "STEM Robotics", "Gardening",
];

export default function TimetableManagement() {
  const { user, role } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const isTeacher = role === "teacher";
  const LAST_CLASS_KEY = selectedBranch ? `timetable.lastClass.${selectedBranch}` : "";
  const LAST_TEACHER_KEY = selectedBranch ? `timetable.lastTeacher.${selectedBranch}` : "";
  const VIEW_MODE_KEY = selectedBranch ? `timetable.viewMode.${selectedBranch}` : "";
  const [selectedClass, setSelectedClass] = useState<string>(() => {
    if (typeof window === "undefined" || !LAST_CLASS_KEY) return "";
    return window.localStorage.getItem(LAST_CLASS_KEY) || "";
  });
  const [selectedTeacher, setSelectedTeacher] = useState<string>(() => {
    if (typeof window === "undefined" || !LAST_TEACHER_KEY) return "";
    return window.localStorage.getItem(LAST_TEACHER_KEY) || "";
  });
  const [viewMode, setViewMode] = useState<"class" | "teacher">(() => {
    if (typeof window === "undefined" || !VIEW_MODE_KEY) return "class";
    return (window.localStorage.getItem(VIEW_MODE_KEY) as any) || "class";
  });
  const [programFilter, setProgramFilter] = useState<"all" | ProgramType>("all");
  const [editorOpen, setEditorOpen] = useState(false);

  // Persist class choice across navigations
  useEffect(() => {
    if (!LAST_CLASS_KEY || !selectedClass) return;
    window.localStorage.setItem(LAST_CLASS_KEY, selectedClass);
  }, [LAST_CLASS_KEY, selectedClass]);

  useEffect(() => {
    if (!LAST_TEACHER_KEY || !selectedTeacher) return;
    window.localStorage.setItem(LAST_TEACHER_KEY, selectedTeacher);
  }, [LAST_TEACHER_KEY, selectedTeacher]);

  useEffect(() => {
    if (!VIEW_MODE_KEY) return;
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [VIEW_MODE_KEY, viewMode]);

  // When branch changes, load that branch's last class
  useEffect(() => {
    if (!LAST_CLASS_KEY) return;
    const stored = window.localStorage.getItem(LAST_CLASS_KEY) || "";
    setSelectedClass(stored);
    const storedT = window.localStorage.getItem(LAST_TEACHER_KEY) || "";
    setSelectedTeacher(storedT);
  }, [LAST_CLASS_KEY, LAST_TEACHER_KEY]);

  const { data: memberships = [] } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const branches = memberships.map((m: any) => m.branches).filter(Boolean);
  const branchId = selectedBranch;
  const { teacherClassIds } = useTeacherClasses(branchId);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Teachers in this branch (anyone with at least one assigned class)
  const { data: branchTeachers = [] } = useQuery({
    queryKey: ["branch-teachers", branchId],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("branch_memberships")
        .select("user_id, assigned_class_ids")
        .eq("branch_id", branchId);
      const withClasses = (members ?? []).filter(
        (m: any) => Array.isArray(m.assigned_class_ids) && m.assigned_class_ids.length > 0,
      );
      if (withClasses.length === 0) return [];
      const userIds = withClasses.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      return (profiles ?? [])
        .map((p: any) => ({
          id: p.id,
          name:
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            p.email ||
            "Unnamed staff",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!branchId && viewMode === "teacher",
    staleTime: 5 * 60_000,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subject-map"],
    queryFn: async () => {
      const { data } = await supabase.from("subject_standard_map").select("*").order("subject_name");
      return data ?? [];
    },
  });

  const visibleClasses = classes
    .filter((c: any) =>
      programFilter === "all" ? true : (c.program_type ?? "preschool") === programFilter
    )
    .filter((c: any) => {
      if (!isTeacher) return true;
      if (!teacherClassIds || teacherClassIds.length === 0) return false;
      return teacherClassIds.includes(c.id);
    });
  const classId =
    (selectedClass && visibleClasses.some((c: any) => c.id === selectedClass) ? selectedClass : visibleClasses[0]?.id) || "";
  const selectedClassObj = classes.find((c: any) => c.id === classId);

  const teacherId =
    (selectedTeacher && branchTeachers.some((t: any) => t.id === selectedTeacher) ? selectedTeacher : branchTeachers[0]?.id) || "";

  const handleOpenTemplate = () => {
    if (classId && branchId) setEditorOpen(true);
  };

  const subjectList = [
    ...subjects.map((s: any) => ({ subject_name: s.subject_name })),
    ...NON_TEACHING_SUBJECTS.map((name) => ({ subject_name: name })),
    ...ENRICHMENT_SUBJECTS.map((name) => ({ subject_name: name })),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {!isTeacher && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 h-7 text-muted-foreground hover:text-foreground"
          >
            <Link to="/curriculum/command-center?tab=calendar">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Curriculum Command Center
            </Link>
          </Button>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Class Schedules
            </h1>
            <p className="text-sm text-muted-foreground">See what each class is learning, week by week.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isTeacher && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList className="h-9">
                <TabsTrigger value="class" className="text-xs gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" /> By Class
                </TabsTrigger>
                <TabsTrigger value="teacher" className="text-xs gap-1.5">
                  <UserRound className="h-3.5 w-3.5" /> By Teacher
                </TabsTrigger>
              </TabsList>
            </Tabs>
            )}
            {!isTeacher && viewMode === "class" && (
            <Select value={programFilter} onValueChange={(v) => { setProgramFilter(v as any); setSelectedClass(""); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                <SelectItem value="preschool">Preschool</SelectItem>
                <SelectItem value="taska">Taska</SelectItem>
              </SelectContent>
            </Select>
            )}
            {(!isTeacher || visibleClasses.length > 1) && viewMode === "class" && visibleClasses.length > 0 && (
              <Select value={classId} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Class">
                    {selectedClassObj ? (
                      <span className="flex items-center gap-1.5">
                        {selectedClassObj.class_name}
                        {selectedClassObj.program_type && (
                          <Badge variant={programBadgeVariant(selectedClassObj.program_type)} className="text-[10px]">
                            {programLabel(selectedClassObj.program_type)}
                          </Badge>
                        )}
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {visibleClasses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        {c.class_name}
                        {c.program_type && (
                          <Badge variant={programBadgeVariant(c.program_type)} className="text-[10px]">
                            {programLabel(c.program_type)}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isTeacher && viewMode === "teacher" && branchTeachers.length > 0 && (
              <Select value={teacherId} onValueChange={setSelectedTeacher}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {branchTeachers.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isTeacher && viewMode === "class" && classId && (
              <Button variant="outline" size="sm" onClick={handleOpenTemplate} className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Edit Weekly Schedule
              </Button>
            )}
            {!isTeacher && viewMode === "class" && classId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/timetables/print/${classId}?mode=week`, "_blank")}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
          </div>
        </div>

        {!isTeacher && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-start gap-2 text-sm">
            <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="text-muted-foreground">
              <strong className="text-foreground">Timetable</strong> connects the approved weekly plan to each teacher's daily classroom delivery.{" "}
              Pick a class, navigate weeks, attach lesson plans to blocks, and watch for holiday or closure conflicts (pulled from the{" "}
              <Link to="/school-calendar" className="text-primary underline">School Calendar</Link>).
            </div>
          </div>
        )}

        {isTeacher && classId && selectedClassObj && visibleClasses.length === 1 && (
          <p className="text-sm text-muted-foreground -mt-3">
            Showing schedule for <span className="font-medium text-foreground">{selectedClassObj.class_name}</span>
          </p>
        )}

        {viewMode === "class" && !classId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">
                {programFilter === "all" ? "No classes found" : `No ${programLabel(programFilter)} classes found`}
              </p>
              <p className="text-sm mt-1">
                {isTeacher
                  ? "You don't have any classes assigned yet. Please contact your Branch Manager."
                  : programFilter === "all"
                    ? "Ask your Branch Manager to create classes in the Classroom or Branch module."
                    : "Switch program filter or ask your Branch Manager to add classes for this program."}
              </p>
            </CardContent>
          </Card>
        ) : viewMode === "class" ? (
          <MonthlyTimetableView
            classId={classId}
            branchId={branchId}
            subjects={subjectList}
            onOpenTemplate={isTeacher ? undefined : handleOpenTemplate}
            isReadOnly={isTeacher}
          />
        ) : !teacherId ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <UserRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No teachers with assigned classes</p>
              <p className="text-sm mt-1">Assign teachers to classes from the Staff module to see their schedules here.</p>
            </CardContent>
          </Card>
        ) : (
          <TeacherScheduleView teacherId={teacherId} branchId={branchId} subjects={subjectList} />
        )}

        <ScheduleEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          classId={classId}
          branchId={branchId}
        />
      </div>
    </DashboardLayout>
  );
}
