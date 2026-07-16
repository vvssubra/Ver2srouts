import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Camera, X, Plus, Check, ChevronsUpDown, Star, Eye, Users, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { friendlyError } from "@/lib/error-messages";
import { useQueryClient } from "@tanstack/react-query";
import { DOMAIN_INDICATORS } from "@/lib/kspk-indicators";
import { sendParentEmailForStudent } from "@/lib/parent-email";
import { notifyUsers } from "@/lib/notify";
import { buildAppUrl } from "@/lib/app-url";
import { useChildNextFocus } from "@/hooks/use-child-next-focus";
import { buildVideoThumbnailPath, createVideoThumbnailFile } from "@/lib/media/video-thumbnail";
import {
  MIN_VIDEO_SECONDS,
  MIN_OBSERVATION_CHARS,
  probeVideoDuration,
  buildChecklist,
  blockingFailures,
} from "@/lib/learning-journey/validation";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface ClassRow { id: string; class_name: string }
interface StudentRow { id: string; first_name: string; last_name: string; class_id: string | null }
interface AlbumRow { id: string; title: string; is_personal?: boolean; student_id?: string | null }
interface DomainRow { id: string; name: string; code?: string | null }
interface IndicatorRow { id: string; domain_id: string; indicator_code: string; indicator_text: string; age_group: number }
interface TimetableSubject { subject_name: string; slot_id: string }
interface SkillTag {
  domain_id: string;
  domain_name: string;
  indicator_id: string | null;
  indicator_label: string;
  proficiency_level: "not_yet" | "emerging" | "developing" | "secure";
  ai_suggested?: boolean;
  // Batch 6B-4 — persistent Objective Catalogue mapping. Populated when
  // the teacher picks a catalogue indicator from the typeahead; cleared
  // when the teacher edits the label/domain manually or picks a legacy
  // observation indicator (custom skill / legacy still work).
  curriculum_objective_id?: string | null;
  curriculum_indicator_id?: string | null;
}
interface PerChildOverride {
  proficiency_level: "not_yet" | "emerging" | "developing" | "secure";
  milestone_flag: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  initialAlbumId?: string | null;
  initialStudentId?: string | null;
  initialClassId?: string | null;
}

