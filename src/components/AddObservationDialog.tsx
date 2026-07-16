import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Upload, Sparkles, Loader2, Check, Mic, MicOff, Camera, BookOpen, Share2, Video, X, ImageIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";
import { notifyStudentParents } from "@/lib/parent-notify";

interface AiSuggestion {
  standard_code: string;
  standard_id: string | null;
  standard_title: string | null;
  standard_title_en: string | null;
  learning_area: string | null;
  learning_area_code: string | null;
  confidence: number;
  proficiency: string;
  reason: string;
}

interface AddObservationDialogProps {
  students: any[];
  areas: any[];
  standards: any[];
  selectedArea: string;
  setSelectedArea: (v: string) => void;
  onSaved: () => void;
  prefillLessonPlanId?: string | null;
  prefillTimetableSlotId?: string | null;
  branchId?: string;
}

const proficiencyColors: Record<string, string> = {
  TP1: "bg-destructive/15 text-destructive border-destructive/30",
  TP2: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  TP3: "bg-accent/15 text-accent border-accent/30",
};

export default function AddObservationDialog({
  students,
  areas,
  standards,
  selectedArea,
  setSelectedArea,
  onSaved,
  prefillLessonPlanId,
  prefillTimetableSlotId,
  branchId,
}: AddObservationDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "quick">("quick");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedStandard, setSelectedStandard] = useState("");
  const [proficiency, setProficiency] = useState("");
  const [notes, setNotes] = useState("");
  const [observedAt, setObservedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedLessonPlanId, setSelectedLessonPlanId] = useState(prefillLessonPlanId || "");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [acceptedSuggestion, setAcceptedSuggestion] = useState<AiSuggestion | null>(null);

  // Multimodal: image upload, voice mock, AI learning story
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  // Multi-attachment support: photos + short videos (max 30s, 25MB each)
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [aiLearningStory, setAiLearningStory] = useState("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [shareWithParent, setShareWithParent] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>("");

  // Mock voice recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // Fetch classes for branch
  const { data: classes = [] } = useQuery({
    queryKey: ["obs-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("branch_id", branchId!).eq("is_active", true).order("class_name");
      return data ?? [];
    },
    enabled: !!branchId && open,
  });

  // Fetch timetable slots for the selected observation date
  const selectedDate = new Date(observedAt + "T00:00:00");
  const selectedDow = selectedDate.getDay();
  const { data: todaySlots = [] } = useQuery({
    queryKey: ["obs-date-slots", selectedClassId, observedAt],
    queryFn: async () => {
      if (!selectedClassId || selectedDow === 0 || selectedDow === 6) return [];
      // Try daily slots first
      const { data: dailySlots } = await supabase
        .from("daily_timetable_slots")
        .select("id, source_slot_id, start_time, end_time, subject_name, event_name")
        .eq("class_id", selectedClassId)
        .eq("slot_date", observedAt)
        .order("start_time");
      // Map daily slots to use source_slot_id (FK references timetable_slots)
      if (dailySlots && dailySlots.length > 0) {
        return dailySlots.map((s: any) => ({ ...s, id: s.source_slot_id || s.id }));
      }
      
      // Fallback to weekly template
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name")
        .eq("class_id", selectedClassId)
        .eq("day_of_week", selectedDow)
        .order("start_time");
      return data ?? [];
    },
    enabled: !!selectedClassId && open,
  });

  // Fetch recent lesson plans for class linking
  const { data: recentLessonPlans = [] } = useQuery({
    queryKey: ["obs-lesson-plans", selectedClassId],
    queryFn: async () => {
      if (!selectedClassId) return [];
      const { data } = await supabase
        .from("lesson_plans")
        .select("id, title, theme, start_date, plan_mode")
        .eq("class_id", selectedClassId)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!selectedClassId && open,
  });

  // Fetch albums for the branch (filtered by class when chosen)
  const { data: albums = [] } = useQuery({
    queryKey: ["obs-albums", branchId, selectedClassId],
    queryFn: async () => {
      if (!branchId) return [];
      const q = supabase
        .from("learning_albums")
        .select("id, title, class_id")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50);
      const { data } = await q;
      const list = data ?? [];
      if (selectedClassId) {
        return list.filter((a: any) => !a.class_id || a.class_id === selectedClassId);
      }
      return list;
    },
    enabled: !!branchId && open,
  });

  const resetForm = () => {
    setSelectedStudent("");
    setSelectedArea("");
    setSelectedStandard("");
    setProficiency("");
    setNotes("");
    setEvidenceFile(null);
    setSuggestions([]);
    setAcceptedSuggestion(null);
    setMediaFile(null);
    setAttachments([]);
    setIsRecording(false);
    setRecordTime(0);
    setAiLearningStory("");
    setShareWithParent(false);
    setSelectedClassId("");
    setSelectedSlotId("");
    setSelectedLessonPlanId("");
    setSelectedAlbumId("");
  };

  const handleAutoTag = async () => {
    if (!notes.trim() || notes.trim().length < 5) {
      toast({ title: "Sila tulis catatan", description: "Min. 5 aksara untuk auto-tag.", variant: "destructive" });
      return;
    }
    setIsAutoTagging(true);
    setSuggestions([]);
    setAcceptedSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-observation-tags", {
        body: { notes: notes.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
      if (!data.suggestions?.length) {
        toast({ title: "Tiada cadangan", description: "AI tidak menemui standard yang sepadan." });
      }
    } catch (e: any) {
      console.error("Auto-tag error:", e);
      toast({ title: "Auto-tag gagal", description: e.message || "Sila cuba lagi.", variant: "destructive" });
    } finally {
      setIsAutoTagging(false);
    }
  };

  const acceptSuggestion = (s: AiSuggestion) => {
    setAcceptedSuggestion(s);
    if (s.standard_id) setSelectedStandard(s.standard_id);
    setProficiency(s.proficiency);
  };

  const handleGenerateLearningStory = async () => {
    if (!notes.trim() || notes.trim().length < 5) {
      toast({ title: "Write notes first", description: "Min. 5 characters required.", variant: "destructive" });
      return;
    }
    const student = students.find((s) => s.id === selectedStudent);
    const studentName = student ? `${student.first_name} ${student.last_name}` : "";

    setIsGeneratingStory(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-learning-story", {
        body: { notes: notes.trim(), studentName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiLearningStory(data.learningStory || "");
      toast({ title: "Learning Story generated!", description: `Area: ${data.learningArea}` });
    } catch (e: any) {
      console.error("Learning story error:", e);
      toast({ title: "Generation failed", description: e.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      toast({ title: "Recording stopped", description: `Mock recording: ${recordTime}s captured (visual only).` });
    } else {
      setIsRecording(true);
    }
  };

  const addObservation = useMutation({
    mutationFn: async (overrideShare?: boolean) => {
      const shouldShare = overrideShare ?? shareWithParent;
      let evidence_url: string | null = null;
      let media_url: string | null = null;

      if (evidenceFile) {
        const filePath = `${user!.id}/${Date.now()}_${evidenceFile.name}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        evidence_url = await uploadAndSign("observation-evidence", filePath, evidenceFile);
      }

      if (mediaFile) {
        const filePath = `${user!.id}/${Date.now()}_media_${mediaFile.name}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        media_url = await uploadAndSign("observation-evidence", filePath, mediaFile);
      }

      // Upload all multi-attachments (photos + short videos)
      type Uploaded = { url: string; type: "image" | "video"; name: string };
      const uploadedExtras: Uploaded[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const f = attachments[i];
        const safeName = f.name.replace(/[^\w.\-]/g, "_");
        const filePath = `${user!.id}/${Date.now()}_a${i}_${safeName}`;
        const { uploadAndSign } = await import("@/lib/storage/signedUrl");
        const url = await uploadAndSign("observation-evidence", filePath, f);
        uploadedExtras.push({
          url,
          type: f.type.startsWith("video/") ? "video" : "image",
          name: f.name,
        });
      }
      // If no legacy media_url was set but we have an attachment, mirror the first image
      // into media_url so older queries / portfolio code keeps working.
      if (!media_url) {
        const firstImg = uploadedExtras.find((u) => u.type === "image");
        if (firstImg) media_url = firstImg.url;
      }

      const insertData: any = {
        student_id: selectedStudent,
        standard_id: acceptedSuggestion?.standard_id || selectedStandard,
        proficiency_level: proficiency as any,
        notes: notes || null,
        evidence_url,
        observed_by: user!.id,
        observed_at: observedAt,
        media_url,
        ai_learning_story: aiLearningStory || null,
        is_shared_with_parent: shouldShare,
        lesson_plan_id: selectedLessonPlanId || prefillLessonPlanId || null,
        timetable_slot_id: prefillTimetableSlotId || selectedSlotId || null,
        album_id: selectedAlbumId || null,
      };

      console.log("Saving observation:", JSON.stringify(insertData));
      const { data: obsRow, error } = await supabase
        .from("student_observations")
        .insert(insertData)
        .select("id")
        .single();
      if (error) {
        console.error("Observation save error:", error);
        throw error;
      }
      const observationId = (obsRow as any)?.id as string | undefined;

      // Persist multi-media rows linked to this observation
      if (observationId && uploadedExtras.length) {
        const rows = uploadedExtras.map((u, idx) => ({
          observation_id: observationId,
          media_url: u.url,
          media_type: u.type,
          caption: null,
          sort_order: idx,
          created_by: user!.id,
        }));
        const { error: mErr } = await supabase
          .from("student_observation_media" as any)
          .insert(rows as any);
        if (mErr) console.warn("observation media insert failed:", mErr);
      }

      // Dual-write: if linked to an album AND shared with parent AND has a photo,
      // also create a learning_activities row so it appears in the album view.
      const hasAnyMedia = !!media_url || uploadedExtras.length > 0;
      if (selectedAlbumId && shouldShare && hasAnyMedia && branchId) {
        try {
          const { data: act, error: actErr } = await supabase
            .from("learning_activities")
            .insert({
              branch_id: branchId,
              album_id: selectedAlbumId,
              class_id: selectedClassId || null,
              title: aiLearningStory ? aiLearningStory.slice(0, 80) : (notes?.slice(0, 80) || "Learning moment"),
              description: notes || null,
              activity_date: observedAt,
              visible_to_parents: true,
              created_by: user!.id,
            })
            .select("id")
            .single();
          if (!actErr && act) {
            // Build full media set: legacy media_url first, then all attachments
            const albumMedia: any[] = [];
            if (media_url && !uploadedExtras.find((u) => u.url === media_url)) {
              albumMedia.push({
                activity_id: act.id,
                media_url,
                media_type: "image",
                caption: aiLearningStory?.slice(0, 200) || null,
                sort_order: 0,
              });
            }
            uploadedExtras.forEach((u, idx) => {
              albumMedia.push({
                activity_id: act.id,
                media_url: u.url,
                media_type: u.type,
                caption: idx === 0 ? aiLearningStory?.slice(0, 200) || null : null,
                sort_order: albumMedia.length,
              });
            });
            if (albumMedia.length) {
              await supabase.from("learning_activity_media").insert(albumMedia);
            }
            await supabase.from("learning_activity_students").insert({
              activity_id: act.id,
              student_id: selectedStudent,
            });
          }
        } catch (e) {
          console.warn("Album dual-write skipped:", e);
        }
      }

      return shouldShare;
    },
    onSuccess: (didShare) => {
      const studentId = selectedStudent;
      const studentObj = students.find((s: any) => s.id === studentId);
      onSaved();
      setOpen(false);
      resetForm();
      // Notify parent if shared
      if (didShare && studentId) {
        notifyStudentParents(
          studentId,
          "✨ New Observation",
          `A new observation has been recorded for ${studentObj?.first_name || "your child"}.`,
          "learning_journey",
          {
            actionUrl: "/journey",
            groupKey: `journey:${studentId}`,
            priority: "normal",
          }
        );
      }
      toast({ title: "Pemerhatian disimpan", description: didShare ? "Observation saved & shared with parent portal." : "Observation recorded successfully." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const skills = standards?.filter((s) => s.level === "skill") ?? [];
  const stdItems = standards?.filter((s) => s.level === "standard") ?? [];
  const subStdItems = standards?.filter((s) => s.level === "sub_standard") ?? [];

  const canSave =
    selectedStudent &&
    (acceptedSuggestion?.standard_id || selectedStandard) &&
    proficiency;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />New Observation</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record Observation</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "quick" ? "default" : "outline"} onClick={() => setMode("quick")}>
              <Sparkles className="mr-1 h-3 w-3" />Quick Note + AI
            </Button>
            <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
              Manual
            </Button>
          </div>

          {/* Date - moved to top */}
          <div>
            <Label>Date / Tarikh</Label>
            <Input type="date" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} />
          </div>

          {/* Student selection */}
          <div>
            <Label>Student / Pelajar</Label>
            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Class & Subject Linking */}
          {branchId && classes.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Class (optional)</Label>
                <Select value={selectedClassId} onValueChange={(v) => { setSelectedClassId(v); setSelectedSlotId(""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Link to class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Subject (optional)</Label>
                <Select value={selectedSlotId} onValueChange={setSelectedSlotId} disabled={!selectedClassId || todaySlots.length === 0}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={!selectedClassId ? "Select class first" : (selectedDow === 0 || selectedDow === 6) ? "No school on weekends" : todaySlots.length === 0 ? "No timetable for this date" : "Link to subject"} /></SelectTrigger>
                  <SelectContent>
                    {todaySlots.map((slot: any) => (
                      <SelectItem key={slot.id} value={slot.id}>
                        {slot.start_time?.slice(0, 5)} · {slot.subject_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Lesson Plan Linking */}
          {selectedClassId && recentLessonPlans.length > 0 && (
            <div>
              <Label className="text-xs">Link to Lesson Plan (optional)</Label>
              <Select value={selectedLessonPlanId} onValueChange={setSelectedLessonPlanId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Link to lesson plan" /></SelectTrigger>
                <SelectContent>
                  {recentLessonPlans.map((lp: any) => (
                    <SelectItem key={lp.id} value={lp.id}>
                      {lp.title || lp.theme} · {lp.start_date || ""} ({lp.plan_mode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Album Linking — surfaces this observation in parent Albums */}
          {branchId && albums.length > 0 && (
            <div>
              <Label className="text-xs">Add to Album (optional)</Label>
              <Select value={selectedAlbumId} onValueChange={setSelectedAlbumId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick an album to share with parents" />
                </SelectTrigger>
                <SelectContent>
                  {albums.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                If chosen, this observation also appears in the album for tagged parents.
              </p>
            </div>
          )}

          {/* Quick Note mode */}
          {mode === "quick" && (
            <>
              <div>
                <Label>Notes / Catatan</Label>
                <Textarea
                  placeholder="Tulis pemerhatian anda... (cth: Murid boleh mengenal emosi gembira dan sedih)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Mock Voice Record */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  onClick={toggleRecording}
                  className="gap-2"
                >
                  {isRecording ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive-foreground opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive-foreground" />
                      </span>
                      Stop ({recordTime}s)
                    </>
                  ) : (
                    <><Mic className="h-4 w-4" />Voice Note</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {isRecording ? "Recording... (visual simulation)" : "Simulate voice recording"}
                </span>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={handleAutoTag}
                disabled={isAutoTagging || notes.trim().length < 5}
              >
                {isAutoTagging ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analysing...</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" />Auto-Tag Standards</>
                )}
              </Button>

              {/* AI Suggestions */}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">AI Suggestions — click to accept</Label>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => acceptSuggestion(s)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        acceptedSuggestion?.standard_code === s.standard_code
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{s.standard_code}</Badge>
                        <Badge variant="outline" className={proficiencyColors[s.proficiency] ?? ""}>
                          {s.proficiency}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {Math.round(s.confidence * 100)}%
                        </span>
                        {acceptedSuggestion?.standard_code === s.standard_code && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      {s.standard_title && (
                        <p className="text-sm text-foreground mt-1">{s.standard_title}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                      {s.learning_area && (
                        <p className="text-xs text-muted-foreground">{s.learning_area_code} – {s.learning_area}</p>
                      )}
                    </button>
                  ))}

                  {acceptedSuggestion && (
                    <div>
                      <Label className="text-xs">Adjust Proficiency (optional)</Label>
                      <Select value={proficiency} onValueChange={setProficiency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TP1">TP1 – Belum Menguasai</SelectItem>
                          <SelectItem value="TP2">TP2 – Menguasai</SelectItem>
                          <SelectItem value="TP3">TP3 – Melebihi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {!acceptedSuggestion && suggestions.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Klik cadangan di atas untuk memilih, atau tukar ke mod Manual.
                    </p>
                  )}
                </div>
              )}

              {/* Generate AI Learning Story */}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleGenerateLearningStory}
                disabled={isGeneratingStory || notes.trim().length < 5}
              >
                {isGeneratingStory ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating Learning Story...</>
                ) : (
                  <><BookOpen className="h-4 w-4" />Generate AI Learning Story</>
                )}
              </Button>

              {/* AI Learning Story Preview */}
              {aiLearningStory && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-semibold text-primary">AI Learning Story</Label>
                  </div>
                  <Textarea
                    value={aiLearningStory}
                    onChange={(e) => setAiLearningStory(e.target.value)}
                    rows={5}
                    className="bg-background"
                  />
                </div>
              )}

              {/* Share toggle - always visible */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWithParent}
                  onChange={(e) => setShareWithParent(e.target.checked)}
                  className="rounded border-input"
                />
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Share to Parent Portal</span>
              </label>
            </>
          )}

          {/* Manual mode */}
          {mode === "manual" && (
            <>
              <div>
                <Label>Learning Area / Tunjang</Label>
                <Select value={selectedArea} onValueChange={(v) => { setSelectedArea(v); setSelectedStandard(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>
                    {areas?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} – {a.name_ms}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedArea && (
                <div>
                  <Label>Standard / Standard</Label>
                  <Select value={selectedStandard} onValueChange={setSelectedStandard}>
                    <SelectTrigger><SelectValue placeholder="Select standard" /></SelectTrigger>
                    <SelectContent>
                      {skills.map((skill) => (
                        <div key={skill.id}>
                          <SelectItem value={skill.id} className="font-semibold">{skill.code} – {skill.title_ms}</SelectItem>
                          {stdItems.filter((st) => st.parent_id === skill.id).map((st) => (
                            <div key={st.id}>
                              <SelectItem value={st.id} className="pl-6">{st.code} – {st.title_ms}</SelectItem>
                              {subStdItems.filter((sub) => sub.parent_id === st.id).map((sub) => (
                                <SelectItem key={sub.id} value={sub.id} className="pl-10 text-xs">{sub.code} – {sub.title_ms}</SelectItem>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Proficiency Level / Tahap Penguasaan</Label>
                <Select value={proficiency} onValueChange={setProficiency}>
                  <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TP1">TP1 – Belum Menguasai (Not Yet)</SelectItem>
                    <SelectItem value="TP2">TP2 – Menguasai (Achieved)</SelectItem>
                    <SelectItem value="TP3">TP3 – Melebihi (Exceeding)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes / Catatan</Label>
                <Textarea placeholder="Teacher notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </>
          )}

          {/* Photo / Evidence (merged) */}
          <div>
            <Label>Photo / Evidence (optional)</Label>
            <div className="mt-1 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input p-4 hover:bg-muted/50 transition-colors">
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {mediaFile ? mediaFile.name : evidenceFile ? evidenceFile.name : "Take photo, upload image, or document"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      if (file.type === "application/pdf") {
                        setEvidenceFile(file);
                        setMediaFile(null);
                      } else {
                        setMediaFile(file);
                        setEvidenceFile(null);
                      }
                    }
                  }}
                />
              </label>
              {(mediaFile || evidenceFile) && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {mediaFile ? "📷 Image" : "📄 PDF"}: {(mediaFile || evidenceFile)!.name}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => { setMediaFile(null); setEvidenceFile(null); }}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Multi-attachments: photos + short videos */}
          <div>
            <div className="flex items-center justify-between">
              <Label>More photos & videos (optional)</Label>
              <span className="text-[11px] text-muted-foreground">
                Up to 10 files · ≤25MB each · videos ≤30s
              </span>
            </div>
            <div className="mt-1 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input p-3 hover:bg-muted/50 transition-colors">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <Video className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Add multiple photos or short videos
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files ?? []);
                    if (!incoming.length) return;
                    const MAX_SIZE = 25 * 1024 * 1024;
                    const accepted: File[] = [];
                    let rejected = 0;
                    for (const f of incoming) {
                      if (f.size > MAX_SIZE) { rejected++; continue; }
                      accepted.push(f);
                    }
                    setAttachments((prev) => {
                      const merged = [...prev, ...accepted].slice(0, 10);
                      return merged;
                    });
                    if (rejected) {
                      toast({
                        title: `${rejected} file${rejected > 1 ? "s" : ""} skipped`,
                        description: "Files must be 25MB or smaller.",
                        variant: "destructive",
                      });
                    }
                    // Reset the input so re-selecting the same file works
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {attachments.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {attachments.map((f, idx) => {
                    const url = URL.createObjectURL(f);
                    const isVideo = f.type.startsWith("video/");
                    return (
                      <div key={`${f.name}-${idx}`} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                        {isVideo ? (
                          <video src={url} muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          <img src={url} alt={f.name} className="h-full w-full object-cover" />
                        )}
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          {isVideo ? "Video" : "Photo"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 rounded-full bg-background/90 hover:bg-background p-1 shadow"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {attachments.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {attachments.length}/10 attached. They will appear in the parent Story feed
                  {selectedAlbumId ? " and the linked album" : ""}.
                </p>
              )}
            </div>
          </div>

          {/* Save buttons */}
          {!canSave && (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-2 text-xs text-muted-foreground">
              <p className="font-medium mb-1">To save, please complete:</p>
              <ul className="space-y-0.5">
                {!selectedStudent && <li>• Select a student</li>}
                {!(acceptedSuggestion?.standard_id || selectedStandard) && (
                  <li>
                    • {mode === "quick"
                      ? "Write notes and tap Auto-Tag, then accept a suggestion (or switch to Manual)"
                      : "Select a learning area and standard"}
                  </li>
                )}
                {!proficiency && <li>• Select a proficiency level (TP1/TP2/TP3)</li>}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => addObservation.mutate(shareWithParent)}
              disabled={!canSave || addObservation.isPending}
            >
              {addObservation.isPending ? "Saving..." : "Save Observation"}
            </Button>
            <Button
              variant="secondary"
              className="gap-1"
              onClick={() => addObservation.mutate(true)}
              disabled={!canSave || addObservation.isPending}
            >
              <Share2 className="h-4 w-4" />Save & Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
