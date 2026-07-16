import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, GraduationCap, Loader2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import StudentStatusMenu, { StatusBadge, type EnrollmentStatus } from "@/components/student/StudentStatusMenu";
import { differenceInYears, differenceInMonths } from "date-fns";
import { classSortKey } from "@/lib/class-sort";
import { useClassTeachers, teacherDisplayName, teacherInitials } from "@/hooks/use-class-teachers";

type StatusFilter = "active" | "on_hold" | "withdrawn" | "graduated" | "all";

function ageLabel(dob: string | null | undefined) {
  if (!dob) return "";
  const d = new Date(dob);
  const y = differenceInYears(new Date(), d);
  if (y >= 2) return `${y}y`;
  const m = differenceInMonths(new Date(), d);
  return `${m}m`;
}

export default function Students() {
  const { user } = useAuth();
  const { selectedBranchId: selectedBranch } = useGlobalBranch();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  const { data: memberships } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id, branches(id, name)").eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const branchId = selectedBranch || (memberships?.[0] as any)?.branch_id;

  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);
  const { data: teachersByClass = {} } = useClassTeachers(branchId);

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, date_of_birth, gender, class_name, class_id, photo_url, is_active, enrollment_status")
        .eq("branch_id", branchId)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!branchId,
  });

  const getStatus = (s: any): EnrollmentStatus =>
    (s?.enrollment_status as EnrollmentStatus) ?? (s?.is_active ? "active" : "withdrawn");

  // Counts per status (teacher scope respected on active only — withdrawn/graduated are global to branch)
  const scoped = useMemo(() => {
    if (!students) return [];
    if (!teacherClassIds) return students;
    return students.filter(s => s.class_id && teacherClassIds.includes(s.class_id));
  }, [students, teacherClassIds]);

  const counts = useMemo(() => ({
    active: scoped.filter(s => getStatus(s) === "active").length,
    on_hold: scoped.filter(s => getStatus(s) === "on_hold").length,
    withdrawn: scoped.filter(s => getStatus(s) === "withdrawn").length,
    graduated: scoped.filter(s => getStatus(s) === "graduated").length,
    all: scoped.length,
  }), [scoped]);

  // Filtered + grouped by class (sorted by age ascending)
  const grouped = useMemo(() => {
    const filtered = scoped.filter(s => {
      if (statusFilter !== "all" && getStatus(s) !== statusFilter) return false;
      if (search && !`${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const map: Record<string, any[]> = {};
    filtered.forEach(s => {
      const key = s.class_name || "Unassigned";
      (map[key] ??= []).push(s);
    });
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      const ka = classSortKey(a);
      const kb = classSortKey(b);
      if (ka !== kb) return ka - kb;
      return a.localeCompare(b);
    });
  }, [scoped, statusFilter, search]);

  const toggleClass = (name: string) => setExpandedClasses(p => ({ ...p, [name]: !p[name] }));

  const filterChips: { key: StatusFilter; label: string; tone: string }[] = [
    { key: "active", label: "Active", tone: "bg-success/10 text-success border-success/30" },
    { key: "on_hold", label: "On Hold", tone: "bg-warning/10 text-warning border-warning/30" },
    { key: "withdrawn", label: "Withdrawn", tone: "bg-destructive/10 text-destructive border-destructive/30" },
    { key: "graduated", label: "Graduated", tone: "bg-primary/10 text-primary border-primary/30" },
    { key: "all", label: "All", tone: "bg-muted text-foreground border-border" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student Directory</h1>
          <p className="text-sm text-muted-foreground">All enrolled children, grouped by classroom. New students are added via the Admissions pipeline.</p>
        </div>

        {/* Status chips + search */}
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map(c => (
            <button
              key={c.key}
              onClick={() => setStatusFilter(c.key)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                statusFilter === c.key ? c.tone + " ring-2 ring-offset-1 ring-current/40" : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {c.label} <span className="ml-1 opacity-70 tabular-nums">{counts[c.key]}</span>
            </button>
          ))}
          <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name…" className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Grouped grid */}
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading students…</div>
        ) : grouped.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No students match the current filter.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {grouped.map(([className, kids]) => {
              const expanded = !!expandedClasses[className];
              const boys = kids.filter((k: any) => k.gender === "male").length;
              const girls = kids.filter((k: any) => k.gender === "female").length;
              const ages = kids.map((k: any) => k.date_of_birth ? differenceInYears(new Date(), new Date(k.date_of_birth)) : null).filter((a: number | null) => a !== null) as number[];
              const ageRange = ages.length ? (Math.min(...ages) === Math.max(...ages) ? `${Math.min(...ages)}y` : `${Math.min(...ages)}–${Math.max(...ages)}y`) : "";
              const classId = kids[0]?.class_id as string | undefined;
              const teachers = (classId && teachersByClass[classId]) || [];
              return (
                <section key={className} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => toggleClass(className)}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold text-foreground truncate">{className}</h2>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{kids.length} {kids.length === 1 ? "child" : "children"}</span>
                        {ageRange && <span>· {ageRange}</span>}
                        {(boys + girls) > 0 && <span>· ♂ {boys} · ♀ {girls}</span>}
                      </p>
                    </div>
                    {/* Teachers assigned to this class */}
                    {teachers.length > 0 && (
                      <div className="hidden md:flex items-center gap-2 pr-2 border-r border-border/60 mr-1">
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
                        <div className="text-[11px] leading-tight">
                          <p className="text-muted-foreground">Teacher{teachers.length > 1 ? "s" : ""}</p>
                          <p className="text-foreground font-medium truncate max-w-[140px]">
                            {teachers.slice(0, 2).map(teacherDisplayName).join(", ")}{teachers.length > 2 ? ` +${teachers.length - 2}` : ""}
                          </p>
                        </div>
                      </div>
                    )}
                    {!expanded && (
                      <div className="hidden sm:flex -space-x-2">
                        {kids.slice(0, 5).map((k: any) => (
                          k.photo_url ? (
                            <img key={k.id} src={k.photo_url} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-card" />
                          ) : (
                            <div key={k.id} className="h-7 w-7 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-card">
                              {k.first_name?.[0]}
                            </div>
                          )
                        ))}
                        {kids.length > 5 && (
                          <div className="h-7 w-7 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-card">+{kids.length - 5}</div>
                        )}
                      </div>
                    )}
                    <Badge variant="secondary" className="text-[10px] tabular-nums">{kids.length}</Badge>
                  </button>
                  {expanded && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 pt-2 border-t border-border bg-muted/20">
                      {kids.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => navigate(`/students/${s.id}`)}
                          className="group relative flex flex-col items-center gap-2 p-3 pt-5 rounded-xl bg-card border border-border hover:border-primary/40 hover:shadow-md transition-all text-center"
                        >
                          {s.photo_url ? (
                            <img src={s.photo_url} alt="" className="h-28 w-28 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/40 transition" />
                          ) : (
                            <div className="h-28 w-28 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-semibold text-2xl ring-2 ring-border group-hover:ring-primary/40 transition">
                              {s.first_name?.[0]}{s.last_name?.[0]}
                            </div>
                          )}
                          <div className="min-w-0 w-full">
                            <p className="text-sm font-medium truncate leading-tight">{s.first_name} {s.last_name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {ageLabel(s.date_of_birth)}{s.gender ? ` · ${s.gender === "male" ? "♂" : "♀"}` : ""}
                            </p>
                            <div className="mt-1.5 flex justify-center scale-[0.8] origin-top">
                              <StatusBadge status={getStatus(s)} />
                            </div>
                          </div>
                          <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
                            <StudentStatusMenu studentId={s.id} currentStatus={getStatus(s)} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
