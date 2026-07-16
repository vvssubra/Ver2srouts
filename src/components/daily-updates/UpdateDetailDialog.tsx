import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Calendar as CalendarIcon, Eye, EyeOff, Star, Trash2, Loader2, Info, Download, X as XIcon, ChevronLeft, ChevronRight, Pencil, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { MomentEngagement } from "./MomentEngagement";
import { VideoThumb } from "./VideoThumb";
import { useAuth } from "@/lib/auth";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildChecklist,
  blockingFailures,
  MIN_OBSERVATION_CHARS,
} from "@/lib/learning-journey/validation";

interface Props {
  updateId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UpdateDetailDialog({ updateId, open, onOpenChange }: Props) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [data, setData] = useState<any>(null);
  const [studentNames, setStudentNames] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [skills, setSkills] = useState<Array<{ domain_name: string | null; indicator_label: string | null; proficiency_level: string | null }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editParentSummary, setEditParentSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!open || !updateId) {
      setData(null);
      setStudentNames("");
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Fetch the moment plain (no fragile embedded students join — that select
        // failed silently for group updates and left the dialog stuck on "Loading…").
        const { data: row, error: rowErr } = await supabase
          .from("child_updates")
          .select(
            "id, branch_id, created_by, student_id, subject_name, caption, parent_summary, ai_learning_story, activity_date, status, visible_to_parent, milestone_flag, proficiency_level, development_domains(name), learning_albums(title), child_update_media(url, kind, thumbnail_url, sort_order)"
          )
          .eq("id", updateId)
          .maybeSingle();
        if (rowErr) throw rowErr;
        if (!row) throw new Error("This Moment is no longer available.");

        // Resolve children names: direct (student_id) or group (child_update_students)
        let names = "";
        if (row.student_id) {
          const { data: s } = await supabase
            .from("students")
            .select("first_name, last_name")
            .eq("id", row.student_id)
            .maybeSingle();
          if (s) names = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
        } else {
          const { data: links } = await supabase
            .from("child_update_students")
            .select("students(first_name, last_name)")
            .eq("update_id", row.id);
          names =
            (links ?? [])
              .map((r: any) => r.students?.first_name)
              .filter(Boolean)
              .join(", ") || "Group update";
        }

        if (!cancelled) {
          setData(row);
          setStudentNames(names || "Moment");
          setEditCaption(row.caption ?? "");
          setEditParentSummary(row.parent_summary ?? "");
          setEditMode(false);
        }

        // Fetch every skill the teacher tagged on this Moment
        const { data: skillRows } = await supabase
          .from("child_update_skills")
          .select("indicator_label, proficiency_level, development_domains(name)")
          .eq("update_id", row.id);
        if (!cancelled) {
          setSkills(
            (skillRows ?? []).map((r: any) => ({
              domain_name: r.development_domains?.name ?? null,
              indicator_label: r.indicator_label ?? null,
              proficiency_level: r.proficiency_level ?? null,
            })),
          );
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load this Moment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateId, open]);

  const canDelete =
    !!data &&
    !!user &&
    (role === "super_admin" ||
      role === "admin" ||
      role === "franchisee" ||
      role === "teacher" ||
      data.created_by === user.id);

  const isStaff =
    role === "super_admin" || role === "admin" || role === "franchisee" || role === "teacher";
  const isDraft =
    !!data && (data.status === "draft" || data.visible_to_parent === false);
  const canEdit =
    !!data &&
    !!user &&
    isDraft &&
    (isStaff || data.created_by === user.id);

  const refreshFeeds = () => {
    qc.invalidateQueries({ queryKey: ["moments-feed"] });
    qc.invalidateQueries({ queryKey: ["daily-updates"] });
    qc.invalidateQueries({ queryKey: ["timeline-child-updates"] });
    qc.invalidateQueries({ queryKey: ["timeline-journey"] });
    qc.invalidateQueries({ queryKey: ["child-story-feed"] });
  };

  const handleSaveEdits = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("child_updates")
        .update({
          caption: editCaption.trim() || null,
          parent_summary: editParentSummary.trim() || null,
        })
        .eq("id", data.id);
      if (error) throw error;
      setData({
        ...data,
        caption: editCaption.trim() || null,
        parent_summary: editParentSummary.trim() || null,
      });
      setEditMode(false);
      refreshFeeds();
      toast.success("Draft updated.");
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!data) return;
    const hasMedia = (data.child_update_media ?? []).length > 0;
    const caption = (editMode ? editCaption : data.caption ?? "").trim();
    const parentSummary = (editMode ? editParentSummary : data.parent_summary ?? "").trim();
    const tracksProgress = skills.length > 0;
    const items = buildChecklist({
      share: true,
      tracksProgress,
      parentSummary,
      caption,
      skillCount: skills.length,
      hasDomainTagged: skills.some((s) => !!s.domain_name),
      hasMedia,
      shortVideoCount: 0, // media already uploaded; original probe not available here
    });
    const blockers = blockingFailures(items);
    if (blockers.length > 0) {
      toast.error(
        blockers.length === 1
          ? blockers[0].hint || `Cannot post yet: ${blockers[0].label}`
          : `Cannot post yet — please fix: ${blockers.map((b) => b.label).join("; ")}`,
        {
          description:
            tracksProgress
              ? `Tip: parent message needs at least ${MIN_OBSERVATION_CHARS} characters when skills are tagged.`
              : undefined,
          duration: 6000,
        },
      );
      return;
    }
    setPublishing(true);
    try {
      // Persist any in-progress edits first.
      if (editMode) {
        const { error: upErr } = await supabase
          .from("child_updates")
          .update({
            caption: editCaption.trim() || null,
            parent_summary: editParentSummary.trim() || null,
          })
          .eq("id", data.id);
        if (upErr) throw upErr;
      }
      const { error } = await supabase
        .from("child_updates")
        .update({ status: "shared", visible_to_parent: true })
        .eq("id", data.id);
      if (error) throw error;
      setData({ ...data, status: "shared", visible_to_parent: true });
      setEditMode(false);
      refreshFeeds();
      toast.success("Shared with parents.");
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("child_updates").delete().eq("id", data.id);
      if (error) throw error;
      toast.success("Moment removed.");
      // Refresh anywhere this might be showing
      qc.invalidateQueries({ queryKey: ["moments-feed"] });
      qc.invalidateQueries({ queryKey: ["daily-updates"] });
      qc.invalidateQueries({ queryKey: ["timeline-child-updates"] });
      qc.invalidateQueries({ queryKey: ["timeline-journey"] });
      qc.invalidateQueries({ queryKey: ["child-story-feed"] });
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setDeleting(false);
    }
  };

  const media = (data?.child_update_media ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="text-base truncate">{studentNames || "Moment"}</DialogTitle>
              {data && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <CalendarIcon className="h-3 w-3" />
                  {format(new Date(data.activity_date), "PPP")}
                </p>
              )}
            </div>
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive shrink-0"
                onClick={() => setConfirmDelete(true)}
                title="Delete Moment"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.visible_to_parent ? "default" : "outline"} className="text-xs">
                {data.visible_to_parent ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                {data.visible_to_parent ? "Shared with parents" : "Internal draft"}
              </Badge>
              {data.milestone_flag && (
                <Badge className="bg-accent/10 text-accent text-xs"><Star className="h-3 w-3 mr-1 fill-accent" />Milestone</Badge>
              )}
              {data.subject_name && (
                <Badge className="text-xs bg-primary/10 text-primary border-primary/20">{data.subject_name}</Badge>
              )}
              {data.development_domains?.name && (
                <Badge variant="secondary" className="text-xs">{data.development_domains.name}</Badge>
              )}
              {data.proficiency_level && (
                <Badge variant="outline" className="text-xs capitalize">{data.proficiency_level}</Badge>
              )}
              {data.learning_albums?.title && (
                <Badge variant="outline" className="text-xs">Album: {data.learning_albums.title}</Badge>
              )}
            </div>

            {media.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {media.map((m: any, i: number) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className="aspect-square rounded-lg overflow-hidden bg-muted block focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label="Open photo"
                  >
                    {m.kind === "video" ? (
                      <VideoThumb src={m.url} posterSrc={m.thumbnail_url} badgeSize="sm" />
                    ) : (
                      <img src={m.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain bg-muted" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {(() => {
              // Show ONE narrative — richest first. The card on the feed already shows
              // the short caption/summary, so the dialog goes deep with the full AI story.
              const story = data.ai_learning_story || data.parent_summary || data.caption;
              const isShared = data.visible_to_parent && data.status === "shared";
              if (editMode) {
                return (
                  <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Short caption</Label>
                      <Input
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        placeholder="One-line moment caption"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Parent message
                        {skills.length > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({editParentSummary.trim().length}/{MIN_OBSERVATION_CHARS} min)
                          </span>
                        )}
                      </Label>
                      <Textarea
                        rows={5}
                        value={editParentSummary}
                        onChange={(e) => setEditParentSummary(e.target.value)}
                        placeholder="Describe what the child did and what it shows."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={saving || publishing}
                        onClick={() => {
                          setEditCaption(data.caption ?? "");
                          setEditParentSummary(data.parent_summary ?? "");
                          setEditMode(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" variant="outline" disabled={saving || publishing} onClick={handleSaveEdits}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
                      </Button>
                    </div>
                  </div>
                );
              }
              if (!story) return null;
              return (
                <div className="space-y-2">
                  {isStaff && !isShared && (
                    <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
                      <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span><span className="font-medium text-primary">Preview</span> — this is what parents will see when this Moment is shared.</span>
                    </div>
                  )}
                  <div className="rounded-lg border bg-muted/30 p-3.5">
                    <p className="text-xs font-medium text-primary flex items-center gap-1 mb-1.5">
                      <Sparkles className="h-3 w-3" /> Learning story
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{story}</p>
                  </div>
                </div>
              );
            })()}

            {skills.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Skills observed today</p>
                <ul className="space-y-1.5">
                  {skills.map((s, i) => (
                    <li key={i} className="text-sm flex flex-wrap items-center gap-1.5">
                      {s.domain_name && (
                        <Badge variant="secondary" className="text-[10px]">{s.domain_name}</Badge>
                      )}
                      <span>{s.indicator_label || "—"}</span>
                      {s.proficiency_level && (
                        <span className="text-xs text-muted-foreground capitalize">· {s.proficiency_level}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <MomentEngagement updateId={data.id} />

            {canEdit && (
              <div className="flex flex-wrap gap-2 justify-end border-t pt-3">
                {!editMode && (
                  <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit draft
                  </Button>
                )}
                <Button size="sm" onClick={handlePublish} disabled={publishing || saving}>
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5 mr-1.5" /> Post to parents
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>

    {lightboxIndex !== null && media[lightboxIndex] && createPortal(
      <div
        className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center pointer-events-auto"
        style={{ pointerEvents: "auto" }}
        onClick={() => setLightboxIndex(null)}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
          className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          aria-label="Close"
        >
          <XIcon className="h-5 w-5" />
        </button>
        <a
          href={media[lightboxIndex].url}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 right-16 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          aria-label="Download"
        >
          <Download className="h-5 w-5" />
        </a>
        {lightboxIndex > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {lightboxIndex < media.length - 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        <div
          className="max-w-[95vw] max-h-[90vh] flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {media[lightboxIndex].kind === "video" ? (
            <video src={media[lightboxIndex].url} poster={media[lightboxIndex].thumbnail_url ?? undefined} controls playsInline className="max-w-full max-h-[90vh]" />
          ) : (
            <img src={media[lightboxIndex].url} alt="" className="max-w-full max-h-[90vh] object-contain" />
          )}
        </div>
        <div className="absolute bottom-4 left-0 right-0 text-center text-white/80 text-xs">
          {lightboxIndex + 1} / {media.length}
        </div>
        {/* Preload neighbors to remove the "lag" when sliding */}
        <div className="hidden">
          {lightboxIndex > 0 && media[lightboxIndex - 1]?.kind !== "video" && (
            <img src={media[lightboxIndex - 1].url} alt="" />
          )}
          {lightboxIndex < media.length - 1 && media[lightboxIndex + 1]?.kind !== "video" && (
            <img src={media[lightboxIndex + 1].url} alt="" />
          )}
        </div>
      </div>,
      document.body
    )}

    <ConfirmDeleteDialog
      open={confirmDelete}
      onOpenChange={setConfirmDelete}
      title="Delete this Moment?"
      description="This will permanently remove the photo, caption, reactions, and comments. This cannot be undone."
      confirmLabel="Delete Moment"
      confirmText={studentNames || "Moment"}
      affectedItems={["Photos & videos", "Reactions", "Comments"]}
      onConfirm={handleDelete}
      isPending={deleting}
    />
    </>
  );
}