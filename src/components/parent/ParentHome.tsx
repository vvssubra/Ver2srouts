import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { resolveViewableUrl } from "@/lib/storage/signedUrl";
import { useParentChildren } from "@/hooks/use-parent-children";
// Note: Home reads directly from `child_updates` — the single canonical
// source of truth shared with the parent /journey feed (MomentsFeed).
// We intentionally do NOT use fetchChildStoryFeed here because that helper
// merges legacy sources (learning_activities, observations, journey
// entries) that Journey does not render, which causes Home → Journey drift.
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, EmptyState, StatusBadge } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sun, GraduationCap, CheckCircle2, Clock, Heart, Sparkles,
  Receipt, MessageSquare, BookOpen, FileText, ArrowRight,
  AlertTriangle, CalendarDays, Camera, Users, Megaphone,
} from "lucide-react";
import { SmartMomentImagePreview } from "@/components/daily-updates/SmartMomentImagePreview";
import {
  useWeeklyLessonContext,
  ParentWeeklyAtHomeCard,
} from "@/components/parent/ParentLessonContextCards";

/**
 * Parent Home — premium "Today at School" dashboard for /child.
 *
 * Read-only composition over existing data hooks: profile, parent_students,
 * today's attendance, latest shared observation, fee summary, unread
 * messages. No mutations. No new schema. Onboarding lock is enforced
 * upstream by /parent-onboarding so we do not duplicate it here.
 */
