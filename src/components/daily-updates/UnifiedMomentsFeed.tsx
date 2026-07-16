import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Star, Eye, Plus, MessageCircle, Sparkles, Users, BookOpen, Search, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { format } from "date-fns";
import { NewUpdateSheet } from "./NewUpdateSheet";
import { UpdateDetailDialog } from "./UpdateDetailDialog";
import { SmartMomentImagePreview } from "./SmartMomentImagePreview";

type FilterKey = "all" | "milestones";

interface UnifiedMomentsFeedProps {
  studentId?: string;
  embedded?: boolean;
  initialClassId?: string | null;
}

interface UpdateRow {
  id: string;
  caption: string | null;
  parent_summary: string | null;
  ai_learning_story: string | null;
  activity_date: string;
  visible_to_parent: boolean;
  status: string;
  album_id: string | null;
  student_id: string | null;
  milestone_flag: boolean;
  portfolio_candidate: boolean;
  child_update_media: { url: string; kind: string; thumbnail_url?: string | null; sort_order: number }[];
  students?: { id: string; first_name: string; last_name: string | null } | null;
  child_update_students?: { students: { id: string; first_name: string; last_name: string | null } | null }[];
  development_domains?: { name: string } | null;
  child_update_skills?: { indicator_label: string; proficiency_level: string }[];
}

async function hydrateMomentRows(rows: UpdateRow[]) {
  if (!rows.length) return rows;
  const updateIds = rows.map((r) => r.id);
  const directStudentIds = rows.map((r) => r.student_id).filter(Boolean) as string[];

  const [{ data: links }, { data: skills }] = await Promise.all([
    supabase.from("child_update_students").select("update_id, student_id").in("update_id", updateIds),
    supabase.from("child_update_skills").select("update_id, indicator_label, proficiency_level").in("update_id", updateIds).limit(400),
  ]);

  const linkedStudentIds = ((links ?? []) as any[]).map((l) => l.student_id).filter(Boolean);
  const allStudentIds = Array.from(new Set([...directStudentIds, ...linkedStudentIds]));
  const { data: students } = allStudentIds.length
    ? await supabase.from("students").select("id, first_name, last_name").in("id", allStudentIds)
    : { data: [] as any[] };

  const studentById = new Map((students ?? []).map((s: any) => [s.id, s]));
  const linksByUpdate = new Map<string, any[]>();
  (links ?? []).forEach((l: any) => {
    const list = linksByUpdate.get(l.update_id) ?? [];
    const student = studentById.get(l.student_id);
    if (student) list.push({ students: student });
    linksByUpdate.set(l.update_id, list);
  });
  const skillsByUpdate = new Map<string, any[]>();
  (skills ?? []).forEach((s: any) => {
    const list = skillsByUpdate.get(s.update_id) ?? [];
    list.push({ indicator_label: s.indicator_label, proficiency_level: s.proficiency_level });
    skillsByUpdate.set(s.update_id, list);
  });

  return rows.map((row) => ({
    ...row,
    students: row.student_id ? studentById.get(row.student_id) ?? null : null,
    child_update_students: linksByUpdate.get(row.id) ?? [],
    child_update_skills: skillsByUpdate.get(row.id) ?? [],
  }));
}

