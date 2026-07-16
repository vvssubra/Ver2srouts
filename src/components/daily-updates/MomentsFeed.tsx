import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Image as ImageIcon, Heart, MessageCircle, Search, Star, Trash2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { UpdateDetailDialog } from "./UpdateDetailDialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { MomentMediaCarousel } from "./MomentMediaCarousel";

interface Props {
  studentId: string;
  /** When true, only Moments shared with parents are shown. */
  parentVisibleOnly?: boolean;
  limit?: number;
}

export function MomentsFeed({ studentId, parentVisibleOnly = false, limit = 200 }: Props) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["moments-feed", studentId, parentVisibleOnly, limit],
    queryFn: async () => {
      if (!studentId) return [] as any[];

      // Direct + group updates for this student
      const direct = supabase
        .from("child_updates")
        .select(
          "id, caption, parent_summary, ai_learning_story, activity_date, visible_to_parent, milestone_flag, subject_name, learning_albums(title), child_update_media(url, kind, thumbnail_url, sort_order), development_domains(name)"
        )
        .eq("student_id", studentId)
        .order("activity_date", { ascending: false })
        .limit(limit);

      const groupIds = await supabase
        .from("child_update_students")
        .select("update_id")
        .eq("student_id", studentId);
      const groupUpdateIds = (groupIds.data ?? []).map((r: any) => r.update_id);

      const groupQ = groupUpdateIds.length
        ? supabase
            .from("child_updates")
            .select(
              "id, caption, parent_summary, ai_learning_story, activity_date, visible_to_parent, milestone_flag, subject_name, learning_albums(title), child_update_media(url, kind, thumbnail_url, sort_order), development_domains(name)"
            )
            .in("id", groupUpdateIds)
        : null;

      const [d, g] = await Promise.all([direct, groupQ]);
      const merged = [...(d.data ?? []), ...((g?.data ?? []) as any[])];

      // De-dup + filter
      const map = new Map<string, any>();
      for (const r of merged) {
        if (parentVisibleOnly && !r.visible_to_parent) continue;
        map.set(r.id, r);
      }
      return Array.from(map.values()).sort((a, b) => (a.activity_date < b.activity_date ? 1 : -1));
    },
    enabled: !!studentId,
  });

  // Reaction counts (one query) + which ones the current user reacted to
  const ids = useMemo(() => items.map((u: any) => u.id), [items]);
  const { data: reactions = [] } = useQuery({
    queryKey: ["moments-feed-reactions", ids, user?.id],
    enabled: ids.length > 0 && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("moment_reactions")
        .select("update_id, user_id")
        .in("update_id", ids);
      return data ?? [];
    },
  });

  // Comment counts for each visible moment (lightweight – just ids)
  const { data: commentRows = [] } = useQuery({
    queryKey: ["moments-feed-comments", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("moment_comments")
        .select("update_id")
        .in("update_id", ids);
      return data ?? [];
    },
  });
  const commentCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of commentRows as any[]) {
      m.set(c.update_id, (m.get(c.update_id) ?? 0) + 1);
    }
    return m;
  }, [commentRows]);

  const reactionMap = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions as any[]) {
      const cur = m.get(r.update_id) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === user?.id) cur.mine = true;
      m.set(r.update_id, cur);
    }
    return m;
  }, [reactions, user?.id]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach((u: any) => u.subject_name && set.add(u.subject_name));
    return Array.from(set).sort();
  }, [items]);
  const domains = useMemo(() => {
    const set = new Set<string>();
    items.forEach((u: any) => u.development_domains?.name && set.add(u.development_domains.name));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((u: any) => {
      if (milestonesOnly && !u.milestone_flag) return false;
      if (subjectFilter !== "all" && u.subject_name !== subjectFilter) return false;
      if (domainFilter !== "all" && u.development_domains?.name !== domainFilter) return false;
      if (q) {
        const hay = `${u.caption ?? ""} ${u.parent_summary ?? ""} ${u.ai_learning_story ?? ""} ${u.subject_name ?? ""} ${u.development_domains?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, subjectFilter, domainFilter, milestonesOnly]);

  const toggleReact = useMutation({
    mutationFn: async (updateId: string) => {
      if (!user) throw new Error("Sign in to react");
      const existing = (reactions as any[]).find(
        (r) => r.update_id === updateId && r.user_id === user.id,
      );
      if (existing) {
        const { error } = await supabase
          .from("moment_reactions")
          .delete()
          .eq("update_id", updateId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("moment_reactions")
          .insert({ update_id: updateId, user_id: user.id, kind: "heart" });
        if (error) throw error;
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["moments-feed-reactions", ids, user?.id] }),
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  const canDeleteSomething =
    role === "super_admin" || role === "admin" || role === "franchisee" || role === "teacher";

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from("child_updates").delete().eq("id", pendingDelete.id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success("Moment removed.");
    qc.invalidateQueries({ queryKey: ["moments-feed", studentId, parentVisibleOnly, limit] });
    setPendingDelete(null);
  };

  const Toolbar = (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search moments…"
          className="pl-8 h-9 text-base"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[8rem]">
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[8rem]">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={milestonesOnly ? "default" : "outline"}
          className="h-8 text-xs"
          onClick={() => setMilestonesOnly((v) => !v)}
        >
          <Star className={`h-3.5 w-3.5 mr-1 ${milestonesOnly ? "fill-current" : ""}`} />
          Milestones
        </Button>
      </div>
    </div>
  );

  if (isLoading)
    return (
      <div className="space-y-3 max-w-[640px] mx-auto w-full">
        {Toolbar}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  if (items.length === 0)
    return (
      <div className="max-w-[640px] mx-auto w-full">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No Moments yet.</p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-3 max-w-[640px] mx-auto w-full">
      {Toolbar}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No Moments match your search.
          </CardContent>
        </Card>
      ) : (
        <GroupedMoments
          items={filtered}
          reactionMap={reactionMap}
          commentCountMap={commentCountMap}
          onOpen={setOpenId}
          onReact={(id) => toggleReact.mutate(id)}
          reacting={toggleReact.isPending}
          canDelete={canDeleteSomething}
          onDelete={(id, label) => setPendingDelete({ id, label })}
        />
      )}
      <UpdateDetailDialog updateId={openId} open={!!openId} onOpenChange={(v) => !v && setOpenId(null)} />
      <ConfirmDeleteDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Delete this Moment?"
        description="This will permanently remove the photo, caption, reactions and comments. This cannot be undone."
        confirmLabel="Delete Moment"
        affectedItems={["Photos & videos", "Reactions", "Comments"]}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/* -------------------- Grouped feed with day jumper -------------------- */

interface GroupedProps {
  items: any[];
  reactionMap: Map<string, { count: number; mine: boolean }>;
  commentCountMap: Map<string, number>;
  onOpen: (id: string) => void;
  onReact: (id: string) => void;
  reacting: boolean;
  canDelete: boolean;
  onDelete: (id: string, label: string) => void;
}

function GroupedMoments({ items, reactionMap, commentCountMap, onOpen, onReact, reacting, canDelete, onDelete }: GroupedProps) {
  // Group by activity_date (already sorted desc by parent)
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const u of items) {
      const key = u.activity_date as string;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries()); // [ [date, items[]], ... ] desc
  }, [items]);

  const dates = groups.map(([d]) => d);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeDate = dates[activeIdx];

  const goPrev = () => {
    // older (next in the desc list)
    if (activeIdx < dates.length - 1) {
      setActiveIdx(activeIdx + 1);
      scrollToDate(dates[activeIdx + 1]);
    }
  };
  const goNext = () => {
    // newer
    if (activeIdx > 0) {
      setActiveIdx(activeIdx - 1);
      scrollToDate(dates[activeIdx - 1]);
    }
  };
  const goLatest = () => {
    setActiveIdx(0);
    scrollToDate(dates[0]);
  };

  const scrollToDate = (d: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`moments-day-${d}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-4">
      {/* Day jumper */}
      {dates.length > 1 && (
        <div className="sticky top-0 z-10 -mx-1 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-1 py-1.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={goPrev}
              disabled={activeIdx >= dates.length - 1}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0 text-center">
              <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground truncate">
                <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{activeDate ? format(new Date(activeDate), "EEE, d MMM yyyy") : "—"}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Day {activeIdx + 1} of {dates.length}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={goNext}
              disabled={activeIdx === 0}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {activeIdx !== 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={goLatest}>
                Latest
              </Button>
            )}
          </div>
        </div>
      )}

      {groups.map(([date, dayItems]) => (
        <section key={date} id={`moments-day-${date}`} className="space-y-2 scroll-mt-20">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              {format(new Date(date), "EEEE, d MMM yyyy")}
            </h4>
            <Badge variant="outline" className="text-[10px]">{dayItems.length} moment{dayItems.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="space-y-3">
            {dayItems.map((u: any) => {
              const media = (u.child_update_media ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
              const r = reactionMap.get(u.id) ?? { count: 0, mine: false };
              return (
                <Card key={u.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-3 space-y-2">
                    {media.length > 0 && (
                      <MomentMediaCarousel media={media} onOpen={() => onOpen(u.id)} />
                    )}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] text-muted-foreground">{format(new Date(u.activity_date), "EEE, d MMM")}</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {u.subject_name && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">{u.subject_name}</Badge>
                        )}
                        {u.development_domains?.name && (
                          <Badge variant="secondary" className="text-[10px]">{u.development_domains.name}</Badge>
                        )}
                        {u.milestone_flag && (
                          <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20">
                            <Star className="h-2.5 w-2.5 mr-0.5 fill-accent" />
                            Milestone
                          </Badge>
                        )}
                        {u.learning_albums?.title && (
                          <Badge variant="outline" className="text-[10px]">{u.learning_albums.title}</Badge>
                        )}
                      </div>
                    </div>
                    <p
                      className="text-sm whitespace-pre-wrap cursor-pointer"
                      onClick={() => onOpen(u.id)}
                    >
                      {u.parent_summary || u.caption || "—"}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={r.mine ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          disabled={reacting}
                          onClick={(e) => { e.stopPropagation(); onReact(u.id); }}
                        >
                          <Heart className={`h-3.5 w-3.5 mr-1 ${r.mine ? "fill-current" : ""}`} />
                          {r.count}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); onOpen(u.id); }}
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" />
                          {commentCountMap.get(u.id) ?? 0}
                        </Button>
                      </div>
                      {canDelete && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(
                              u.id,
                              u.parent_summary?.slice(0, 40) || u.caption?.slice(0, 40) || "Moment",
                            );
                          }}
                          title="Delete Moment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}