export default function ParentHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const todayISO = format(new Date(), "yyyy-MM-dd");

  // Parent profile — shared cache key with ParentChildView
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Children — shared cache key with every other parent surface
  const { children, firstChild, isLoading: loadingChildren } = useParentChildren();
  const child = firstChild; // primary child for home; deep view supports switching
  const childId: string | undefined = child?.id;
  const className: string | undefined = (child as any)?.classes?.class_name;
  const childFirstName: string = (child as any)?.first_name || "Your child";
  const classId: string | undefined = (child as any)?.class_id ?? (child as any)?.classes?.id;

  // Weekly context drives the "Home Activity" card — theme, vocabulary,
  // suggested questions and family-connection tips for the child's class.
  const { data: weeklyCtx } = useWeeklyLessonContext(classId ?? null);

  // Today's attendance — lightweight 1-row lookup
  const { data: todayAttendance } = useQuery({
    queryKey: ["parent-home-today-attendance", childId, todayISO],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", childId!)
        .eq("date", todayISO)
        .maybeSingle();
      return data;
    },
    enabled: !!childId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  // Realtime: refresh today's attendance the moment admin/teacher updates it
  useEffect(() => {
    if (!childId) return;
    const channel = supabase
      .channel(`parent-home-att-${childId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `student_id=eq.${childId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["parent-home-today-attendance", childId, todayISO] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "child_updates", filter: `student_id=eq.${childId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["parent-home-latest-story", childId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [childId, todayISO, queryClient]);

  // Latest shared learning moment — reads `child_updates` (the same table
  // /journey's MomentsFeed renders). Covers both per-child updates
  // (student_id = childId) and class-wide updates the child was tagged in
  // via child_update_students. Keeping the source identical guarantees
  // every item shown on Home exists on Journey.
  const { data: latestStory } = useQuery({
    queryKey: ["parent-home-latest-story", childId],
    queryFn: async () => {
      if (!childId) return null;
      // 1. Tagged class-wide updates
      const { data: tagRows } = await supabase
        .from("child_update_students")
        .select("update_id")
        .eq("student_id", childId);
      const taggedIds = (tagRows ?? []).map((r: any) => r.update_id);
      // 2. Build OR filter: own row OR tagged row
      const filters = [`student_id.eq.${childId}`];
      if (taggedIds.length) filters.push(`id.in.(${taggedIds.join(",")})`);
      const { data } = await supabase
        .from("child_updates")
        .select(
          "id, caption, parent_summary, ai_learning_story, activity_date, created_at, proficiency_level, development_domains(name), child_update_media(url, kind, thumbnail_url, sort_order)"
        )
        .or(filters.join(","))
        .eq("visible_to_parent", true)
        .eq("status", "shared")
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const row: any = data?.[0];
      if (!row) return null;
      const media = (row.child_update_media ?? [])
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const cover = media[0] ?? null;
      const photos = media.filter((m: any) => m.kind !== "video").map((m: any) => m.url).filter(Boolean);
      return {
        id: row.id,
        title: row.caption || "Learning moment",
        body: row.parent_summary || row.ai_learning_story || row.caption || "",
        area: row.development_domains?.name ?? null,
        date: row.activity_date || (row.created_at ?? "").slice(0, 10),
        createdAt: row.created_at,
        photos,
        coverUrl: cover?.url ?? photos[0] ?? null,
        coverKind: cover?.kind ?? (photos[0] ? "photo" : null),
        coverThumbnailUrl: cover?.thumbnail_url ?? null,
      };
    },
    enabled: !!childId,
    staleTime: 60 * 1000,
  });

  // Fee summary — same shape ParentChildView uses
  const { data: feeSummary } = useQuery({
    queryKey: ["parent-fee-summary", childId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, status, total_amount, amount_paid, due_date")
        .eq("student_id", childId!)
        .order("due_date", { ascending: false })
        .limit(50);
      const invoices = data ?? [];
      const outstanding = invoices
        .filter((i: any) => ["issued", "partial", "overdue"].includes(i.status))
        .reduce((sum: number, i: any) => sum + (i.total_amount - i.amount_paid), 0);
      const overdue = invoices.filter((i: any) => i.status === "overdue").length;
      const nextDue = invoices.find((i: any) => ["issued", "partial", "overdue"].includes(i.status));
      return { outstanding, overdue, nextDue, total: invoices.length };
    },
    enabled: !!childId,
    staleTime: 60 * 1000,
  });

  // Unread school updates — announcements + newsletters + direct parent
  // messages targeting this parent. Chat notifications live in the Chat
  // tab and are intentionally excluded so this card only reflects true
  // "School Updates" (which is what parents expect it to mean).
  //
  // Read state is sourced from the same tables the /parent-messages page
  // uses (announcement_reads for announcements, parent_messages.is_read
  // for direct messages), so opening an item over there clears it here.
  const branchIds = useMemo(
    () => Array.from(new Set((children ?? []).map((c: any) => c?.branch_id).filter(Boolean))),
    [children],
  );
  const childClassNames = useMemo(
    () => Array.from(new Set((children ?? []).map((c: any) => c?.class_name).filter(Boolean))),
    [children],
  );
  const { data: schoolUpdates } = useQuery({
    queryKey: ["parent-home-school-updates", user?.id, branchIds.join(","), childClassNames.join(",")],
    queryFn: async () => {
      if (!branchIds.length) return { count: 0, latest: null as any };
      const [annRes, readsRes, msgRes] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, body, created_at, created_by, target_type, target_class, target_parent_ids")
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("announcement_reads")
          .select("announcement_id")
          .eq("parent_user_id", user!.id),
        supabase
          .from("parent_messages")
          .select("id, subject, body, created_at, is_read, sender_id")
          .eq("recipient_id", user!.id)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const readSet = new Set((readsRes.data ?? []).map((r: any) => r.announcement_id));
      const forMe = (annRes.data ?? []).filter((a: any) => {
        const t = a.target_type;
        if (t === "staff" || t === "staff_all" || t === "staff_specific") return false;
        if (t === "all" || t === "parents_all") return true;
        if (t === "class" || t === "parents_class") return childClassNames.includes(a.target_class);
        if (t === "specific" || t === "parents_specific") return (a.target_parent_ids ?? []).includes(user!.id);
        return false;
      });
      const unreadAnn = forMe.filter((a: any) => !readSet.has(a.id));
      const senderIds = Array.from(
        new Set([
          ...unreadAnn.map((a: any) => a.created_by),
          ...(msgRes.data ?? []).map((m: any) => m.sender_id),
        ].filter(Boolean)),
      );
      let senderMap: Record<string, string> = {};
      if (senderIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", senderIds);
        senderMap = Object.fromEntries(
          (profs ?? []).map((p: any) => [
            p.id,
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "School",
          ]),
        );
      }
      const items = [
        ...unreadAnn.map((a: any) => ({
          id: `a-${a.id}`,
          title: a.title,
          preview: a.body,
          sender: senderMap[a.created_by] || "School",
          created_at: a.created_at,
        })),
        ...(msgRes.data ?? []).map((m: any) => ({
          id: `m-${m.id}`,
          title: m.subject || "New message from school",
          preview: m.body,
          sender: senderMap[m.sender_id] || "School",
          created_at: m.created_at,
        })),
      ].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return { count: items.length, latest: items[0] ?? null };
    },
    enabled: !!user && !!children,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  const unreadMessages = schoolUpdates?.count ?? 0;
  const latestUpdate = schoolUpdates?.latest ?? null;

  // Realtime: clear the card the instant the parent marks something read
  // on /parent-messages (announcement_reads insert or parent_messages
  // is_read update), and refresh when a new announcement arrives.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`parent-home-updates-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcement_reads", filter: `parent_user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["parent-home-school-updates", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_messages", filter: `recipient_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["parent-home-school-updates", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, () => {
        queryClient.invalidateQueries({ queryKey: ["parent-home-school-updates", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const childPhoto = (child as any)?.photo_url || undefined;
  const arrivalPhoto = (todayAttendance as any)?.arrival_photo_url || undefined;
  const heroDisplayPhoto = arrivalPhoto || childPhoto;
  const [resolvedHeroDisplayPhoto, setResolvedHeroDisplayPhoto] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setResolvedHeroDisplayPhoto(heroDisplayPhoto);
    if (!heroDisplayPhoto) return;

    resolveViewableUrl(heroDisplayPhoto)
      .then((url) => {
        if (!cancelled) setResolvedHeroDisplayPhoto(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedHeroDisplayPhoto(heroDisplayPhoto);
      });

    return () => {
      cancelled = true;
    };
  }, [heroDisplayPhoto]);

  // Greeting copy
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);
  const parentName = (profile as any)?.first_name?.trim();
  const childFirst = child?.first_name?.trim();

  if (loadingChildren) {
    return (
      <DashboardLayout>
        {/* Parent app shell skeleton — keeps bottom nav visible (via
            DashboardLayout) and mirrors the real Home layout so there is
            no jarring jump when data arrives. */}
        <div className="space-y-4 p-4 max-w-md mx-auto" aria-busy="true" aria-label="Loading your child's day">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          {/* Hero / child card */}
          <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
          {/* Quick actions row */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))}
          </div>
          {/* Fee card */}
          <Skeleton className="h-24 w-full rounded-2xl" />
          {/* Latest learning moment */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // No linked child — defer to the existing flow inside ParentChildView
  if (!child) {
    navigate("/journey", { replace: true });
    return null;
  }

  const moment = latestStory as any;
  const heroPhoto: string | undefined = moment?.coverUrl || moment?.photos?.[0] || undefined;
  const momentHeadline = moment?.title || moment?.area || "Learning moment";
  const momentBody = moment?.body || "";
  const momentDate = moment?.date || moment?.createdAt;
  const momentArea = moment?.area as string | undefined;

  const displayHeroPhoto = resolvedHeroDisplayPhoto || heroDisplayPhoto;

  const quickActions = [
    { label: "Pay Fees", icon: Receipt, to: "/parent-fees", tone: "warm" },
    { label: "Chat", icon: MessageSquare, to: "/parent-chat", tone: "info" },
    { label: "Journey", icon: BookOpen, to: "/journey", tone: "success" },
    { label: "Updates", icon: Megaphone, to: "/parent-messages", tone: "muted" },
    { label: "Documents", icon: FileText, to: "/school-documents", tone: "muted" },
    { label: "Meetings", icon: Users, to: "/parent-ptm", tone: "muted" },
  ] as const;

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-5 max-w-2xl mx-auto pb-4">
        {/* Sub-greeting (top bar shows the main greeting) */}
        <header className="px-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{format(new Date(), "EEEE, d MMMM yyyy")}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Here&apos;s {childFirst ?? "your child"}&apos;s day at school.
          </p>
        </header>

        {/* TODAY AT SCHOOL — warm photo-forward hero */}
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-b from-primary-wash via-card to-card shadow-sm">
          {displayHeroPhoto ? (
            <div className="relative aspect-[4/3] sm:aspect-[16/10] w-full bg-muted overflow-hidden">
              <img
                src={displayHeroPhoto}
                alt={`${child.first_name ?? "Your child"} today at school`}
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4 pt-10">
                <h2 className="text-lg font-bold text-foreground drop-shadow-sm">
                  {child.first_name} {child.last_name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    <GraduationCap className="h-3 w-3" />
                    {className || "Class TBA"}
                  </Badge>
                  {arrivalPhoto && (todayAttendance as any)?.created_at && (
                    <Badge variant="outline" className="text-[11px] gap-1">
                      <Clock className="h-3 w-3" />
                      Arrived {format(new Date((todayAttendance as any).created_at), "h:mm a")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 px-5 pt-5">
              <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shrink-0 shadow-sm">
                {child.first_name?.[0] ?? "•"}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-foreground truncate">
                  {child.first_name} {child.last_name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    <GraduationCap className="h-3 w-3" />
                    {className || "Class TBA"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <CardContent className="p-4 sm:p-5 space-y-3">
            <TodayAttendanceLine attendance={todayAttendance} childFirst={childFirst} />
            {todayAttendance ? (
              <TodaySnapshot rec={todayAttendance} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Your teacher hasn&apos;t shared today&apos;s update yet — check back soon.
              </p>
            )}
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs px-2"
                onClick={() => navigate("/check-in")}
              >
                See full log <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* QUICK ACTIONS — horizontal pill strip, never truncates */}
        <div className="-mx-3 px-3 overflow-x-auto scrollbar-none">
          <div className="flex gap-2.5 min-w-max">
            {quickActions.map((a) => {
              const Icon = a.icon;
              const toneClass =
                a.tone === "warm"
                  ? "bg-warning/10 text-warning border-warning/20"
                  : a.tone === "info"
                  ? "bg-info/10 text-info border-info/20"
                  : a.tone === "success"
                  ? "bg-success/10 text-success border-success/20"
                  : "bg-muted text-foreground border-border";
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => navigate(a.to)}
                  className="flex flex-col items-center justify-center w-[78px] h-[78px] rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all gap-1.5 active:scale-95"
                >
                  <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center border", toneClass)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-medium text-foreground leading-none">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FEE ALERT — only when there's something to act on */}
        {feeSummary && (feeSummary.outstanding > 0 || feeSummary.overdue > 0) && (
          <FeeReminderCard fee={feeSummary} onOpen={() => navigate("/parent-fees")} />
        )}

        {/* LATEST LEARNING MOMENT — photo-forward, only renders image when valid */}
        <SectionCard
          title="Latest Learning Moment"
          description="A snapshot of what your child explored recently."
          actions={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/journey")}>
              View Journey <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          }
          bodyClassName="pt-0"
        >
          {moment ? (
            <button
              type="button"
              onClick={() => navigate("/journey")}
              className="w-full text-left rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden bg-card"
            >
              <SafeMomentImage src={heroPhoto} kind={moment?.coverKind} posterSrc={moment?.coverThumbnailUrl} />
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="gap-1 text-[10px] max-w-full">
                    <Sparkles className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate max-w-[220px]">{momentHeadline}</span>
                  </Badge>
                  {momentDate && (
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(momentDate), "d MMM yyyy")}
                    </span>
                  )}
                </div>
                {momentBody && (
                  <p className="text-sm text-foreground/85 line-clamp-3">{momentBody}</p>
                )}
              </div>
            </button>
          ) : (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No learning moments yet"
              description="Your child's teacher will share photos and notes here soon."
            />
          )}
        </SectionCard>

        {/* HOME ACTIVITY — this week's theme + parent-friendly try-at-home
            prompts, sourced from the teacher's weekly plan and theme bank. */}
        <SectionCard
          title="Home Activity"
          description="Try these at home this week to extend classroom learning."
          actions={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/progress")}>
              See progress <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          }
          bodyClassName="pt-0"
        >
          <ParentWeeklyAtHomeCard childFirst={childFirstName} ctx={weeklyCtx ?? null} />
        </SectionCard>

        {/* SCHOOL UPDATES */}
        <SectionCard
          title="School Updates"
          description="Announcements & newsletters from school."
          actions={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/parent-messages")}>
              Open <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          }
        >
          {unreadMessages > 0 ? (
            <button
              type="button"
              onClick={() => navigate("/parent-messages")}
              className="w-full flex items-center gap-3 rounded-lg border border-info/30 bg-info/5 p-3 hover:bg-info/10 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-info/15 text-info flex items-center justify-center shrink-0">
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {latestUpdate?.title || `${unreadMessages} new update${unreadMessages === 1 ? "" : "s"} from school`}
                </p>
                {latestUpdate?.sender && (
                  <p className="text-xs text-muted-foreground truncate">
                    From: {latestUpdate.sender}
                  </p>
                )}
                {unreadMessages > 1 && (
                  <p className="text-[10px] text-info mt-0.5">+{unreadMessages - 1} more</p>
                )}
              </div>
            </button>
          ) : (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title="No new updates from school"
              description="Announcements from school will appear here."
              className="py-6"
            />
          )}
        </SectionCard>
      </div>
    </DashboardLayout>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function SafeMomentImage({ src, kind, posterSrc }: { src?: string; kind?: string | null; posterSrc?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="aspect-[4/3] sm:aspect-[16/10] w-full bg-primary-wash flex flex-col items-center justify-center text-primary/50 gap-1 overflow-hidden">
        <Camera className="h-7 w-7" />
        <span className="text-[11px]">Photo will appear here when shared</span>
      </div>
    );
  }
  return (
    <SmartMomentImagePreview
      src={src}
      kind={kind}
      posterSrc={posterSrc}
      aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
      className="rounded-none"
      onError={() => setFailed(true)}
    />
  );
}

function TodayAttendanceLine({ attendance, childFirst }: { attendance: any; childFirst?: string }) {
  const name = childFirst ?? "Your child";
  if (!attendance) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" />
        <span>Not checked in yet today</span>
      </div>
    );
  }
  const s = attendance.status;
  if (s === "present") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        <span className="text-foreground"><span className="font-semibold">{name}</span> is checked in today</span>
      </div>
    );
  }
  if (s === "absent") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-foreground">Marked absent today</span>
      </div>
    );
  }
  if (s === "late") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4 text-warning shrink-0" />
        <span className="text-foreground">Arrived late today</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4 shrink-0" />
      <span className="capitalize">{s}</span>
    </div>
  );
}

function TodaySnapshot({ rec }: { rec: any }) {
  const temp = rec.temperature ? Number(rec.temperature) : null;
  const hasFever = temp !== null && temp >= 37.5;
  const moodEmoji: Record<string, string> = {
    happy: "😊", neutral: "😐", sad: "😢", angry: "😠", tired: "😴", excited: "🤩",
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={rec.status === "present" ? "present" : rec.status === "absent" ? "absent" : rec.status === "late" ? "late" : rec.status} />
        {rec.mood && (
          <Badge variant="outline" className="text-[11px]">
            <span className="mr-1 text-sm leading-none">{moodEmoji[rec.mood] ?? "😐"}</span>
            <span className="capitalize">{rec.mood}</span>
          </Badge>
        )}
        {temp !== null && (
          <Badge
            variant="outline"
            className={`text-[11px] ${hasFever ? "border-destructive/40 text-destructive" : ""}`}
          >
            {temp}°C{hasFever ? " ⚠️" : ""}
          </Badge>
        )}
        {rec.has_medication && (
          <Badge variant="outline" className="text-[11px]">💊 Medication</Badge>
        )}
      </div>
      {rec.notes && (
        <p className="text-sm text-foreground/85 line-clamp-3">{rec.notes}</p>
      )}
      {rec.health_notes && (
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/80">Health:</span> {rec.health_notes}</p>
      )}
    </div>
  );
}

function FeeReminderCard({ fee, onOpen }: { fee: any; onOpen: () => void }) {
  if (!fee || fee.total === 0) {
    return (
      <SectionCard
        title="Fees"
        actions={
          <Button variant="ghost" size="sm" className="text-xs" onClick={onOpen}>
            Open <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          View fees and payment status when invoices are issued.
        </p>
      </SectionCard>
    );
  }

  const overdue = fee.overdue > 0;
  const outstanding = fee.outstanding > 0;
  const allPaid = !overdue && !outstanding;

  const tone = overdue
    ? "border-destructive/30 bg-destructive/5"
    : outstanding
    ? "border-warning/30 bg-warning/5"
    : "border-success/30 bg-success/5";

  return (
    <Card className={`overflow-hidden border ${tone}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className={`h-4 w-4 ${overdue ? "text-destructive" : outstanding ? "text-warning" : "text-success"}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fees</span>
          </div>
          <StatusBadge status={overdue ? "overdue" : outstanding ? "pending" : "paid"} />
        </div>
        <div>
          <p className={`text-2xl font-bold tabular-nums ${overdue ? "text-destructive" : outstanding ? "text-warning" : "text-success"}`}>
            RM {fee.outstanding.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {allPaid
              ? "All invoices settled"
              : fee.nextDue
              ? `Next due ${format(new Date(fee.nextDue.due_date), "d MMM yyyy")}`
              : "Outstanding balance"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={overdue ? "destructive" : "default"}
            className="flex-1"
            onClick={onOpen}
          >
            {overdue || outstanding ? "Pay now" : "View history"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}