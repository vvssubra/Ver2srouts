import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, Users, ArrowUpCircle, ArrowDownCircle, ChevronLeft, CalendarDays, ClipboardList,
  Megaphone, BookOpen, Printer, Plus, Loader2, Eye,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { AGE_GROUP_OPTIONS, inferProgramType } from "@/lib/programType";
import { differenceInYears, differenceInMonths } from "date-fns";
import { format } from "date-fns";
import { compareClasses } from "@/lib/class-sort";
import { useClassTeachers, teacherDisplayName, teacherInitials } from "@/hooks/use-class-teachers";
import AssignTeachersDialog from "@/components/classrooms/AssignTeachersDialog";
import { UserPlus, Pencil } from "lucide-react";
import Attendance from "./Attendance";
import { cn } from "@/lib/utils";

function ageLabel(dob: string | null | undefined) {
  if (!dob) return "—";
  const d = new Date(dob);
  const y = differenceInYears(new Date(), d);
  if (y >= 2) return `${y}y`;
  return `${differenceInMonths(new Date(), d)}m`;
}

interface ClassroomsProps { embedded?: boolean }
export default function Classrooms({ embedded = false }: ClassroomsProps = {}) {
  const { user, role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = role === "super_admin" || role === "franchisee" || role === "admin";

  const { data: memberships } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = selectedBranchId || (memberships?.[0] as any)?.branch_id;
  const { teacherClassIds } = useTeacherClasses(branchId);
  const { data: teachersByClass = {} } = useClassTeachers(branchId);

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classMode, setClassMode] = useState<"roster" | "attendance">("roster");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const [movePending, setMovePending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newClass, setNewClass] = useState({ class_name: "", age_group: "" });
  const [assignFor, setAssignFor] = useState<{ id: string; name: string } | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["branch-classes-all", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group, is_active")
        .eq("branch_id", branchId!)
        .eq("is_active", true)
        .order("class_name");
      return (data ?? []).slice().sort(compareClasses);
    },
    enabled: !!branchId,
  });

  const visibleClasses = useMemo(() => {
    const list = teacherClassIds ? classes.filter((c: any) => teacherClassIds.includes(c.id)) : classes;
    return list.slice().sort(compareClasses);
  }, [classes, teacherClassIds]);

  const { data: students = [] } = useQuery({
    queryKey: ["students-for-classrooms", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, date_of_birth, gender, class_id, photo_url, enrollment_status, is_active")
        .eq("branch_id", branchId)
        .order("first_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const activeStudents = students.filter((s: any) => (s.enrollment_status ?? (s.is_active ? "active" : "withdrawn")) === "active");

  // Today's attendance counts per class (drives the progress strip on each card)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["classrooms-today-attendance", branchId, todayStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("branch_id", branchId!)
        .eq("date", todayStr);
      return data ?? [];
    },
    enabled: !!branchId,
    staleTime: 30_000,
  });
  const attendanceByStudent = useMemo(() => {
    const m: Record<string, string> = {};
    todayAttendance.forEach((a: any) => { m[a.student_id] = a.status; });
    return m;
  }, [todayAttendance]);

  const statsByClass = useMemo(() => {
    const map: Record<string, { total: number; male: number; female: number; kids: any[] }> = {};
    visibleClasses.forEach((c: any) => { map[c.id] = { total: 0, male: 0, female: 0, kids: [] }; });
    activeStudents.forEach((s: any) => {
      if (!s.class_id || !map[s.class_id]) return;
      map[s.class_id].total++;
      if (s.gender === "male") map[s.class_id].male++;
      else if (s.gender === "female") map[s.class_id].female++;
      map[s.class_id].kids.push(s);
    });
    return map;
  }, [visibleClasses, activeStudents]);

  const createClass = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classes").insert({
        branch_id: branchId,
        class_name: newClass.class_name.trim(),
        age_group: newClass.age_group || "Mixed",
        program_type: inferProgramType(newClass.age_group),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-classes-all"] });
      setShowCreate(false);
      setNewClass({ class_name: "", age_group: "" });
      toast({ title: "Class created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const moveStudents = async () => {
    if (!moveTo || !selectedIds.length) return;
    setMovePending(true);
    try {
      const target = classes.find((c: any) => c.id === moveTo);
      if (!target) throw new Error("Target class not found");
      const { error } = await supabase
        .from("students")
        .update({ class_id: target.id, class_name: target.class_name } as any)
        .in("id", selectedIds);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["students-for-classrooms"] });
      toast({ title: `${selectedIds.length} student(s) moved to ${target.class_name}` });
      setSelectedIds([]);
      setMoveTo("");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setMovePending(false);
    }
  };

  const printRoster = () => {
    if (!selectedClassId) return;
    const cls = classes.find((c: any) => c.id === selectedClassId);
    const kids = statsByClass[selectedClassId]?.kids ?? [];
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${cls?.class_name} Class List</title>
      <style>body{font-family:Arial;padding:30px}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body>
      <h1>${cls?.class_name}</h1><p style="color:#6b7280;font-size:12px;margin:0">${kids.length} students · ${cls?.age_group ?? ""}</p>
      <table><thead><tr><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>Signature</th></tr></thead><tbody>
      ${kids.map((k: any, i: number) => `<tr><td>${i + 1}</td><td>${k.first_name} ${k.last_name}</td><td>${ageLabel(k.date_of_birth)}</td><td>${k.gender ?? ""}</td><td></td></tr>`).join("")}
      </tbody></table></body></html>`);
    w.document.close();
    w.print();
  };

  // ───────── Class detail view ─────────
  if (selectedClassId) {
    const cls = classes.find((c: any) => c.id === selectedClassId);
    const stats = statsByClass[selectedClassId] ?? { total: 0, male: 0, female: 0, kids: [] };
    const allSelected = stats.kids.length > 0 && stats.kids.every((k: any) => selectedIds.includes(k.id));
    const toggleAll = () => setSelectedIds(allSelected ? [] : stats.kids.map((k: any) => k.id));
    const otherClasses = classes.filter((c: any) => c.id !== selectedClassId);

    const detail = (
        <div className="space-y-5">
          {/* Row 1: back + class name (full width, no cramping) */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-foreground"
              onClick={() => { setSelectedClassId(null); setSelectedIds([]); setClassMode("roster"); }}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Classrooms
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight leading-tight break-words">
                {cls?.class_name}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.total} students · ♂ {stats.male} · ♀ {stats.female}{cls?.age_group ? ` · ${cls.age_group}` : ""}
              </p>
            </div>
          </div>

          {/* Row 2: action row — equal-width chips, 2×2 on mobile, 4 cols on md+ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button size="sm" variant="outline" className="h-11 justify-center" onClick={() => navigate(`/timetables?class=${selectedClassId}`)}>
              <CalendarDays className="h-4 w-4 mr-1.5" />Timetable
            </Button>
            <Button size="sm" variant="outline" className="h-11 justify-center" onClick={() => navigate(`/lesson-planner?class=${selectedClassId}`)}>
              <BookOpen className="h-4 w-4 mr-1.5" />Lesson Plan
            </Button>
            <Button size="sm" variant="outline" className="h-11 justify-center" onClick={() => navigate(`/announcements?class=${selectedClassId}`)}>
              <Megaphone className="h-4 w-4 mr-1.5" />Broadcast
            </Button>
            <Button size="sm" variant="outline" className="h-11 justify-center" onClick={printRoster}>
              <Printer className="h-4 w-4 mr-1.5" />Print List
            </Button>
          </div>

          {/* Mode toggle: Roster vs Attendance & History */}
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-1 text-sm">
            <button
              type="button"
              onClick={() => setClassMode("roster")}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5",
                classMode === "roster" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-3.5 w-3.5" /> Roster
            </button>
            <button
              type="button"
              onClick={() => setClassMode("attendance")}
              className={cn(
                "px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5",
                classMode === "attendance" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Attendance & History
            </button>
          </div>

          {classMode === "attendance" ? (
            <Attendance embedded lockedClassName={cls?.class_name} />
          ) : (
          <>
          {/* Promote / Move toolbar */}
          {canManage && selectedIds.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{selectedIds.length} selected</Badge>
                <Select value={moveTo} onValueChange={setMoveTo}>
                  <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Move to class…" /></SelectTrigger>
                  <SelectContent>
                    {otherClasses.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.class_name} <span className="text-muted-foreground">({c.age_group})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={moveStudents} disabled={!moveTo || movePending}>
                  {movePending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />}
                  Promote / Move
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
              </CardContent>
            </Card>
          )}

          {/* Roster */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-3 px-4 py-2 border-b text-xs font-medium text-muted-foreground bg-muted/30">
                {canManage && (
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                )}
                <span className="flex-1">Student</span>
                <span className="w-16 text-center hidden sm:inline">Age</span>
                <span className="w-20 text-center hidden sm:inline">Gender</span>
                <span className="w-24 text-right">Actions</span>
              </div>
              {stats.kids.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No students in this class.
                  <p className="text-xs mt-2">Use the Student Directory to add a child and assign them to this class.</p>
                </div>
              ) : stats.kids.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-0 hover:bg-muted/30">
                  {canManage && (
                    <Checkbox
                      checked={selectedIds.includes(s.id)}
                      onCheckedChange={(v) => setSelectedIds(p => v ? [...p, s.id] : p.filter(x => x !== s.id))}
                    />
                  )}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {s.photo_url ? (
                      <img src={s.photo_url} className="h-9 w-9 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                        {s.first_name?.[0]}{s.last_name?.[0]}
                      </div>
                    )}
                    <span className="text-sm font-medium truncate">{s.first_name} {s.last_name}</span>
                  </div>
                  <span className="w-16 text-center text-xs text-muted-foreground hidden sm:inline">{ageLabel(s.date_of_birth)}</span>
                  <span className="w-20 text-center text-xs text-muted-foreground capitalize hidden sm:inline">{s.gender ?? "—"}</span>
                  <div className="w-24 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/students/${s.id}`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />Profile
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          </>
          )}
        </div>
    );
    return embedded ? detail : <DashboardLayout>{detail}</DashboardLayout>;
  }

  // ───────── Classroom grid ─────────
  const grid = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Classrooms & Attendance</h1>
            <p className="text-sm text-muted-foreground">Pick a class to take attendance, manage the roster, or review history.</p>
          </div>
          {canManage && (
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Class</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Class</DialogTitle>
                  <DialogDescription>Add a class to this branch.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div><Label>Class Name</Label><Input value={newClass.class_name} onChange={(e) => setNewClass({ ...newClass, class_name: e.target.value })} placeholder="e.g. Tadika Bintang" /></div>
                  <div>
                    <Label>Age Group</Label>
                    <Select value={newClass.age_group} onValueChange={(v) => setNewClass({ ...newClass, age_group: v })}>
                      <SelectTrigger><SelectValue placeholder="Select age group" /></SelectTrigger>
                      <SelectContent>
                        {AGE_GROUP_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => createClass.mutate()} disabled={!newClass.class_name.trim() || createClass.isPending}>
                    {createClass.isPending ? "Creating…" : "Create Class"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {visibleClasses.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No classes yet. {canManage && "Click 'New Class' to create one."}
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleClasses.map((c: any) => {
              const stats = statsByClass[c.id] ?? { total: 0, male: 0, female: 0, kids: [] };
              const pctMale = stats.total ? (stats.male / stats.total) * 100 : 0;
              const teachers = teachersByClass[c.id] ?? [];
              // Today's check-in progress for this class
              const kidIds = stats.kids.map((k: any) => k.id);
              const checkedCount = kidIds.reduce((n: number, id: string) => n + (attendanceByStudent[id] ? 1 : 0), 0);
              const presentCount = kidIds.reduce((n: number, id: string) => n + (attendanceByStudent[id] === "present" ? 1 : 0), 0);
              const absentCount = kidIds.reduce((n: number, id: string) => n + (attendanceByStudent[id] === "absent" ? 1 : 0), 0);
              const lateCount = kidIds.reduce((n: number, id: string) => n + (attendanceByStudent[id] === "late" ? 1 : 0), 0);
              const checkPct = stats.total ? Math.round((checkedCount / stats.total) * 100) : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className="group text-left bg-card rounded-xl border border-border hover:border-primary/40 hover:shadow-lg transition-all p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-base leading-tight">{c.class_name}</p>
                      <p className="text-xs text-muted-foreground">{c.age_group}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{stats.total} students</Badge>
                  </div>

                  {/* Today's check-in progress */}
                  {stats.total > 0 && (
                    <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-foreground">Today's check-in</span>
                        <span className="text-muted-foreground">{checkedCount}/{stats.total} · {checkPct}%</span>
                      </div>
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        {presentCount > 0 && (
                          <div className="h-full bg-green-500" style={{ width: `${(presentCount / stats.total) * 100}%` }} />
                        )}
                        {lateCount > 0 && (
                          <div className="h-full bg-yellow-500" style={{ width: `${(lateCount / stats.total) * 100}%` }} />
                        )}
                        {absentCount > 0 && (
                          <div className="h-full bg-red-500" style={{ width: `${(absentCount / stats.total) * 100}%` }} />
                        )}
                      </div>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        <span>● <span className="text-green-700 dark:text-green-400">{presentCount} present</span></span>
                        <span>● <span className="text-yellow-700 dark:text-yellow-400">{lateCount} late</span></span>
                        <span>● <span className="text-red-700 dark:text-red-400">{absentCount} absent</span></span>
                      </div>
                    </div>
                  )}

                  {/* Teachers */}
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                    {teachers.length === 0 ? (
                      canManage ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setAssignFor({ id: c.id, name: c.class_name }); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setAssignFor({ id: c.id, name: c.class_name }); } }}
                          className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Assign teacher
                        </span>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">No teacher assigned</p>
                      )
                    ) : (
                      <>
                        <div className="flex -space-x-2">
                          {teachers.slice(0, 3).map((t) => (
                            t.avatar_url ? (
                              <img key={t.user_id} src={t.avatar_url} alt="" title={teacherDisplayName(t)} className="h-7 w-7 rounded-full object-cover ring-2 ring-card" />
                            ) : (
                              <div key={t.user_id} title={teacherDisplayName(t)} className="h-7 w-7 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
                                {teacherInitials(t)}
                              </div>
                            )
                          ))}
                        </div>
                        <div className="text-[11px] leading-tight min-w-0">
                          <p className="text-muted-foreground">Teacher{teachers.length > 1 ? "s" : ""}</p>
                          <p className="text-foreground font-medium truncate">
                            {teachers.slice(0, 2).map(teacherDisplayName).join(", ")}{teachers.length > 2 ? ` +${teachers.length - 2}` : ""}
                          </p>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setAssignFor({ id: c.id, name: c.class_name }); }}
                            className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Manage teachers"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {/* Photo strip */}
                  <div className="flex -space-x-2 min-h-[36px]">
                    {stats.kids.slice(0, 6).map((k: any) => (
                      k.photo_url ? (
                        <img key={k.id} src={k.photo_url} className="h-9 w-9 rounded-full object-cover border-2 border-background" alt="" />
                      ) : (
                        <div key={k.id} className="h-9 w-9 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center text-[10px] font-semibold text-primary">
                          {k.first_name?.[0]}{k.last_name?.[0]}
                        </div>
                      )
                    ))}
                    {stats.kids.length > 6 && (
                      <div className="h-9 w-9 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                        +{stats.kids.length - 6}
                      </div>
                    )}
                  </div>
                  {/* Gender split bar */}
                  {stats.total > 0 && (
                    <div>
                      <div className="h-1.5 rounded-full bg-rose-200/60 overflow-hidden">
                        <div className="h-full bg-sky-400" style={{ width: `${pctMale}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>♂ {stats.male}</span>
                        <span>♀ {stats.female}</span>
                      </div>
                    </div>
                  )}
                  {/* Card actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <Button
                      size="sm"
                      className="flex-1 h-9"
                      onClick={(e) => { e.stopPropagation(); setSelectedClassId(c.id); setClassMode("attendance"); }}
                      disabled={stats.total === 0}
                    >
                      <ClipboardList className="h-3.5 w-3.5 mr-1" />
                      {checkedCount === 0 ? "Take attendance" : checkedCount < stats.total ? "Continue check-in" : "View attendance"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={(e) => { e.stopPropagation(); setSelectedClassId(c.id); setClassMode("roster"); }}
                    >
                      <Users className="h-3.5 w-3.5 mr-1" />Roster
                    </Button>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
  );
  const gridWithDialogs = (
    <>
      {grid}
      {assignFor && (
        <AssignTeachersDialog
          open={!!assignFor}
          onOpenChange={(v) => !v && setAssignFor(null)}
          branchId={branchId}
          classId={assignFor.id}
          className={assignFor.name}
        />
      )}
    </>
  );
  return embedded ? gridWithDialogs : <DashboardLayout>{gridWithDialogs}</DashboardLayout>;
}