export default function UnifiedMomentsFeed({ studentId, embedded = false, initialClassId = null }: UnifiedMomentsFeedProps) {
  const { activeBranchIds, isLoading: branchesLoading } = useGlobalBranch();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const primaryBranchId = activeBranchIds[0];
  const { teacherClassIds } = useTeacherClasses(primaryBranchId);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [albumSearch, setAlbumSearch] = useState("");
  const [showAllAlbums, setShowAllAlbums] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: albumOptions = [] } = useQuery({
    queryKey: ["moments-albums-strip", activeBranchIds.slice().sort().join(","), isTeacher ? (teacherClassIds ?? []).slice().sort().join(",") : "all"],
    queryFn: async () => {
      if (!activeBranchIds.length) return [] as { id: string; title: string; is_personal: boolean; student_id: string | null; class_id: string | null }[];
      let q = supabase
        .from("learning_albums")
        .select("id, title, is_personal, student_id, class_id")
        .in("branch_id", activeBranchIds)
        .eq("is_active", true)
        .order("is_personal")
        .order("title")
        .limit(400);
      const { data } = await q;
      let rows = (data ?? []) as { id: string; title: string; is_personal: boolean; student_id: string | null; class_id: string | null }[];
      // Teacher scope: only albums whose class_id is one of their assigned classes,
      // OR personal albums for students in those classes.
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        const assigned = new Set(teacherClassIds);
        // Resolve which students belong to assigned classes
        const personalStudentIds = rows
          .filter((r) => r.is_personal && r.student_id)
          .map((r) => r.student_id!) as string[];
        let allowedStudentIds = new Set<string>();
        if (personalStudentIds.length > 0) {
          const { data: studs } = await supabase
            .from("students")
            .select("id, class_id")
            .in("id", personalStudentIds);
          (studs ?? []).forEach((s: any) => {
            if (s.class_id && assigned.has(s.class_id)) allowedStudentIds.add(s.id);
          });
        }
        rows = rows.filter((r) => {
          if (r.is_personal) return r.student_id ? allowedStudentIds.has(r.student_id) : false;
          // Shared albums: keep if pinned to one of teacher's classes OR not class-scoped at all
          if (r.class_id) return assigned.has(r.class_id);
          return true;
        });
      }
      return rows;
    },
    enabled: !studentId && activeBranchIds.length > 0,
  });

  const queryKey = studentId
    ? ["moments-feed", "child", studentId]
    : ["moments-feed", "branch", activeBranchIds.slice().sort().join(",")];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (studentId) {
        const { data: direct, error: directError } = await supabase
          .from("child_updates")
          .select("id, caption, parent_summary, ai_learning_story, activity_date, visible_to_parent, status, album_id, student_id, milestone_flag, portfolio_candidate, child_update_media(url, kind, thumbnail_url, sort_order), development_domains(name)")
          .eq("student_id", studentId)
          .order("activity_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(160);
        if (directError) throw directError;

        const { data: tagRows, error: tagError } = await supabase
          .from("child_update_students")
          .select("update_id")
          .eq("student_id", studentId);
        if (tagError) throw tagError;

        const tagIds = (tagRows ?? []).map((r: any) => r.update_id);
        let grouped: UpdateRow[] = [];
        if (tagIds.length) {
          const { data, error } = await supabase
            .from("child_updates")
            .select("id, caption, parent_summary, ai_learning_story, activity_date, visible_to_parent, status, album_id, student_id, milestone_flag, portfolio_candidate, child_update_media(url, kind, thumbnail_url, sort_order), development_domains(name)")
            .in("id", tagIds)
            .order("activity_date", { ascending: false })
            .limit(160);
          if (error) throw error;
          grouped = (data ?? []) as unknown as UpdateRow[];
        }
        const map = new Map<string, UpdateRow>();
        for (const u of [...((direct ?? []) as unknown as UpdateRow[]), ...grouped]) map.set(u.id, u);
        return hydrateMomentRows(Array.from(map.values()).sort((a, b) => new Date(b.activity_date).getTime() - new Date(a.activity_date).getTime()));
      }

      if (!activeBranchIds.length) return [] as UpdateRow[];
      let qb = supabase
        .from("child_updates")
        .select("id, caption, parent_summary, ai_learning_story, activity_date, visible_to_parent, status, album_id, student_id, milestone_flag, portfolio_candidate, child_update_media(url, kind, thumbnail_url, sort_order), development_domains(name)")
        .in("branch_id", activeBranchIds)
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      // Teachers see only stories anchored to students in their assigned classes
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        const { data: classStudents } = await supabase
          .from("students")
          .select("id")
          .in("class_id", teacherClassIds);
        const ids = (classStudents ?? []).map((s: any) => s.id);
        if (ids.length === 0) return [] as UpdateRow[];
        qb = qb.in("student_id", ids);
      }
      const { data, error } = await qb;
      if (error) throw error;
      return hydrateMomentRows((data ?? []) as unknown as UpdateRow[]);
    },
    enabled: studentId ? true : !branchesLoading && activeBranchIds.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    placeholderData: keepPreviousData,
  });

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "milestones") list = list.filter((i) => i.milestone_flag || i.portfolio_candidate);
    if (albumFilter) list = list.filter((i) => i.album_id === albumFilter);
    return list;
  }, [items, filter, albumFilter]);

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = new Map<string, { label: string; sortKey: string; items: UpdateRow[] }>();
    for (const u of filtered) {
      const d = new Date(u.activity_date);
      const key = u.activity_date;
      const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
      const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : format(d, "EEE, d MMM");
      if (!buckets.has(key)) buckets.set(key, { label, sortKey: key, items: [] });
      buckets.get(key)!.items.push(u);
    }
    return Array.from(buckets.values()).sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
  }, [filtered]);

  const stats = useMemo(() => ({
    total: items.length,
    milestones: items.filter((i) => i.milestone_flag || i.portfolio_candidate).length,
    shared: items.filter((i) => i.visible_to_parent).length,
  }), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={embedded ? "text-lg font-semibold" : "text-2xl font-semibold"}>
            {studentId ? "Learning Journal" : "Class Journal"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="gap-1"><BookOpen className="h-3 w-3" />{stats.total} stories</Badge>
            <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />{stats.milestones} milestones</Badge>
            <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{stats.shared} shared</Badge>
          </div>
        </div>
        <Button size={embedded ? "sm" : "default"} onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Story
        </Button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {([
          { k: "all", label: "All" },
          { k: "milestones", label: "Learning milestones", icon: Star },
        ] as { k: FilterKey; label: string; icon?: any }[]).map(({ k, label, icon: Icon }) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="h-8 text-xs" onClick={() => setFilter(k)}>
            {Icon && <Icon className="h-3.5 w-3.5 mr-1" />}
            {label}
          </Button>
        ))}
      </div>

      {!studentId && albumOptions.length > 0 && (() => {
        const sharedAlbums = albumOptions.filter((a: any) => !a.is_personal);
        const personalAlbums = albumOptions.filter((a: any) => a.is_personal);
        const filteredPersonal = albumSearch.trim()
          ? personalAlbums.filter((a: any) => a.title.toLowerCase().includes(albumSearch.toLowerCase()))
          : personalAlbums;
        const shownPersonal = showAllAlbums ? filteredPersonal : filteredPersonal.slice(0, 6);
        const activeAlbumLabel = albumFilter ? albumOptions.find((a: any) => a.id === albumFilter)?.title : null;
        return (
          <div className="rounded-xl border bg-card/50 p-3 space-y-3">
            {/* Row 1: All + shared albums */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <Button
                size="sm"
                variant={albumFilter === null ? "default" : "outline"}
                className="h-8 text-xs rounded-full"
                onClick={() => setAlbumFilter(null)}
              >
                <FolderOpen className="h-3 w-3 mr-1" /> All
              </Button>
              {sharedAlbums.map((a: any) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant={albumFilter === a.id ? "default" : "outline"}
                  className="h-8 text-xs rounded-full"
                  onClick={() => setAlbumFilter(a.id)}
                >
                  {a.title}
                </Button>
              ))}
            </div>

            {/* Row 2: per-student album finder */}
            {personalAlbums.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-border/60">
                <div className="flex items-center justify-between gap-2 pt-2">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    By student ({personalAlbums.length})
                  </p>
                  {activeAlbumLabel && (
                    <Badge variant="secondary" className="text-[10px]">
                      Viewing: {activeAlbumLabel}
                    </Badge>
                  )}
                </div>
                {personalAlbums.length > 6 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={albumSearch}
                      onChange={(e) => setAlbumSearch(e.target.value)}
                      placeholder="Search students…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                  {shownPersonal.map((a: any) => {
                    // album title is "<Name>'s album" — derive the initials
                    const name = a.title.replace(/'s album$/i, "").trim();
                    const initials = name.split(/\s+/).map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S";
                    const active = albumFilter === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAlbumFilter(active ? null : a.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                        }`}>
                          {initials}
                        </div>
                        <span className="text-[10px] leading-tight text-center line-clamp-2 max-w-full">{name || "Student"}</span>
                      </button>
                    );
                  })}
                </div>
                {filteredPersonal.length > 6 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] w-full"
                    onClick={() => setShowAllAlbums((v) => !v)}
                  >
                    {showAllAlbums ? "Show less" : `Show all ${filteredPersonal.length}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {(branchesLoading || (isLoading && items.length === 0)) ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No journal stories yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.sortKey} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                <span className="text-[10px] text-muted-foreground">· {g.items.length} {g.items.length === 1 ? "story" : "stories"}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((u) => <MomentCard key={u.id} u={u} onOpen={() => setDetailId(u.id)} hideStudentName={!!studentId} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewUpdateSheet open={open} onOpenChange={setOpen} initialStudentId={studentId ?? null} initialClassId={initialClassId} />
      <UpdateDetailDialog updateId={detailId} open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)} />
    </div>
  );
}

function MomentCard({ u, onOpen, hideStudentName }: { u: UpdateRow; onOpen: () => void; hideStudentName?: boolean }) {
  const media = (u.child_update_media ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const cover = media[0];
  const extraCount = media.length - 1;
  const childName = useMemo(() => {
    if (hideStudentName) return null;
    if (u.students) return `${u.students.first_name} ${u.students.last_name ?? ""}`.trim();
    const tagged = u.child_update_students?.[0]?.students;
    if (tagged) {
      const extra = (u.child_update_students?.length ?? 0) - 1;
      const base = `${tagged.first_name} ${tagged.last_name ?? ""}`.trim();
      return extra > 0 ? `${base} +${extra}` : base;
    }
    return "Class story";
  }, [u, hideStudentName]);

  return (
    <Card className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md" onClick={onOpen}>
      <div className="relative">
        {cover ? (
          <SmartMomentImagePreview
            src={cover.url}
              posterSrc={cover.thumbnail_url}
            kind={cover.kind}
            alt="Learning journal media"
            aspectClassName="aspect-[4/3]"
            className="rounded-none"
          />
        ) : (
          <div className="relative aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute top-2 left-2 z-30 flex gap-1 flex-wrap">
          {(u.milestone_flag || u.portfolio_candidate) && <Badge variant="secondary" className="text-[10px] gap-1"><Star className="h-3 w-3 fill-current" /> Milestone</Badge>}
          {u.development_domains?.name && <Badge variant="secondary" className="text-[10px]">{u.development_domains.name}</Badge>}
        </div>
        <div className="absolute top-2 right-2 z-30"><Badge variant={u.visible_to_parent ? "default" : "outline"} className="text-[10px]">{u.visible_to_parent ? "Shared" : "Draft"}</Badge></div>
        {extraCount > 0 && <Badge variant="secondary" className="absolute bottom-2 right-2 z-30 text-[10px]">+{extraCount} more</Badge>}
      </div>
      <CardContent className="p-3 space-y-2">
        {!hideStudentName && childName && <p className="text-xs font-medium text-foreground/80 flex items-center gap-1"><Users className="h-3 w-3" />{childName}</p>}
        <p className="text-sm line-clamp-2">{u.parent_summary || u.caption || u.ai_learning_story || "—"}</p>
        {(u.child_update_skills?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {u.child_update_skills!.slice(0, 2).map((s, i) => <Badge key={`${s.indicator_label}-${i}`} variant="outline" className="text-[10px]">{s.indicator_label}</Badge>)}
            {u.child_update_skills!.length > 2 && <Badge variant="outline" className="text-[10px]">+{u.child_update_skills!.length - 2}</Badge>}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" />{format(new Date(u.activity_date), "EEE, d MMM")}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><MessageCircle className="h-3 w-3" />Open</span>
        </div>
      </CardContent>
    </Card>
  );
}