export function NewUpdateSheet({ open, onOpenChange, onCreated, initialAlbumId, initialStudentId, initialClassId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { selectedBranchId, activeBranchIds } = useGlobalBranch();
  const branchId =
    selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : activeBranchIds[0] ?? "";
  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [albums, setAlbums] = useState<AlbumRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  // Batch 6B-3 — Objective Catalogue indicators (additive, surfaced first when
  // a domain is picked). Each row already carries the parent-objective title
  // so the teacher sees the objective context inline.
  const [catalogueIndicators, setCatalogueIndicators] = useState<
    Array<{ id: string; domain_id: string; objective_id: string; indicator_label: string; teacher_title: string }>
  >([]);
  const [timetableSubjects, setTimetableSubjects] = useState<TimetableSubject[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  // Suggestion bank for skill indicator typeahead — built from prior tags in the same branch.
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);

  const [classId, setClassId] = useState<string>("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [activityDate, setActivityDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedMedia, setUploadedMedia] = useState<{ url: string; kind: "photo" | "video"; thumbnailUrl?: string | null }[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  // Map from File reference -> probed duration in seconds (0 for non-video / failed probe).
  const [videoDurations, setVideoDurations] = useState<Map<File, number>>(new Map());

  const [parentSummary, setParentSummary] = useState("");
  const [learningStory, setLearningStory] = useState("");
  const [domainId, setDomainId] = useState<string>("");
  const [proficiency, setProficiency] = useState<string>("");
  const [albumId, setAlbumId] = useState<string>("");
  const [subjectName, setSubjectName] = useState<string>("");
  const [milestoneFlag, setMilestoneFlag] = useState(false);
  const [pinPortfolio, setPinPortfolio] = useState(false);
  const [aiSuggestedMilestone, setAiSuggestedMilestone] = useState(false);
  const [shareWithParents, setShareWithParents] = useState(true);
  // Part A — not every parent update is a progress observation. Teachers can
  // toggle this OFF for general activity photos / announcements; in that
  // case skill tagging is optional and the Progress Wheel is NOT updated.
  const [tracksProgress, setTracksProgress] = useState(true);
  // Part A (6F-C) — optional link to current-week Next Focus for the selected child.
  // Only meaningful when exactly one child is selected AND tracksProgress is ON.
  const [linkToFocus, setLinkToFocus] = useState(true);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState("");
  // Multi-skill tagging — teacher captures every developmental skill seen in
  // this Moment so we don't have to ask them to fill a separate Observation form.
  const [skills, setSkills] = useState<SkillTag[]>([]);
  const [skillDraftDomain, setSkillDraftDomain] = useState<string>("");
  const [skillDraftIndicator, setSkillDraftIndicator] = useState<string>("");
  const [skillDraftIndicatorId, setSkillDraftIndicatorId] = useState<string | null>(null);
  // Batch 6B-4 — draft catalogue mapping for the in-progress skill tag.
  const [skillDraftCatalogueObjectiveId, setSkillDraftCatalogueObjectiveId] = useState<string | null>(null);
  const [skillDraftCatalogueIndicatorId, setSkillDraftCatalogueIndicatorId] = useState<string | null>(null);
  const [skillDraftLevel, setSkillDraftLevel] = useState<SkillTag["proficiency_level"]>("developing");

  // Friendly, parent-safe labels for the 4-level proficiency vocab.
  // DB stores the snake_case key (see migration extending the check constraint).
  const LEVEL_OPTIONS: { value: SkillTag["proficiency_level"]; label: string; hint: string }[] = [
    { value: "not_yet",    label: "Not Yet",    hint: "Needs more support" },
    { value: "emerging",   label: "Emerging",   hint: "Starting to show" },
    { value: "developing", label: "Developing", hint: "Showing with support" },
    { value: "secure",     label: "Secure",     hint: "Showing confidently" },
  ];
  const [bulkMode, setBulkMode] = useState(false);
  const [perChild, setPerChild] = useState<Record<string, PerChildOverride>>({});
  const [sourceTimetableSlotId, setSourceTimetableSlotId] = useState<string | null>(null);

  // Pre-fill album when launched from an album
  useEffect(() => {
    if (open && initialAlbumId) setAlbumId(initialAlbumId);
  }, [open, initialAlbumId]);

  // Pre-fill class + student when launched from a student profile
  useEffect(() => {
    if (open && initialClassId) setClassId(initialClassId);
  }, [open, initialClassId]);
  useEffect(() => {
    if (open && initialStudentId) setSelectedStudents([initialStudentId]);
  }, [open, initialStudentId]);

  const [tagging, setTagging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Load lookups when opened
  useEffect(() => {
    if (!open || !branchId) return;
    (async () => {
      const [c, a, d] = await Promise.all([
        supabase.from("classes").select("id, class_name").eq("branch_id", branchId).eq("is_active", true).order("class_name"),
        supabase.from("learning_albums").select("id, title, is_personal, student_id").eq("branch_id", branchId).eq("is_active", true).order("title"),
        supabase.from("development_domains").select("id, name, code").order("sort_order"),
      ]);
      // Teachers: restrict classes + albums to assigned classes only.
      let classRows = (c.data ?? []) as ClassRow[];
      let albumRows = (a.data ?? []) as AlbumRow[];
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        classRows = classRows.filter((cl) => teacherClassIds.includes(cl.id));
        // Get student IDs in teacher's classes to filter personal albums.
        const { data: stu } = await supabase
          .from("students")
          .select("id")
          .eq("branch_id", branchId)
          .in("class_id", teacherClassIds);
        const allowedStudents = new Set((stu ?? []).map((s: any) => s.id));
        albumRows = albumRows.filter((al) =>
          !al.is_personal || (al.student_id && allowedStudents.has(al.student_id))
        );
      }
      setClasses(classRows);
      setAlbums(albumRows);
      setDomains((d.data ?? []) as DomainRow[]);
    })();
  }, [open, branchId, isTeacher, teacherClassIds]);

  // Load observation indicators (the official competency matrix) once per open.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("observation_indicators")
        .select("id, domain_id, indicator_code, indicator_text, age_group")
        .order("indicator_code");
      setIndicators((data ?? []) as IndicatorRow[]);
    })();
  }, [open]);

  // Batch 6B-3 — load catalogue indicators (ages 2–6) once per open. Cheap
  // (~hundreds of rows) and additive; falls back silently if catalogue empty.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: objs } = await (supabase as any)
        .from("curriculum_objectives")
        .select("id, domain_id, teacher_title, is_active")
        .eq("is_active", true);
      const objRows = (objs ?? []) as Array<{ id: string; domain_id: string; teacher_title: string }>;
      if (!objRows.length) { setCatalogueIndicators([]); return; }
      const { data: inds } = await (supabase as any)
        .from("curriculum_objective_indicators")
        .select("id, objective_id, indicator_label, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      const byObj = new Map(objRows.map((o) => [o.id, o]));
      setCatalogueIndicators(((inds ?? []) as Array<{ id: string; objective_id: string; indicator_label: string }>)
        .map((row) => {
          const o = byObj.get(row.objective_id);
          if (!o) return null;
          return {
            id: row.id,
            domain_id: o.domain_id,
            objective_id: o.id,
            indicator_label: row.indicator_label,
            teacher_title: o.teacher_title,
          };
        })
        .filter(Boolean) as any);
    })();
  }, [open]);

  // Load recent skill indicator labels for typeahead (branch-scoped, last 200 distinct).
  useEffect(() => {
    if (!open || !branchId) return;
    (async () => {
      const { data } = await supabase
        .from("child_update_skills")
        .select("indicator_label, child_updates!inner(branch_id)")
        .eq("child_updates.branch_id", branchId)
        .limit(500);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.indicator_label && set.add(r.indicator_label));
      setSkillSuggestions(Array.from(set).sort());
    })();
  }, [open, branchId]);

  // Load students when class changes
  useEffect(() => {
    if (!classId || !branchId) {
      setStudents([]);
      setSubjects([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_id")
        .eq("branch_id", branchId)
        .eq("class_id", classId)
        .eq("is_active", true)
        .order("first_name");
      setStudents((data ?? []) as StudentRow[]);
    })();
    // Load subject suggestions from this class's timetable
    (async () => {
      const [w, d] = await Promise.all([
        supabase
          .from("timetable_slots")
          .select("id, subject_name, day_of_week")
          .eq("class_id", classId)
          .not("subject_name", "is", null),
        supabase
          .from("daily_timetable_slots")
          .select("id, subject_name, slot_date")
          .eq("class_id", classId)
          .eq("slot_date", activityDate)
          .not("subject_name", "is", null),
      ]);
      const set = new Set<string>();
      (w.data ?? []).forEach((r: any) => r.subject_name && set.add(r.subject_name));
      (d.data ?? []).forEach((r: any) => r.subject_name && set.add(r.subject_name));
      setSubjects(Array.from(set).sort());
      // Subjects taught on the chosen activity date — daily slots first, then weekly slots for matching weekday.
      const weekday = new Date(activityDate).getDay();
      const dayChips: TimetableSubject[] = [];
      const seen = new Set<string>();
      (d.data ?? []).forEach((r: any) => {
        if (r.subject_name && !seen.has(r.subject_name)) {
          dayChips.push({ subject_name: r.subject_name, slot_id: r.id });
          seen.add(r.subject_name);
        }
      });
      (w.data ?? []).forEach((r: any) => {
        if (r.subject_name && r.day_of_week === weekday && !seen.has(r.subject_name)) {
          dayChips.push({ subject_name: r.subject_name, slot_id: r.id });
          seen.add(r.subject_name);
        }
      });
      setTimetableSubjects(dayChips);
    })();
  }, [classId, branchId, activityDate]);

  // Keep per-child overrides in sync with current selection. Default to the
  // group proficiency from the first tagged skill (or "developing").
  useEffect(() => {
    setPerChild((prev) => {
      const next: Record<string, PerChildOverride> = {};
      const groupLevel: PerChildOverride["proficiency_level"] =
        (skills[0]?.proficiency_level as PerChildOverride["proficiency_level"]) ?? "developing";
      selectedStudents.forEach((sid) => {
        next[sid] = prev[sid] ?? { proficiency_level: groupLevel, milestone_flag: milestoneFlag };
      });
      return next;
    });
    if (selectedStudents.length < 2) setBulkMode(false);
  }, [selectedStudents, skills, milestoneFlag]);

  // Build local previews
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const reset = () => {
    setClassId("");
    setSelectedStudents([]);
    setActivityDate(new Date().toISOString().slice(0, 10));
    setCaption("");
    setFiles([]);
    setUploadedMedia([]);
    setParentSummary("");
    setLearningStory("");
    setDomainId("");
    setProficiency("");
    setAlbumId("");
    setSubjectName("");
    setMilestoneFlag(false);
    setPinPortfolio(false);
    setAiSuggestedMilestone(false);
    setShareWithParents(true);
    setTracksProgress(true);
    setCreatingAlbum(false);
    setNewAlbumTitle("");
    setSkills([]);
    setSkillDraftDomain("");
    setSkillDraftIndicator("");
    setSkillDraftIndicatorId(null);
    setSkillDraftCatalogueObjectiveId(null);
    setSkillDraftCatalogueIndicatorId(null);
    setSkillDraftLevel("developing");
    setBulkMode(false);
    setPerChild({});
    setSourceTimetableSlotId(null);
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 10);
    setFiles(next);
    setUploadedMedia([]);
    // Probe any new video files in the background and warn if any are too short.
    const fresh = Array.from(list).filter((f) => f.type.startsWith("video"));
    fresh.forEach(async (f) => {
      const d = await probeVideoDuration(f);
      setVideoDurations((prev) => {
        const m = new Map(prev);
        m.set(f, d);
        return m;
      });
      if (d > 0 && d < MIN_VIDEO_SECONDS) {
        toast.warning(
          `Video is only ${Math.round(d)}s — capture at least ${MIN_VIDEO_SECONDS}s so the moment tells a learning story.`,
        );
      }
    });
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setUploadedMedia([]);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const uploadAll = async (): Promise<{ url: string; kind: "photo" | "video"; thumbnailUrl?: string | null }[]> => {
    if (!files.length || !user) return [];
    if (uploadedMedia.length === files.length) return uploadedMedia;
    const out: { url: string; kind: "photo" | "video"; thumbnailUrl?: string | null }[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop() || "bin";
      const path = `${branchId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("learning-media").upload(path, f, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("learning-media").getPublicUrl(path);
      const kind: "photo" | "video" = f.type.startsWith("video") ? "video" : "photo";
      let thumbnailUrl: string | null = null;
      if (kind === "video") {
        const thumbFile = await createVideoThumbnailFile(f);
        if (thumbFile) {
          const thumbPath = buildVideoThumbnailPath(path);
          const { error: thumbError } = await supabase.storage
            .from("learning-media")
            .upload(thumbPath, thumbFile, { upsert: false, contentType: "image/jpeg" });
          if (!thumbError) {
            const { data: thumbPub } = supabase.storage.from("learning-media").getPublicUrl(thumbPath);
            thumbnailUrl = thumbPub.publicUrl;
          }
        }
      }
      out.push({ url: pub.publicUrl, kind, thumbnailUrl });
    }
    setUploadedMedia(out);
    return out;
  };

  const runAutoTag = async (mediaUrls: string[], hadVideo = false) => {
    setTagging(true);
    try {
      const className = classes.find((c) => c.id === classId)?.class_name ?? null;
      if (mediaUrls.length === 0 && hadVideo && !caption.trim()) {
        toast.error("Add a short note about the video so AI can write the story.");
        setTagging(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("auto-tag-update", {
        body: {
          caption,
          photo_urls: mediaUrls.slice(0, 4),
          class_name: className,
        },
      });
      if (error) throw error;
      if (data?.parent_summary) setParentSummary(data.parent_summary);
      if (data?.learning_story) setLearningStory(data.learning_story);
      if (data?.domain_id) setDomainId(data.domain_id);
      if (data?.proficiency_level) setProficiency(data.proficiency_level);
      if (data?.milestone_flag) {
        setMilestoneFlag(true);
        setPinPortfolio(true);
        setAiSuggestedMilestone(true);
      }
      // If AI suggested a domain + indicator, seed it into the skills tray so the
      // teacher can confirm with one tap instead of retyping.
      if (data?.domain_id && data?.suggested_indicator_label) {
        const domain = domains.find((d) => d.id === data.domain_id);
        // Map AI's legacy "consistent" to the new "secure" label; otherwise
        // accept any of the 4 supported levels, fall back to "developing".
        const raw = data?.proficiency_level;
        const lvl: SkillTag["proficiency_level"] =
          raw === "consistent" ? "secure"
          : (raw === "not_yet" || raw === "emerging" || raw === "developing" || raw === "secure")
            ? raw
            : "developing";
        if (domain) {
          // Batch 6B-4 — try to match AI-suggested label to an existing
          // catalogue indicator in the same domain so the AI shortcut also
          // produces persistent mapping.
          const catMatch = catalogueIndicators.find(
            (ci) =>
              ci.domain_id === domain.id &&
              ci.indicator_label.toLowerCase() === String(data.suggested_indicator_label).toLowerCase(),
          );
          setSkills((prev) => {
            const exists = prev.some(
              (s) => s.domain_id === domain.id && s.indicator_label === data.suggested_indicator_label,
            );
            return exists
              ? prev
              : [
                  ...prev,
                  {
                    domain_id: domain.id,
                    domain_name: domain.name,
                    indicator_id: data.suggested_indicator_id ?? null,
                    indicator_label: data.suggested_indicator_label,
                    proficiency_level: lvl,
                    ai_suggested: true,
                    curriculum_objective_id: catMatch?.objective_id ?? null,
                    curriculum_indicator_id: catMatch?.id ?? null,
                  },
                ];
          });
        }
      }
      // suggested_album_title -> try to match an existing album by title (case-insensitive)
      const suggestedTitle = (data?.suggested_album_title ?? "").trim().toLowerCase();
      if (suggestedTitle) {
        const match = albums.find((a) => a.title.toLowerCase() === suggestedTitle);
        if (match) setAlbumId(match.id);
      }
    } catch (e) {
      console.error("auto-tag failed", e);
      toast.error("AI tagging failed — you can still save the update.");
    } finally {
      setTagging(false);
    }
  };

  const createAlbumInline = async () => {
    if (!newAlbumTitle.trim() || !branchId || !user) return;
    try {
      const { data, error } = await supabase
        .from("learning_albums")
        .insert({
          branch_id: branchId,
          title: newAlbumTitle.trim(),
          created_by: user.id,
          is_active: true,
        })
        .select("id, title")
        .single();
      if (error) throw error;
      setAlbums((prev) => [...prev, data as AlbumRow].sort((a, b) => a.title.localeCompare(b.title)));
      setAlbumId(data.id);
      setNewAlbumTitle("");
      setCreatingAlbum(false);
      toast.success("Album created");
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  };

  const save = async (share: boolean) => {
    if (submittingRef.current) return;
    if (!user || !branchId) return;
    if (!classId && selectedStudents.length === 0) {
      toast.error("Pick a class or at least one child.");
      return;
    }
    if (!caption.trim() && files.length === 0) {
      toast.error("Add a photo or a short note.");
      return;
    }

    // Pre-publish quality checklist — only enforced when actually sharing
    // with parents. Drafts can be saved at any stage.
    if (share) {
      const shortVideos = files.filter((f) => {
        if (!f.type.startsWith("video")) return false;
        const d = videoDurations.get(f) ?? 0;
        return d > 0 && d < MIN_VIDEO_SECONDS;
      }).length;
      const items = buildChecklist({
        share,
        tracksProgress,
        parentSummary,
        caption,
        skillCount: skills.length,
        hasDomainTagged: skills.some((s) => !!s.domain_id) || !!domainId,
        hasMedia: files.length > 0 || uploadedMedia.length > 0,
        shortVideoCount: shortVideos,
      });
      const blockers = blockingFailures(items);
      if (blockers.length > 0) {
        const summary =
          blockers.length === 1
            ? blockers[0].hint || `Cannot post yet: ${blockers[0].label}`
            : `Cannot post yet — please fix: ${blockers
                .map((b) => b.label)
                .join("; ")}`;
        toast.error(summary, {
          description:
            "See the pre-publish checklist below. You can still 'Save draft' and post later.",
          duration: 6000,
        });
        return;
      }
    }

    // Guard: sharing a *progress-tracking* update requires at least one skill
    // tag. General activity updates and drafts can be shared without skills.
    if (share && tracksProgress && skills.length === 0) {
      toast.error(
        "Please tag at least one observed skill, or turn off 'Tracks child progress' to share as a general activity update.",
      );
      return;
    }

    // Guardrails: reject invalid skill rows (defensive — UI already gates).
    const validLevels = new Set(["not_yet", "emerging", "developing", "secure"]);
    const cleanedSkills = (tracksProgress ? skills : []).filter(
      (s) =>
        s.domain_id &&
        s.indicator_label &&
        s.indicator_label.trim().length > 0 &&
        validLevels.has(s.proficiency_level),
    );
    // Dedupe per (domain_id, indicator_id || normalized label) — prevents
    // duplicate progress credit on the same Moment.
    const dedupedSkills: SkillTag[] = [];
    const seen = new Set<string>();
    for (const s of cleanedSkills) {
      const key = `${s.domain_id}::${s.indicator_id ?? s.indicator_label.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedSkills.push(s);
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const uploaded = uploadedMedia.length > 0 ? uploadedMedia : await uploadAll();

      const isGroup = selectedStudents.length !== 1;
      // For a single-child story, default the album to that child's personal album
      // so it appears under their album automatically.
      let resolvedAlbumId: string | null = albumId || null;
      if (!resolvedAlbumId && !isGroup && selectedStudents[0]) {
        const personal = albums.find((a) => a.is_personal && a.student_id === selectedStudents[0]);
        if (personal) resolvedAlbumId = personal.id;
      }
      const { data: row, error } = await supabase
        .from("child_updates")
        .insert({
          branch_id: branchId,
          class_id: classId || null,
          student_id: isGroup ? null : selectedStudents[0],
          activity_date: activityDate,
          created_by: user.id,
          caption: caption || null,
          parent_summary: parentSummary || null,
          ai_learning_story: learningStory || null,
          domain_id: domainId || null,
          proficiency_level: proficiency || null,
          album_id: resolvedAlbumId,
          subject_name: subjectName || null,
          source_timetable_slot_id: sourceTimetableSlotId,
          visible_to_parent: share,
          milestone_flag: milestoneFlag,
          portfolio_candidate: milestoneFlag || pinPortfolio,
          status: share ? "shared" : "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      const updateId = row.id as string;

      if (isGroup && selectedStudents.length) {
        const { error: linkErr } = await supabase
          .from("child_update_students")
          .insert(selectedStudents.map((sid) => ({ update_id: updateId, student_id: sid })));
        if (linkErr) throw linkErr;
      }

      // Persist every skill the teacher tagged on this Moment. This is the
      // single record that powers the parent's "Skills observed" section AND
      // the Progress by area chart, so teachers don't need to record a
      // separate Observation form for the same activity.
      let firstSkillId: string | null = null;
      if (dedupedSkills.length) {
        const { data: insertedSkills, error: skillsErr } = await supabase
          .from("child_update_skills")
          .insert(
            dedupedSkills.map((s) => ({
              update_id: updateId,
              domain_id: s.domain_id,
              indicator_id: s.indicator_id,
              indicator_label: s.indicator_label,
              proficiency_level: s.proficiency_level,
              curriculum_objective_id: s.curriculum_objective_id ?? null,
              curriculum_indicator_id: s.curriculum_indicator_id ?? null,
            })),
          )
          .select("id");
        if (skillsErr) throw skillsErr;
        firstSkillId = (insertedSkills?.[0] as any)?.id ?? null;

        // Batch 6D — Progress Engine Lite.
        // For every linked child × tagged skill, upsert child_skill_progress
        // via the security-definer RPC. Forward-only, idempotent on
        // (update_id, skill_id). Only runs when the teacher chose to track
        // progress for this Moment AND shared it with parents.
        if (tracksProgress && share && selectedStudents.length) {
          const skillIdByKey = new Map<string, string>();
          (insertedSkills ?? []).forEach((row: any, i: number) => {
            const s = dedupedSkills[i];
            if (!s) return;
            const key = `${s.domain_id}::${s.indicator_id ?? s.indicator_label.trim().toLowerCase()}`;
            skillIdByKey.set(key, row.id);
          });
          const progressCalls: Promise<any>[] = [];
          for (const sid of selectedStudents) {
            for (const s of dedupedSkills) {
              const key = `${s.domain_id}::${s.indicator_id ?? s.indicator_label.trim().toLowerCase()}`;
              const skillRowId = skillIdByKey.get(key) ?? firstSkillId;
              // Per-child proficiency override (set when bulkMode is on); fall
              // back to the group level the teacher chose for this skill.
              const lvl = (perChild[sid]?.proficiency_level as string) ?? s.proficiency_level;
              progressCalls.push(
                Promise.resolve(
                  (supabase.rpc as any)("record_child_skill_progress", {
                    p_student_id: sid,
                    p_update_id: updateId,
                    p_skill_id: skillRowId,
                    p_domain_id: s.domain_id,
                    p_indicator_id: s.indicator_id,
                    p_indicator_label: s.indicator_label,
                    p_proficiency_level: lvl,
                    p_curriculum_objective_id: s.curriculum_objective_id ?? null,
                    p_curriculum_indicator_id: s.curriculum_indicator_id ?? null,
                  }),
                ),
              );
            }
          }
          const results = await Promise.allSettled(progressCalls);
          const failed = results.filter((r) => r.status === "rejected");
          if (failed.length) {
            console.warn("[progress-engine] some upserts failed", failed);
          }
        }
      }

      // Insert media AFTER skills so we can relationally link each photo to a
      // tagged skill (default: link every media to the first tagged skill so
      // the Progress drill-down can show real evidence per domain).
      if (uploaded.length) {
        await supabase.from("child_update_media").insert(
          uploaded.map((u, i) => ({
            update_id: updateId,
            url: u.url,
            kind: u.kind,
            thumbnail_url: u.thumbnailUrl ?? null,
            sort_order: i,
            update_skill_id: firstSkillId,
          })),
        );
      }

      // Part A (6F-C) — Link this Moment to the child's current Next Focus
      // if the teacher kept the toggle ON. Single-child Moments only.
      if (
        share &&
        tracksProgress &&
        linkToFocus &&
        !isGroup &&
        selectedStudents[0] &&
        dedupedSkills.length > 0
      ) {
        try {
          const sid = selectedStudents[0];
          const week = (() => {
            const x = new Date();
            x.setHours(0, 0, 0, 0);
            const day = x.getDay() || 7;
            x.setDate(x.getDate() - (day - 1));
            return x.toISOString().slice(0, 10);
          })();
          const { data: focusRow } = await (supabase as any)
            .from("child_next_focus")
            .select("id, status")
            .eq("student_id", sid)
            .eq("week_starting", week)
            .neq("status", "archived")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (focusRow?.id) {
            // Unique index on (focus_id, child_update_id) prevents duplicates.
            await (supabase as any)
              .from("child_next_focus_evidence")
              .upsert(
                {
                  focus_id: focusRow.id,
                  student_id: sid,
                  child_update_id: updateId,
                  child_update_skill_id: firstSkillId,
                },
                { onConflict: "focus_id,child_update_id" },
              );
          }
        } catch (linkErr) {
          console.warn("[next-focus-evidence] link failed", linkErr);
        }
      }

      toast.success(share ? "Shared with parents." : "Saved as draft.");

      // Part E — Progress write verification toast (replaces the generic
      // "Shared with parents." when this Moment actually wrote progress).
      if (share && tracksProgress && dedupedSkills.length > 0 && selectedStudents.length > 0) {
        const childCount = selectedStudents.length;
        toast.success(
          childCount === 1
            ? "Progress evidence saved."
            : `Progress evidence saved for ${childCount} children.`,
        );
      }
      // Dev-only diagnostic for admins to confirm write path. Never shown to parents.
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[progress-write]", {
          updateId,
          selectedStudentCount: selectedStudents.length,
          skillCount: dedupedSkills.length,
          insertedSkillRows: dedupedSkills.length, // matches insert payload size on success
          rpcCallCount: tracksProgress && share ? selectedStudents.length * dedupedSkills.length : 0,
        });
      }

      // Parent fan-out — only when teacher chose to share with parents.
      // Notifications (bell) + learning-story-ready email. Best-effort.
      if (share) {
        try {
          const targetStudentIds = isGroup ? selectedStudents : [selectedStudents[0]];
          const previewText =
            (parentSummary || learningStory || caption || "").slice(0, 220) || undefined;
          const storyTitle = caption || "New learning moment";
          // Bell notifications: one per parent per student
          const { data: parentLinks } = await supabase
            .from("parent_students")
            .select("parent_id, student_id, students(first_name)")
            .in("student_id", targetStudentIds)
            .eq("status", "approved");
          const parentMap = new Map<string, string[]>(); // parentId -> child names
          (parentLinks ?? []).forEach((pl: any) => {
            const name = pl.students?.first_name || "your child";
            const arr = parentMap.get(pl.parent_id) ?? [];
            arr.push(name);
            parentMap.set(pl.parent_id, arr);
          });
          for (const [parentId, childNames] of parentMap.entries()) {
            const childLabel = Array.from(new Set(childNames)).join(", ");
            // Pick a representative student so deep links + grouping target a
            // single child (NewUpdateSheet allows multi-student fan-out).
            const repStudentId =
              (parentLinks ?? []).find((pl: any) => pl.parent_id === parentId)?.student_id ??
              targetStudentIds[0];
            await notifyUsers(
              [parentId],
              `New learning update for ${childLabel}`,
              `A new learning moment has been shared for ${childLabel}.`,
              "learning_journey",
              updateId,
              "/journey",
              `journey:${repStudentId}`,
              "normal",
            ).catch(() => {});
          }
          // Email — one per (student × parent), idempotent on update id
          for (const sid of targetStudentIds) {
            const child = students.find((s) => s.id === sid);
            const childName = child?.first_name || undefined;
            sendParentEmailForStudent(
              sid,
              "learning-story-ready",
              (r) => ({
                parentName: r.first_name || undefined,
                childName,
                storyTitle,
                previewText,
                hasMedia: uploaded.length > 0,
                storyUrl: buildAppUrl("/journey"),
                ctaLabel: "Open Learning Journey",
              }),
              `moment-${updateId}-${sid}`,
            );
          }
        } catch (notifyErr) {
          console.warn("[learning-story] parent fan-out failed", notifyErr);
        }
      }

      // Invalidate every surface that displays child_updates so the new
      // entry appears immediately without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["daily-updates"] });
      queryClient.invalidateQueries({ queryKey: ["timeline-child-updates"] });
      queryClient.invalidateQueries({ queryKey: ["timeline-journey"] });
      queryClient.invalidateQueries({ queryKey: ["child-story-feed"] });
      queryClient.invalidateQueries({ queryKey: ["moments-feed"] });
      queryClient.invalidateQueries({ queryKey: ["update-skills"] });
      queryClient.invalidateQueries({ queryKey: ["student-observation-evidence"] });
      queryClient.invalidateQueries({ queryKey: ["progress-radar"] });
      // Parent Progress Wheel data (ParentChildView.tsx) — refresh so the
      // numerator increases immediately after a parent-shared Moment.
      queryClient.invalidateQueries({ queryKey: ["child-skill-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["child-skill-progress"] });
      queryClient.invalidateQueries({ queryKey: ["development-domains"] });
      queryClient.invalidateQueries({ queryKey: ["domain-outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["albums-manager"] });
      // Part F — force-refetch the parent Progress Wheel queries so the
      // teacher (and any parent already viewing the child page) sees the
      // numerator update without a manual reload.
      queryClient.refetchQueries({ queryKey: ["child-skill-assessments"] });
      queryClient.refetchQueries({ queryKey: ["child-skill-progress"] });
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      console.error(e);
      toast.error(friendlyError(e));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const canRunAi = useMemo(() => caption.trim().length > 0 || files.length > 0, [caption, files]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl sm:mx-auto sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>New learning story</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Who + when */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSelectedStudents([]); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">Children ({selectedStudents.length} selected)</Label>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto rounded-md border p-2">
                {students.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Pick a class first</span>
                ) : (
                  students.map((s) => (
                    <Badge
                      key={s.id}
                      variant={selectedStudents.includes(s.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleStudent(s.id)}
                    >
                      {s.first_name}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label className="text-xs">Photos / video</Label>
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-md border">
                  {files[i]?.type.startsWith("video") ? (
                    <video src={src} className="h-full w-full object-cover" />
                  ) : (
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    className="absolute top-0 right-0 rounded-bl bg-background/90 p-0.5"
                    onClick={() => removeFile(i)}
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
              {files.length < 10 && (
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted/40">
                  <Camera className="h-5 w-5" />
                  <input type="file" accept="image/*,video/*" multiple className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)} />
                </label>
              )}
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-1">
            <Label className="text-xs">What happened?</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Aiman painted a rainbow and named the colours…" />
          </div>

          {/* Timetable subjects taught on this date — one tap auto-tags subject + slot */}
          {timetableSubjects.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" /> Subjects on this day
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {timetableSubjects.map((t) => (
                  <Badge
                    key={t.slot_id}
                    variant={subjectName === t.subject_name ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      setSubjectName(t.subject_name);
                      setSourceTimetableSlotId(t.slot_id);
                    }}
                  >
                    {t.subject_name}
                  </Badge>
                ))}
                {sourceTimetableSlotId && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                    onClick={() => { setSourceTimetableSlotId(null); setSubjectName(""); }}
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bulk mode strip — only when 2+ children selected */}
          {selectedStudents.length >= 2 && (
            <div className="rounded-lg border bg-primary/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Bulk mode — personalise per child</p>
                    <p className="text-xs text-muted-foreground">
                      Same story & photos for {selectedStudents.length} children. Tap each child to set their proficiency or mark a milestone.
                    </p>
                  </div>
                </div>
                <Switch checked={bulkMode} onCheckedChange={setBulkMode} />
              </div>
              {bulkMode && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {selectedStudents.map((sid) => {
                    const stu = students.find((s) => s.id === sid);
                    const o = perChild[sid] ?? { proficiency_level: "developing", milestone_flag: false };
                    return (
                      <div key={sid} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5">
                        <span className="text-sm font-medium truncate flex-1">{stu?.first_name ?? "Child"}</span>
                        <Select
                          value={o.proficiency_level}
                          onValueChange={(v) => setPerChild((p) => ({ ...p, [sid]: { ...o, proficiency_level: v as PerChildOverride["proficiency_level"] } }))}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LEVEL_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          className="p-1 rounded-md hover:bg-muted"
                          title="Mark as milestone for this child"
                          onClick={() => setPerChild((p) => ({ ...p, [sid]: { ...o, milestone_flag: !o.milestone_flag } }))}
                        >
                          <Star className={cn("h-4 w-4", o.milestone_flag ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* AI assist */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                AI parent message
              </div>
              <Button
                size="sm"
                variant="default"
                className="gap-1"
                disabled={!canRunAi || tagging}
                onClick={async () => {
                  // Use any uploaded URLs we already have, otherwise upload now then tag
                  const existingUrls = previews; // local URLs are not visible to AI; upload first
                  if (files.length > 0) {
                    try {
                      const uploaded = await uploadAll();
                      setUploadedMedia(uploaded);
                      // AI gateway can only read images; videos are passed as a hint via caption.
                      const photoUrls = uploaded.filter((u) => u.kind === "photo").map((u) => u.url);
                      const hadVideo = uploaded.some((u) => u.kind === "video");
                      await runAutoTag(photoUrls, hadVideo);
                    } catch (e) {
                      console.error(e);
                      toast.error("Couldn't upload media for AI.");
                    }
                  } else {
                    await runAutoTag([]);
                  }
                }}
              >
                {tagging ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Writing…</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Auto-write</>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              {canRunAi
                ? "Tap Auto-write — AI drafts a parent-friendly summary based on your note and photos. You can edit it before posting."
                : "Add a short note or a photo above, then tap Auto-write to let AI draft the parent message."}
            </p>
            <Textarea
              value={parentSummary}
              onChange={(e) => setParentSummary(e.target.value)}
              placeholder="AI will draft a parent-friendly summary here."
              rows={3}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger><SelectValue placeholder="Development area (optional)" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Subject combobox — suggests timetable subjects, but teacher can type any custom subject. */}
              <Popover open={subjectOpen} onOpenChange={setSubjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn("truncate", !subjectName && "text-muted-foreground")}>
                      {subjectName || "Subject (optional)"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                  <Input
                    placeholder="Search or type new subject…"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="mb-2 h-9"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    <button
                      type="button"
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => { setSubjectName(""); setSubjectOpen(false); }}
                    >
                      <X className="h-3.5 w-3.5 mr-2 opacity-60" /> No subject
                    </button>
                    {subjects
                      .filter((s) => s.toLowerCase().includes(subjectName.trim().toLowerCase()))
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => { setSubjectName(s); setSubjectOpen(false); }}
                        >
                          <Check className={cn("h-4 w-4 mr-2", subjectName === s ? "opacity-100" : "opacity-0")} />
                          {s}
                        </button>
                      ))}
                    {subjectName.trim() && !subjects.includes(subjectName.trim()) && (
                      <button type="button" className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setSubjectOpen(false)}>
                        Use "{subjectName.trim()}"
                      </button>
                    )}
                    {!subjectName.trim() && subjects.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No suggestions yet.</p>}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {creatingAlbum ? (
                <div className="flex gap-1">
                  <Input
                    value={newAlbumTitle}
                    onChange={(e) => setNewAlbumTitle(e.target.value)}
                    placeholder="New album title"
                    autoFocus
                  />
                  <Button size="sm" onClick={createAlbumInline} disabled={!newAlbumTitle.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCreatingAlbum(false); setNewAlbumTitle(""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <Select value={albumId} onValueChange={setAlbumId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Album (optional)" /></SelectTrigger>
                    <SelectContent>
                      {albums.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => setCreatingAlbum(true)} title="New album">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {aiSuggestedMilestone ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                onClick={() => { setMilestoneFlag(true); setPinPortfolio(true); }}
              >
                <Sparkles className="h-3 w-3" /> AI detected a learning milestone
              </button>
            ) : null}
          </div>

          {/* Multi-skill tagger — replaces the separate Observations form */}
          <div className="rounded-lg border p-3 space-y-3">
            {/* Part B — clearer wrapper so teachers understand this section
                drives the child Progress engine. */}
            <div className="flex items-center justify-between gap-3 -mt-1">
              <div className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Child Progress Evidence</p>
                  <p className="text-xs text-muted-foreground">
                    Use this only when the update shows a skill or development progress.
                    Confirmed skills will update the child's Progress page.
                  </p>
                </div>
              </div>
              <Switch checked={tracksProgress} onCheckedChange={setTracksProgress} />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground -mt-1">
              <span className="font-medium text-foreground/80">Tracks child progress?</span>
              <span>{tracksProgress ? "On — review the skills below." : "Off — this will post as a general activity update."}</span>
            </div>
            {tracksProgress && (
            <>
            {/* Part A (6F-C) — Link to current Next Focus (single child only) */}
            <NextFocusLinkPanel
              studentId={selectedStudents.length === 1 ? selectedStudents[0] : null}
              enabled={linkToFocus}
              onToggle={setLinkToFocus}
            />
            {selectedStudents.length > 1 && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-foreground/85">
                <span className="font-medium text-primary">Group Moment:</span> This progress evidence
                will be applied to <span className="font-medium">all {selectedStudents.length} selected children</span>.
                Each child's Progress Wheel will update with the skills tagged below.
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Skills observed</p>
                <p className="text-xs text-muted-foreground">
                  Review and confirm the skills before sharing. AI suggestions can be edited — change the area, label, or level, or delete and add your own. At least one skill is required.
                </p>
              </div>
            </div>
            {skills.length > 0 && (
              <p className="text-xs font-medium text-primary">
                ✨ {skills.length} confirmed skill{skills.length === 1 ? "" : "s"} will update the child's progress.
              </p>
            )}
            {skills.length > 0 && (
              <ul className="space-y-1.5">
                {skills.map((s, i) => (
                  <EditableSkillRow
                    key={`${i}-${s.domain_id}-${s.indicator_label}`}
                    skill={s}
                    domains={domains}
                    levels={LEVEL_OPTIONS}
                    onChange={(patch) =>
                      setSkills((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
                      )
                    }
                    onDelete={() => setSkills((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              These confirmed skills update the child's progress.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
              <Select
                value={skillDraftDomain}
                onValueChange={(v) => {
                  setSkillDraftDomain(v);
                  // Changing the domain invalidates any catalogue/legacy
                  // mapping the teacher picked under the previous domain.
                  setSkillDraftIndicatorId(null);
                  setSkillDraftCatalogueObjectiveId(null);
                  setSkillDraftCatalogueIndicatorId(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Skill indicator typeahead — suggests previously used indicators while allowing free text. */}
              <Popover open={skillOpen} onOpenChange={setSkillOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className={cn("truncate", !skillDraftIndicator && "text-muted-foreground")}>
                      {skillDraftIndicator || "Skill (e.g. names primary colours)"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                  <Input
                    placeholder="Pick a curriculum indicator or type your own…"
                    value={skillDraftIndicator}
                    onChange={(e) => {
                      setSkillDraftIndicator(e.target.value);
                      // Manual edit drops every mapping — this is now a custom skill.
                      setSkillDraftIndicatorId(null);
                      setSkillDraftCatalogueObjectiveId(null);
                      setSkillDraftCatalogueIndicatorId(null);
                    }}
                    className="mb-2 h-9"
                  />
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {/* Batch 6B-3 — Objective Catalogue indicators (shown first when domain picked). */}
                    {skillDraftDomain && catalogueIndicators
                      .filter((ci) => ci.domain_id === skillDraftDomain)
                      .filter((ci) => {
                        const q = skillDraftIndicator.trim().toLowerCase();
                        if (!q) return true;
                        return ci.indicator_label.toLowerCase().includes(q) || ci.teacher_title.toLowerCase().includes(q);
                      })
                      .slice(0, 40)
                      .map((ci) => (
                        <button
                          key={`cat:${ci.id}`}
                          type="button"
                          className="flex w-full items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSkillDraftIndicator(ci.indicator_label);
                            // Batch 6B-4 — persist exact catalogue mapping. The legacy
                            // observation indicator FK stays NULL (catalogue ids live
                            // in their own columns).
                            setSkillDraftIndicatorId(null);
                            setSkillDraftCatalogueObjectiveId(ci.objective_id);
                            setSkillDraftCatalogueIndicatorId(ci.id);
                            setSkillOpen(false);
                          }}
                        >
                          <Check className={cn("h-4 w-4 mr-2 mt-0.5 shrink-0", skillDraftIndicator === ci.indicator_label ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary mr-1">Objective</span>
                            <span>{ci.indicator_label}</span>
                            <span className="block text-[11px] text-muted-foreground truncate">{ci.teacher_title}</span>
                          </span>
                        </button>
                      ))}
                    {/* Real curriculum indicators from observation_indicators */}
                    {skillDraftDomain && indicators
                      .filter((ind) => ind.domain_id === skillDraftDomain)
                      .filter((ind) => {
                        const q = skillDraftIndicator.trim().toLowerCase();
                        if (!q) return true;
                        return ind.indicator_text.toLowerCase().includes(q) || ind.indicator_code.toLowerCase().includes(q);
                      })
                      .slice(0, 80)
                      .map((ind) => (
                        <button
                          key={ind.id}
                          type="button"
                          className="flex w-full items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSkillDraftIndicator(ind.indicator_text);
                            setSkillDraftIndicatorId(ind.id);
                            // Legacy observation indicator selected — clear catalogue mapping.
                            setSkillDraftCatalogueObjectiveId(null);
                            setSkillDraftCatalogueIndicatorId(null);
                            setSkillOpen(false);
                          }}
                        >
                          <Check className={cn("h-4 w-4 mr-2 mt-0.5 shrink-0", skillDraftIndicatorId === ind.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1">
                            <span className="text-[10px] font-semibold text-muted-foreground mr-1">{ind.indicator_code}</span>
                            <span>{ind.indicator_text}</span>
                          </span>
                        </button>
                      ))}
                    {skillDraftDomain && indicators.filter((i) => i.domain_id === skillDraftDomain).length === 0 && (() => {
                      const code = domains.find((d) => d.id === skillDraftDomain)?.code ?? "";
                      const suggestions = code ? (DOMAIN_INDICATORS[code] ?? []) : [];
                      if (suggestions.length === 0) {
                        return <p className="px-2 py-2 text-xs text-muted-foreground">No curriculum indicators yet for this area. Type a custom skill below.</p>;
                      }
                      const q = skillDraftIndicator.trim().toLowerCase();
                      return (
                        <>
                          <p className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Common skills in this area</p>
                          {suggestions
                            .filter((s) => !q || s.toLowerCase().includes(q))
                            .map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="flex w-full items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setSkillDraftIndicator(s);
                                setSkillDraftIndicatorId(null);
                                setSkillDraftCatalogueObjectiveId(null);
                                setSkillDraftCatalogueIndicatorId(null);
                                setSkillOpen(false);
                              }}
                              >
                                <Check className={cn("h-4 w-4 mr-2 mt-0.5 shrink-0", skillDraftIndicator === s ? "opacity-100" : "opacity-0")} />
                                <span className="flex-1">{s}</span>
                              </button>
                            ))}
                        </>
                      );
                    })()}
                    {!skillDraftDomain && (
                      <p className="px-2 py-2 text-xs text-muted-foreground">Pick a development area to see curriculum indicators.</p>
                    )}
                    {/* Recently used free-text suggestions */}
                    {skillSuggestions
                      .filter((s) => s.toLowerCase().includes(skillDraftIndicator.trim().toLowerCase()))
                      .slice(0, 20)
                      .map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSkillDraftIndicator(s);
                            setSkillDraftIndicatorId(null);
                            setSkillDraftCatalogueObjectiveId(null);
                            setSkillDraftCatalogueIndicatorId(null);
                            setSkillOpen(false);
                          }}
                        >
                          <Check className={cn("h-4 w-4 mr-2", skillDraftIndicator === s ? "opacity-100" : "opacity-0")} />
                          <span className="truncate text-muted-foreground">{s}</span>
                        </button>
                      ))}
                    {skillDraftIndicator.trim() && !skillSuggestions.includes(skillDraftIndicator.trim()) && (
                      <button
                        type="button"
                        className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSkillDraftIndicatorId(null);
                          setSkillDraftCatalogueObjectiveId(null);
                          setSkillDraftCatalogueIndicatorId(null);
                          setSkillOpen(false);
                        }}
                      >
                        Use custom: "{skillDraftIndicator.trim()}"
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={skillDraftLevel} onValueChange={(v) => setSkillDraftLevel(v as SkillTag["proficiency_level"]) }>
                <SelectTrigger className="min-w-[8.5rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-medium">{o.label}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">{o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!skillDraftDomain || !skillDraftIndicator.trim()}
                onClick={() => {
                  const domain = domains.find((d) => d.id === skillDraftDomain);
                  if (!domain) return;
                  setSkills((prev) => [
                    ...prev,
                    {
                      domain_id: domain.id,
                      domain_name: domain.name,
                      indicator_id: skillDraftIndicatorId,
                      indicator_label: skillDraftIndicator.trim(),
                      proficiency_level: skillDraftLevel,
                      curriculum_objective_id: skillDraftCatalogueObjectiveId,
                      curriculum_indicator_id: skillDraftCatalogueIndicatorId,
                    },
                  ]);
                  setSkillDraftIndicator("");
                  setSkillDraftIndicatorId(null);
                  setSkillDraftCatalogueObjectiveId(null);
                  setSkillDraftCatalogueIndicatorId(null);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            </>
            )}
          </div>

          {/* Visibility & learning journal */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Star className={cn("h-4 w-4 mt-0.5", milestoneFlag ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">Learning milestone</p>
                  <p className="text-xs text-muted-foreground">Adds this story to the child's portfolio and PTM booklet.</p>
                </div>
              </div>
              <Switch
                checked={milestoneFlag}
                onCheckedChange={(v) => {
                  setMilestoneFlag(v);
                  if (v) setPinPortfolio(true); // milestones imply portfolio
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Eye className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                <p className="text-sm font-medium">Share with parents</p>
                <p className="text-xs text-muted-foreground">Parents will see this Moment in their app and can react.</p>
                </div>
              </div>
              <Switch checked={shareWithParents} onCheckedChange={setShareWithParents} />
            </div>
          </div>

          {/* Actions */}
          <PrePublishChecklist
            share={shareWithParents}
            tracksProgress={tracksProgress}
            parentSummary={parentSummary}
            caption={caption}
            skillCount={skills.length}
            hasDomainTagged={skills.some((s) => !!s.domain_id) || !!domainId}
            hasMedia={files.length > 0 || uploadedMedia.length > 0}
            shortVideoCount={files.filter((f) => {
              if (!f.type.startsWith("video")) return false;
              const d = videoDurations.get(f) ?? 0;
              return d > 0 && d < MIN_VIDEO_SECONDS;
            }).length}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={submitting} onClick={() => save(false)}>Save draft</Button>
            {(() => {
              const shortVideos = files.filter((f) => {
                if (!f.type.startsWith("video")) return false;
                const d = videoDurations.get(f) ?? 0;
                return d > 0 && d < MIN_VIDEO_SECONDS;
              }).length;
              const blockers = shareWithParents
                ? blockingFailures(
                    buildChecklist({
                      share: shareWithParents,
                      tracksProgress,
                      parentSummary,
                      caption,
                      skillCount: skills.length,
                      hasDomainTagged: skills.some((s) => !!s.domain_id) || !!domainId,
                      hasMedia: files.length > 0 || uploadedMedia.length > 0,
                      shortVideoCount: shortVideos,
                    }),
                  )
                : [];
              const blocked = blockers.length > 0;
              return (
                <Button
                  disabled={submitting || blocked}
                  onClick={() => save(shareWithParents)}
                  title={
                    blocked
                      ? `Cannot post yet: ${blockers.map((b) => b.label).join("; ")}`
                      : undefined
                  }
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : shareWithParents ? (
                    blocked ? `Post blocked — ${blockers.length} item${blockers.length > 1 ? "s" : ""} to fix` : "Post story"
                  ) : (
                    "Save internal story"
                  )}
                </Button>
              );
            })()}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Inline-editable row for one tagged skill — Part C of Batch 6F-B-2. */
function EditableSkillRow({
  skill,
  domains,
  levels,
  onChange,
  onDelete,
}: {
  skill: SkillTag;
  domains: DomainRow[];
  levels: { value: SkillTag["proficiency_level"]; label: string; hint: string }[];
  onChange: (patch: Partial<SkillTag>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState<boolean>(!!skill.ai_suggested);
  const isCustom = !skill.indicator_id;
  return (
    <li className="rounded-md border bg-background p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {skill.ai_suggested && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Sparkles className="h-3 w-3 text-primary" /> AI suggested
          </Badge>
        )}
        {isCustom && (
          <Badge variant="outline" className="text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-300">
            Custom skill
          </Badge>
        )}
        {!editing && (
          <>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
              {skill.domain_name}
            </span>
            <span className="text-sm">·</span>
            <span className="text-sm font-medium">{skill.indicator_label}</span>
            <span className="text-[10px] capitalize text-muted-foreground">
              · {skill.proficiency_level.replace("_", " ")}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Delete skill"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1.4fr_auto]">
          <Select
            value={skill.domain_id}
            onValueChange={(v) => {
              const d = domains.find((x) => x.id === v);
              if (!d) return;
              // Domain change invalidates the AI's official indicator mapping —
              // drop indicator_id so the row is saved as a custom skill if the
              // teacher doesn't pick a new official indicator.
              onChange({ domain_id: d.id, domain_name: d.name, indicator_id: null });
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            className="h-8 text-xs"
            value={skill.indicator_label}
            onChange={(e) => onChange({ indicator_label: e.target.value, indicator_id: null })}
            placeholder="Skill label"
          />
          <Select
            value={skill.proficiency_level}
            onValueChange={(v) => onChange({ proficiency_level: v as SkillTag["proficiency_level"] })}
          >
            <SelectTrigger className="h-8 text-xs min-w-[8.5rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {levels.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </li>
  );
}

/**
 * Part A (6F-C) — Optional "Link to current Next Focus" panel.
 * Only renders for single-child Moments. Defaults ON when an active
 * suggested/teacher_reviewed/approved focus exists.
 */
function NextFocusLinkPanel({
  studentId,
  enabled,
  onToggle,
}: {
  studentId: string | null;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { data: focus } = useChildNextFocus(studentId ?? undefined);
  if (!studentId || !focus) return null;
  if (focus.status === "archived") return null;
  const statusLabel =
    focus.status === "approved"
      ? focus.visible_to_parent ? "Approved · Parent visible" : "Approved"
      : focus.status === "teacher_reviewed"
        ? "Reviewed"
        : "Suggested";
  return (
    <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Link to current Next Focus
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{focus.focus_title}</p>
        <Badge variant="secondary" className="text-[10px] shrink-0">{statusLabel}</Badge>
      </div>
      {focus.focus_description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2">{focus.focus_description}</p>
      )}
    </div>
  );
}

/**
 * Pre-publish quality checklist. Shows green ticks for satisfied items and
 * amber alerts for the ones still missing. Required items become blockers
 * when the teacher hits "Post story" (see save()).
 */
function PrePublishChecklist(props: {
  share: boolean;
  tracksProgress: boolean;
  parentSummary: string;
  caption: string;
  skillCount: number;
  hasDomainTagged: boolean;
  hasMedia: boolean;
  shortVideoCount: number;
}) {
  const items = buildChecklist(props);
  const failing = items.filter((i) => !i.ok);
  if (failing.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Ready to post — story meets quality checklist.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
      <p className="text-xs font-semibold flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
        Pre-publish checklist
      </p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-xs">
            {i.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle
                className={cn(
                  "h-3.5 w-3.5 mt-0.5 shrink-0",
                  i.required ? "text-destructive" : "text-amber-600",
                )}
              />
            )}
            <div className="flex-1">
              <span className={cn(i.ok ? "text-muted-foreground line-through" : "text-foreground")}>
                {i.label}
              </span>
              {!i.ok && i.required && (
                <span className="ml-1 text-[10px] uppercase font-semibold text-destructive">Required</span>
              )}
              {!i.ok && i.hint && (
                <p className="text-[11px] text-muted-foreground">{i.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}