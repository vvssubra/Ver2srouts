import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Camera, BookOpen, Star, Sparkles, Clock, Heart, MessageCircle, Send, FolderOpen, ImageOff } from "lucide-react";
import { format, addDays, subDays, parseISO, startOfWeek } from "date-fns";
import { fetchChildStoryFeed, type StoryItem } from "@/lib/child-story-feed";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { VideoThumb } from "@/components/daily-updates/VideoThumb";

const proficiencyColors: Record<string, string> = {
  TP1: "bg-destructive/15 text-destructive border-destructive/30",
  TP2: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  TP3: "bg-accent/15 text-accent border-accent/30",
};

const proficiencyLabels: Record<string, string> = {
  TP1: "Developing",
  TP2: "Achieved",
  TP3: "Exceeding ⭐",
};

interface ParentDailyJourneyProps {
  studentId: string;
  branchId?: string;
}

export default function ParentDailyJourney({ studentId, branchId }: ParentDailyJourneyProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hasAutoJumped, setHasAutoJumped] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

  // Unified story feed (last 60 days)
  const { data: feed = [] } = useQuery({
    queryKey: ["child-story-feed", studentId],
    queryFn: () => fetchChildStoryFeed(studentId, { limit: 80 }),
    enabled: !!studentId,
    staleTime: 60 * 1000,
  });

  // Auto-jump to latest day that has stories
  useEffect(() => {
    if (feed.length && !hasAutoJumped) {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      if (feed[0].date !== todayStr) {
        setSelectedDate(parseISO(feed[0].date));
      }
      setHasAutoJumped(true);
    }
  }, [feed, hasAutoJumped]);

  const observations = feed.filter((s) => s.date === dateStr);
  const recentFromOtherDates = feed.filter((s) => s.date !== dateStr).slice(0, 8);

  // Fetch timetable slots for context
  const dayOfWeek = selectedDate.getDay();
  const { data: studentData } = useQuery({
    queryKey: ["student-class", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("class_id, first_name").eq("id", studentId).single();
      return data;
    },
    enabled: !!studentId,
  });

  const { data: todaySlots = [] } = useQuery({
    queryKey: ["journey-slots", (studentData as any)?.class_id, dateStr],
    queryFn: async () => {
      if (!studentData || !(studentData as any).class_id) return [];
      const { data: dailySlots } = await supabase
        .from("daily_timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name")
        .eq("class_id", (studentData as any).class_id)
        .eq("slot_date", dateStr)
        .order("start_time");
      if (dailySlots && dailySlots.length > 0) return dailySlots;
      if (dayOfWeek === 0 || dayOfWeek === 6) return [];
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name")
        .eq("class_id", (studentData as any).class_id)
        .eq("day_of_week", dayOfWeek)
        .order("start_time");
      return data ?? [];
    },
    enabled: !!(studentData as any)?.class_id,
    staleTime: 60 * 1000,
  });

  const allPhotos = observations.flatMap((s) => s.photos).filter(Boolean);

  const childName = (studentData as any)?.first_name || "Your child";

  const milestoneCount = observations.filter((s) => s.proficiency === "TP3").length;
  const photoCount = allPhotos.length;

  // Build a 7-day strip for week view
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const dayCounts = new Map<string, { count: number; photo?: string }>();
  for (const item of feed) {
    const cur = dayCounts.get(item.date) ?? { count: 0, photo: undefined };
    cur.count += 1;
    if (!cur.photo && item.photos[0]) cur.photo = item.photos[0];
    dayCounts.set(item.date, cur);
  }

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground leading-tight">
              {isToday ? "Today" : format(selectedDate, "EEEE")}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight">{format(selectedDate, "d MMMM yyyy")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            disabled={isToday}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex rounded-full border border-border bg-muted/40 p-0.5 text-[11px]">
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1 rounded-full transition ${view === "day" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Day
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-3 py-1 rounded-full transition ${view === "week" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Week
          </button>
        </div>
      </div>

      {view === "week" && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((d) => {
            const dStr = format(d, "yyyy-MM-dd");
            const isSel = dStr === dateStr;
            const info = dayCounts.get(dStr);
            return (
              <button
                key={dStr}
                onClick={() => { setSelectedDate(d); setView("day"); }}
                className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
                  isSel ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <span className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE")}</span>
                <span className="text-sm font-semibold text-foreground">{format(d, "d")}</span>
                {info?.photo ? (
                  <img src={info.photo} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <span className="h-7 w-7 rounded bg-muted/50" />
                )}
                {info?.count ? (
                  <span className="text-[10px] font-medium text-primary">{info.count}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">·</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {observations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <ImageOff className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Nothing shared yet for this day</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isToday
                ? "Stories appear here as your teacher captures them — usually by 5pm."
                : "Try another day or switch to the week view."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Highlights Banner */}
          <Card className="bg-gradient-to-r from-primary/10 via-accent/5 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {childName}'s Day — {observations.length} {observations.length === 1 ? "highlight" : "highlights"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : "Learning moments"}
                {milestoneCount > 0 && ` • ${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"}`}
              </p>
            </CardContent>
          </Card>

          {/* Photo Gallery */}
          {allPhotos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {allPhotos.slice(0, 6).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group">
                    <div className="aspect-square rounded-lg overflow-hidden border border-border shadow-sm group-hover:shadow-md transition-shadow">
                      <img src={url} alt={`Activity ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Cards */}
          <div className="relative space-y-3">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/30 via-primary/15 to-transparent" />
            {observations.map((item) => (
              <StoryTimelineCard key={item.id} item={item} userId={user?.id} todaySlots={todaySlots} />
            ))}
          </div>
        </>
      )}

      {/* Recent Stories from Other Dates — only on week view to keep day view focused */}
      {view === "week" && recentFromOtherDates.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {observations.length === 0 ? "Recent Highlights" : "More Recent Stories"}
            </span>
          </div>
          <div className="space-y-2">
            {recentFromOtherDates.map((story) => (
              <Card
                key={story.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedDate(parseISO(story.date)); setView("day"); }}
              >
                <CardContent className="p-3 flex items-start gap-3">
                  {story.photos[0] && (
                    <img
                      src={story.photos[0]}
                      alt="Activity"
                      className="h-12 w-12 rounded-lg object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {format(parseISO(story.date), "d MMM")}
                      </Badge>
                      {story.source === "activity" && (
                        <Badge variant="secondary" className="text-[10px]"><FolderOpen className="h-2.5 w-2.5 mr-0.5" />Album</Badge>
                      )}
                      {story.proficiency && (
                        <Badge variant="outline" className={`text-[10px] ${proficiencyColors[story.proficiency] || ""}`}>
                          {proficiencyLabels[story.proficiency] || story.proficiency}
                        </Badge>
                      )}
                      {story.standardCode && (
                        <span className="text-[10px] font-mono text-muted-foreground">{story.standardCode}</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80 line-clamp-2">
                      {story.body || story.title}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StoryTimelineCard({ item, userId, todaySlots }: { item: StoryItem; userId?: string; todaySlots: any[] }) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const isObservation = item.source === "observation";
  const obsId = isObservation ? (item.raw?.id as string) : null;
  const slot = isObservation && item.raw?.timetable_slot_id
    ? todaySlots.find((s: any) => s.id === item.raw.timetable_slot_id)
    : null;

  // Fetch reactions count
  const { data: reactions = [] } = useQuery({
    queryKey: ["obs-reactions", obsId],
    queryFn: async () => {
      const { data } = await supabase
        .from("observation_reactions")
        .select("id, parent_id, reaction_type")
        .eq("observation_id", obsId!);
      return data ?? [];
    },
    enabled: !!obsId,
  });

  // Fetch comments
  const { data: comments = [] } = useQuery({
    queryKey: ["obs-comments", obsId],
    queryFn: async () => {
      const { data } = await supabase
        .from("observation_comments")
        .select("id, parent_id, comment_text, created_at")
        .eq("observation_id", obsId!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: showComments && !!obsId,
  });

  const hasLiked = reactions.some((r: any) => r.parent_id === userId && r.reaction_type === "like");
  const likeCount = reactions.filter((r: any) => r.reaction_type === "like").length;

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!obsId) return;
      if (hasLiked) {
        await supabase
          .from("observation_reactions")
          .delete()
          .eq("observation_id", obsId)
          .eq("parent_id", userId!)
          .eq("reaction_type", "like");
      } else {
        await supabase
          .from("observation_reactions")
          .insert({ observation_id: obsId, parent_id: userId!, reaction_type: "like" } as any);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["obs-reactions", obsId] }),
  });

  const addCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!obsId) return;
      await supabase
        .from("observation_comments")
        .insert({ observation_id: obsId, parent_id: userId!, comment_text: text } as any);
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["obs-comments", obsId] });
    },
  });

  return (
    <div className="relative pl-10">
      <div className="absolute left-[11px] top-4 h-3 w-3 rounded-full bg-primary border-2 border-background shadow-sm" />
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <div className="px-3 sm:px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          {slot && (
            <span className="text-xs font-mono text-muted-foreground">
              {slot.start_time?.slice(0, 5)}
            </span>
          )}
          {slot && (
            <Badge variant="secondary" className="text-xs">{slot.subject_name}</Badge>
          )}
          {item.source === "activity" && (
            <Badge variant="secondary" className="text-xs"><FolderOpen className="h-3 w-3 mr-1" />{item.albumTitle || "Class Activity"}</Badge>
          )}
          {item.proficiency && (
            <Badge variant="outline" className={`text-xs ${proficiencyColors[item.proficiency] || ""}`}>
              {proficiencyLabels[item.proficiency] || item.proficiency}
            </Badge>
          )}
          {item.standardCode && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              {item.standardCode}
            </span>
          )}
        </div>
        <CardContent className="p-3 sm:p-4 pt-1 space-y-2">
          {isObservation && item.raw?.ai_learning_story ? (
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Learning Story</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{item.raw.ai_learning_story}</p>
            </div>
          ) : item.body ? (
            <p className="text-sm text-foreground/90 leading-relaxed">{item.body}</p>
          ) : null}
          {isObservation && item.raw?.curriculum_standards?.title_ms && (
            <p className="text-xs text-muted-foreground">
              {item.raw.curriculum_standards.title_ms}
              {item.raw.curriculum_standards.title_en ? ` / ${item.raw.curriculum_standards.title_en}` : ""}
            </p>
          )}
          {item.photos.length > 0 && (
            <div className="pt-1">
              {item.photos.length === 1 ? (
                <img
                  src={item.photos[0]}
                  alt="Activity"
                  className="rounded-lg max-h-56 w-full object-cover border"
                  loading="lazy"
                />
              ) : (
                <>
                  {/* Mobile: swipeable carousel */}
                  <div className="sm:hidden">
                    <Carousel opts={{ align: "start", loop: false }} className="w-full">
                      <CarouselContent className="-ml-2">
                        {item.photos.map((url, i) => (
                          <CarouselItem key={i} className="pl-2 basis-full">
                            <img
                              src={url}
                              alt={`Photo ${i + 1} of ${item.photos.length}`}
                              className="rounded-lg max-h-72 w-full object-cover border"
                              loading="lazy"
                            />
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious className="left-2 h-7 w-7" />
                      <CarouselNext className="right-2 h-7 w-7" />
                    </Carousel>
                    <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                      Swipe to view all {item.photos.length} photos
                    </p>
                  </div>
                  {/* Tablet/desktop: grid */}
                  <div className="hidden sm:grid grid-cols-3 gap-1.5">
                    {item.photos.slice(0, 6).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="aspect-square rounded-md object-cover border"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {item.videos && item.videos.length > 0 && (
            <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {item.videos.slice(0, 4).map((video, i) => (
                <a
                  key={i}
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-video max-h-56 overflow-hidden rounded-lg border bg-muted"
                >
                  <VideoThumb src={video.url} posterSrc={video.thumbnailUrl} badgeSize="sm" />
                </a>
              ))}
            </div>
          )}

          {/* Like & Comment Actions — observations only */}
          {isObservation && (
          <div className="flex items-center gap-4 pt-2 border-t border-border/50">
            <button
              onClick={() => userId && toggleLikeMutation.mutate()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Heart className={`h-4 w-4 ${hasLiked ? "fill-destructive text-destructive" : ""}`} />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className={`h-4 w-4 ${showComments ? "text-primary" : ""}`} />
              <span>Comment</span>
            </button>
          </div>
          )}

          {/* Comments section */}
          {isObservation && showComments && (
            <div className="space-y-2 pt-1">
              {comments.map((c: any) => (
                <div key={c.id} className="text-xs bg-muted/50 rounded-lg p-2">
                  <p className="text-foreground">{c.comment_text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(c.created_at), "d MMM, h:mm a")}
                  </p>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentText.trim()) {
                      addCommentMutation.mutate(commentText.trim());
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
