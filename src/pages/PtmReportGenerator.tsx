import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, RefreshCw, Send, Pencil, Printer, ArrowLeft, AlertTriangle, CheckCircle2, FileText, BookOpen, ClipboardCheck, Route, Star, ListChecks, ClipboardEdit, Save, ShieldCheck, Eye, Download, PackageCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { composeBooklet, validateForPublish, type BookletContent } from "@/lib/ptm/booklet-composer";
import { generatePtmReportPdf } from "@/lib/ptm-pdf";
import { toast } from "@/components/ui/use-toast";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import PtmBookletPrintView, { PtmBookletData } from "@/components/student-progress/PtmBookletPrintView";
import { useBranding } from "@/hooks/use-branding";
import BackToContextBar from "@/components/navigation/BackToContextBar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  computeTerms,
  pickBaselineAndCurrent,
  buildComparisonRows,
  validateForGeneration,
  type AssessmentSummary,
} from "@/lib/ptm/assessment-comparison";
import AssessmentComparisonTable from "@/components/student-progress/AssessmentComparisonTable";
import { useMemo } from "react";
import { loadJourneyTimeline, type JourneyTimelineItem } from "@/lib/ptm/learning-journey";
import LearningJourneyReviewTable from "@/components/student-progress/LearningJourneyReviewTable";
import { loadHighlights, type HighlightItem } from "@/lib/ptm/highlights";
import HighlightsReviewTable from "@/components/student-progress/HighlightsReviewTable";
import PtmPreparationForm from "@/components/student-progress/PtmPreparationForm";
import PtmReadinessChecklist from "@/components/student-progress/PtmReadinessChecklist";
import {
  EMPTY_PREPARATION,
  buildReadinessChecklist,
  checklistBlockingIssues,
  type PreparationDraft,
  type PreparationRow,
} from "@/lib/ptm/preparation";

export default function PtmReportGenerator() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const [reportType, setReportType] = useState("summary");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("reports");
  const [printingId, setPrintingId] = useState<string | null>(null);
  const branding = useBranding();
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [termLabel, setTermLabel] = useState<string>("");

  // ---- Learning Journey review state (Phase 2) ----
  const [journeyIncluded, setJourneyIncluded] = useState<Set<string>>(new Set());
  const [journeyOrder, setJourneyOrder] = useState<string[]>([]);

  // ---- Milestones & Learning Photos review state (Phase 3) ----
  const [highlightIncluded, setHighlightIncluded] = useState<Set<string>>(new Set());
  const [highlightOrder, setHighlightOrder] = useState<string[]>([]);

  // ---- Teacher Preparation state (Phase 4) ----
  const [prepDraft, setPrepDraft] = useState<PreparationDraft>(EMPTY_PREPARATION);
  const [prepDirty, setPrepDirty] = useState(false);

  // ---- Phase 5: preview + publish state ----
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<BookletContent | null>(null);

  // Split the student fetch so an RLS restriction on a joined resource
  // (branches / organizations / classes) can never null-out the entire
  // record. Each related lookup is independent and non-blocking.
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useQuery({
    queryKey: ["ptm-student", studentId],
    queryFn: async () => {
      const [studentRes, classRes, branchRes] = await Promise.all([
        supabase.from("students").select("*").eq("id", studentId!).maybeSingle(),
        supabase
          .from("students")
          .select("class_id, classes(name)")
          .eq("id", studentId!)
          .maybeSingle(),
        supabase
          .from("students")
          .select(
            "branch_id, branches(name, address, phone, email, organization_id, organizations(name))",
          )
          .eq("id", studentId!)
          .maybeSingle(),
      ]);
      if (studentRes.error) throw studentRes.error;
      if (!studentRes.data) return null;
      return {
        ...studentRes.data,
        classes: (classRes.data as any)?.classes ?? null,
        branches: (branchRes.data as any)?.branches ?? null,
      } as any;
    },
    enabled: !!studentId,
  });

  // Academic years scoped to the student's branch.
  const {
    data: academicYears,
    isLoading: academicYearsLoading,
  } = useQuery({
    queryKey: ["ptm-academic-years", (student as any)?.branch_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date, is_active")
        .eq("branch_id", (student as any).branch_id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(student as any)?.branch_id,
  });

  // Auto-select the active academic year on first load (as a proper effect,
  // not a render-body side effect, so React never re-fires it in a loop).
  useEffect(() => {
    if (academicYearId) return;
    if (!academicYears || academicYears.length === 0) return;
    const active = academicYears.find((y: any) => y.is_active) || academicYears[0];
    if (active) setAcademicYearId(active.id);
  }, [academicYearId, academicYears]);

  const selectedYear = (academicYears ?? []).find((y: any) => y.id === academicYearId) || null;
  const terms = useMemo(
    () => (selectedYear ? computeTerms(selectedYear.start_date, selectedYear.end_date) : []),
    [selectedYear],
  );
  const selectedTerm = terms.find((t) => t.label === termLabel) || null;

  // Assessments within the selected term range.
  const { data: termAssessments } = useQuery({
    queryKey: ["ptm-assessments", studentId, selectedTerm?.start, selectedTerm?.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("id, date_evaluated, assessment_type, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score")
        .eq("student_id", studentId!)
        .gte("date_evaluated", selectedTerm!.start)
        .lte("date_evaluated", selectedTerm!.end)
        .order("date_evaluated", { ascending: true });
      return data ?? [];
    },
    enabled: !!studentId && !!selectedTerm,
  });

  const { baseline, current } = pickBaselineAndCurrent(termAssessments ?? []);
  const comparisonRows = buildComparisonRows(baseline, current);
  const assessmentSummary: AssessmentSummary | null = selectedYear && selectedTerm ? {
    academicYear: selectedYear.year_name,
    termLabel: selectedTerm.label,
    termStart: selectedTerm.start,
    termEnd: selectedTerm.end,
    baseline: baseline ? { id: baseline.id, date_evaluated: baseline.date_evaluated, assessment_type: (baseline as any).assessment_type ?? null } : null,
    current:  current  ? { id: current.id,  date_evaluated: current.date_evaluated,  assessment_type: (current  as any).assessment_type ?? null } : null,
    rows: comparisonRows,
  } : null;

  const validation = validateForGeneration({
    yearId: academicYearId || null,
    termLabel: termLabel || null,
    baseline: baseline ? { id: baseline.id } : null,
    current:  current  ? { id: current.id  } : null,
  });

  // ---- Preparation record (Phase 4) ----
  const { data: preparation, refetch: refetchPreparation } = useQuery<PreparationRow | null>({
    queryKey: ["ptm-preparation", studentId, academicYearId, termLabel],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ptm_preparation")
        .select("*")
        .eq("student_id", studentId!)
        .eq("academic_year_id", academicYearId)
        .eq("term_label", termLabel)
        .maybeSingle();
      return (data as PreparationRow) ?? null;
    },
    enabled: !!studentId && !!academicYearId && !!termLabel,
  });

  useEffect(() => {
    setPrepDraft({
      strengths: preparation?.strengths ?? "",
      areas_for_development: preparation?.areas_for_development ?? "",
      next_learning_goals: preparation?.next_learning_goals ?? "",
      home_activities: preparation?.home_activities ?? "",
      discussion_notes: preparation?.discussion_notes ?? "",
      action_plan: preparation?.action_plan ?? "",
    });
    setPrepDirty(false);
  }, [preparation?.id, academicYearId, termLabel]);

  const savePrepMutation = useMutation({
    mutationFn: async (patch: Partial<PreparationRow> & { approved?: boolean }) => {
      if (!studentId || !academicYearId || !termLabel) throw new Error("Select an academic year and term first.");
      const branchId = (student as any)?.branch_id;
      if (!branchId) throw new Error("Missing branch for student.");
      const payload: any = {
        student_id: studentId,
        academic_year_id: academicYearId,
        term_label: termLabel,
        branch_id: branchId,
        ...prepDraft,
        ...patch,
      };
      if (patch.approved === true) {
        payload.approved_at = new Date().toISOString();
        payload.approved_by = user?.id ?? null;
      } else if (patch.approved === false) {
        payload.approved_at = null;
        payload.approved_by = null;
      }
      const { error } = await (supabase as any)
        .from("ptm_preparation")
        .upsert(payload, { onConflict: "student_id,academic_year_id,term_label" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      refetchPreparation();
      setPrepDirty(false);
      toast({
        title: vars.approved === true ? "Booklet approved" : vars.approved === false ? "Approval revoked" : "Preparation saved",
      });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  // Learning Journey timeline for the selected term (read directly from the
  // Learning Journey module — nothing is duplicated).
  const { data: journeyTimeline = [], isLoading: journeyLoading } = useQuery<JourneyTimelineItem[]>({
    queryKey: ["ptm-journey-timeline", studentId, selectedTerm?.start, selectedTerm?.end],
    queryFn: () => loadJourneyTimeline({
      studentId: studentId!,
      termStart: selectedTerm!.start,
      termEnd: selectedTerm!.end,
    }),
    enabled: !!studentId && !!selectedTerm,
  });

  // When the timeline changes, reset the include/order state to "all in
  // chronological order" so teachers always start from a sensible baseline.
  useEffect(() => {
    const keys = journeyTimeline.map((i) => i.key);
    setJourneyOrder(keys);
    setJourneyIncluded(new Set(keys));
  }, [journeyTimeline]);

  const journeyByKey = useMemo(() => new Map(journeyTimeline.map((i) => [i.key, i])), [journeyTimeline]);

  const handleJourneyToggle = (key: string, included: boolean) => {
    setJourneyIncluded((prev) => {
      const next = new Set(prev);
      if (included) next.add(key); else next.delete(key);
      return next;
    });
  };
  const handleJourneyToggleAll = (checked: boolean) => {
    setJourneyIncluded(checked ? new Set(journeyOrder) : new Set());
  };
  const handleJourneyMove = (key: string, direction: "up" | "down") => {
    setJourneyOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  // Milestones & photos for the selected term.
  const { data: highlightItems = [], isLoading: highlightsLoading } = useQuery<HighlightItem[]>({
    queryKey: ["ptm-highlights", studentId, selectedTerm?.start, selectedTerm?.end],
    queryFn: () => loadHighlights({
      studentId: studentId!,
      termStart: selectedTerm!.start,
      termEnd: selectedTerm!.end,
    }),
    enabled: !!studentId && !!selectedTerm,
  });
  useEffect(() => {
    const keys = highlightItems.map((i) => i.key);
    setHighlightOrder(keys);
    setHighlightIncluded(new Set(keys));
  }, [highlightItems]);
  const highlightByKey = useMemo(() => new Map(highlightItems.map((i) => [i.key, i])), [highlightItems]);
  const handleHighlightToggle = (key: string, included: boolean) => {
    setHighlightIncluded((prev) => {
      const next = new Set(prev);
      if (included) next.add(key); else next.delete(key);
      return next;
    });
  };
  const handleHighlightToggleAll = (checked: boolean) => {
    setHighlightIncluded(checked ? new Set(highlightOrder) : new Set());
  };
  const handleHighlightMove = (key: string, direction: "up" | "down") => {
    setHighlightOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const { data: reports, isLoading } = useQuery({
    queryKey: ["ptm-reports", studentId],
    queryFn: async () => {
      const { data } = await supabase.from("ptm_reports").select("*").eq("student_id", studentId!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!studentId,
  });

  // ---- Readiness checklist ----
  const readinessItems = buildReadinessChecklist({
    studentPresent: !!student,
    assessment: assessmentSummary,
    journey: { total: journeyTimeline.length, included: journeyIncluded.size },
    highlights: { total: highlightItems.length, included: highlightIncluded.size },
    prep: prepDraft,
  });
  const blockingIssues = checklistBlockingIssues(readinessItems);
  const isApproved = !!preparation?.approved && !prepDirty;
  const canGenerate = validation.ok && blockingIssues.length === 0 && isApproved;

  // Phase 5 publish validation — independent of AI generator; enforces that
  // every mandatory section is present and the teacher has approved.
  const publishValidation = validateForPublish({
    yearId: academicYearId || null,
    termLabel: termLabel || null,
    assessment: assessmentSummary,
    prep: prepDraft,
    approved: isApproved,
  });

  const buildPreviewContent = (): BookletContent | null => {
    if (!selectedTerm) return null;
    return composeBooklet({
      studentName,
      academicYearName: selectedYear?.year_name ?? null,
      termLabel,
      termStart: selectedTerm.start,
      termEnd: selectedTerm.end,
      assessment: assessmentSummary,
      journey: journeyTimeline,
      journeyIncluded,
      journeyOrder,
      highlights: highlightItems,
      highlightIncluded,
      highlightOrder,
      prep: prepDraft,
    });
  };

  const openPreview = () => {
    const c = buildPreviewContent();
    if (!c) {
      toast({ title: "Select academic year and term first", variant: "destructive" });
      return;
    }
    setPreviewContent(c);
    setPreviewOpen(true);
  };

  const publishBookletMutation = useMutation({
    mutationFn: async () => {
      if (!publishValidation.ok) {
        throw new Error(`Cannot publish yet: ${publishValidation.missing.join(", ")}`);
      }
      const branchId = (student as any)?.branch_id;
      const classId = (student as any)?.class_id ?? null;
      if (!studentId || !branchId) throw new Error("Missing student context.");
      const content = buildPreviewContent();
      if (!content) throw new Error("Unable to compose booklet.");
      const termName = `${selectedYear?.year_name ?? ""}${selectedYear ? " · " : ""}${termLabel}`.trim();
      const { data, error } = await supabase
        .from("ptm_reports")
        .insert({
          student_id: studentId,
          branch_id: branchId,
          class_id: classId,
          term_name: termName,
          academic_term: termName,
          report_type: "booklet",
          generated_content: content as any,
          strengths_json: content.strengthsCelebrations as any,
          support_areas_json: content.areasForSupport as any,
          parent_support_json: content.atHomeActivities as any,
          action_plan_json: content.actionPlan as any,
          status: "published",
          generated_by: user?.id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-reports", studentId] });
      setPreviewOpen(false);
      toast({
        title: "PTM Booklet published",
        description: "The booklet has been saved to this student's PTM history.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Publish failed", description: err.message, variant: "destructive" }),
  });

  const handleDownloadPdf = (report: any) => {
    generatePtmReportPdf(
      {
        id: report.id,
        term_name: report.term_name,
        report_type: report.report_type,
        created_at: report.created_at,
        generated_content: report.generated_content,
        students: { first_name: (student as any)?.first_name, last_name: (student as any)?.last_name },
      },
      { branchName: (student as any)?.branches?.name },
    );
  };

  const { data: concernFlags, isLoading: loadingFlags } = useQuery({
    queryKey: ["concern-flags", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-concern-flags", {
        body: { student_id: studentId },
      });
      if (error) return null;
      return data;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!validation.ok) throw new Error(validation.ok === false ? validation.message : "Validation failed");
      if (blockingIssues.length > 0) {
        throw new Error(`Complete these before generating: ${blockingIssues.map((b) => b.label).join(", ")}`);
      }
      if (!isApproved) throw new Error("Approve the booklet content in the Preparation section before generating.");
      // Build the ordered, teacher-approved Learning Journey selection.
      const selectedJourney = journeyOrder
        .filter((k) => journeyIncluded.has(k))
        .map((k) => journeyByKey.get(k))
        .filter(Boolean)
        .map((i: any) => ({
          key: i.key, source: i.source, id: i.id, date: i.date,
          title: i.title, domain: i.domain, tpLevel: i.tpLevel,
          teacherNote: i.teacherNote, entryType: i.entryType,
        }));
      const selectedHighlights = highlightOrder
        .filter((k) => highlightIncluded.has(k))
        .map((k) => highlightByKey.get(k))
        .filter(Boolean)
        .map((i: any) => ({
          key: i.key,
          update_id: i.update_id,
          date: i.date,
          caption: i.caption,
          domain: i.domain,
          milestone: i.milestone,
          photo_url: i.photo_url,
        }));
      const { data, error } = await supabase.functions.invoke("generate-ptm-report", {
        body: {
          student_id: studentId,
          report_type: reportType,
          academic_year_id: academicYearId,
          academic_year_name: selectedYear?.year_name,
          term_label: termLabel,
          term_start: selectedTerm?.start,
          term_end: selectedTerm?.end,
          learning_journey_selection: selectedJourney,
          highlight_selection: selectedHighlights,
          teacher_preparation: prepDraft,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-reports", studentId] });
      toast({ title: "PTM Report Generated", description: `${reportType} report created as draft.` });
    },
    onError: (err: any) => {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("ptm_reports").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ptm-reports", studentId] });
      setEditingId(null);
      toast({ title: "Report Updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    },
  });

  const studentName = student ? `${student.first_name} ${student.last_name}` : "";

  // ---------- Student picker (role-scoped) ----------
  // Teachers: limited to students in classes they are assigned to (across
  // any branch membership). Admin/HR/Franchisee/Superadmin: all students
  // visible via RLS.
  const { data: teacherClassIds } = useQuery({
    queryKey: ["ptm-my-teacher-classes", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("assigned_class_ids")
        .eq("user_id", user!.id);
      const ids = new Set<string>();
      (data ?? []).forEach((m: any) => {
        (m.assigned_class_ids ?? []).forEach((id: string) => ids.add(id));
      });
      return Array.from(ids);
    },
    enabled: !!user && isTeacher,
  });

  const { data: studentOptions, isLoading: studentOptionsLoading } = useQuery({
    queryKey: ["ptm-student-options", role, teacherClassIds?.join(",")],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, class_id, classes(name)")
        .order("first_name", { ascending: true });
      if (isTeacher) {
        if (!teacherClassIds || teacherClassIds.length === 0) return [];
        query = query.in("class_id", teacherClassIds);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && (!isTeacher || Array.isArray(teacherClassIds)),
  });

  const handlePrintBooklet = async (report: any) => {
    setPrintingId(report.id);
    try {
      const branchInfo: any = (student as any)?.branches || {};
      const orgName = branchInfo?.organizations?.name;
      const data: PtmBookletData = {
        studentName,
        studentPhotoUrl: (student as any)?.photo_url || null,
        className: (student as any)?.classes?.name || null,
        teacherName: null,
        meetingDate: null,
        termName: report.term_name || "Term Report",
        schoolName: branchInfo?.name || orgName || "School",
        schoolAddress: branchInfo?.address,
        schoolPhone: branchInfo?.phone,
        schoolEmail: branchInfo?.email,
        registrationNo: undefined,
        logoUrl: branding.generalIcon || branding.teacherIcon || branding.parentIcon,
        content: report.generated_content,
      };

      // Render off-screen with flushSync (mirrors InvoicePrintView pattern)
      const stagingHost = document.createElement("div");
      stagingHost.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
      document.body.appendChild(stagingHost);
      const stagingRoot = createRoot(stagingHost);
      flushSync(() => {
        stagingRoot.render(<PtmBookletPrintView data={data} />);
      });

      // Wait for images
      await new Promise<void>((resolve) => {
        const imgs = Array.from(stagingHost.querySelectorAll("img"));
        if (imgs.length === 0) return resolve();
        let pending = imgs.length;
        const done = () => { if (--pending <= 0) resolve(); };
        const cap = setTimeout(resolve, 3000);
        imgs.forEach((img) => {
          if ((img as HTMLImageElement).complete) { done(); return; }
          img.addEventListener("load", () => done(), { once: true });
          img.addEventListener("error", () => done(), { once: true });
        });
        Promise.resolve().then(() => clearTimeout(cap));
      });

      const renderedHtml = stagingHost.innerHTML;
      const w = window.open("about:blank", "_blank");
      if (!w) {
        stagingRoot.unmount();
        stagingHost.remove();
        toast({ title: "Pop-up blocked", description: "Please allow pop-ups to print.", variant: "destructive" });
        return;
      }
      w.document.open();
      w.document.write(`<!DOCTYPE html><html><head>
        <title>PTM Booklet — ${studentName}</title>
        <meta http-equiv="Cache-Control" content="no-cache" />
        <style>
          @page { size: A4; margin: 0; }
          @media print { body { margin: 0; } }
          body { margin: 0; background: white; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        </style>
      </head><body>${renderedHtml}</body></html>`);
      w.document.close();

      stagingRoot.unmount();
      stagingHost.remove();

      const triggerPrint = () => { try { w.focus(); w.print(); } catch {} };
      const popupImgs = Array.from(w.document.images);
      if (popupImgs.length === 0) {
        setTimeout(triggerPrint, 300);
      } else {
        let pending = popupImgs.length;
        const done = () => { if (--pending <= 0) setTimeout(triggerPrint, 200); };
        popupImgs.forEach((img) => {
          if (img.complete) { done(); return; }
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }
    } catch (e: any) {
      toast({ title: "Print failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BackToContextBar />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/curriculum/ptm/prep")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              PTM Report{studentName ? ` — ${studentName}` : ""}
            </h1>
            <p className="text-sm text-muted-foreground">Generate and manage PTM reports</p>
          </div>
        </div>

        {/* Student context error / missing state */}
        {!studentLoading && !student && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Student record not available</AlertTitle>
            <AlertDescription>
              {studentError
                ? `We couldn't load this student (${(studentError as any)?.message || "unknown error"}).`
                : "This student could not be found, or you don't have permission to view them."}{" "}
              Please return to the <strong>PTM Preparation</strong> list and pick a student again.
            </AlertDescription>
          </Alert>
        )}

        {/* Generate Controls */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Student <span className="text-destructive">*</span>
                </label>
                <Select
                  value={studentId ?? ""}
                  onValueChange={(v) => navigate(`/curriculum/ptm/generate/${v}`)}
                  disabled={studentOptionsLoading}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue
                      placeholder={
                        studentOptionsLoading
                          ? "Loading students…"
                          : (studentOptions?.length ?? 0) === 0
                            ? isTeacher ? "No students in your classes" : "No students available"
                            : "Select a student"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(studentOptions ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                        {s.classes?.name ? ` · ${s.classes.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Academic Year <span className="text-destructive">*</span>
                </label>
                <Select
                  value={academicYearId}
                  onValueChange={(v) => { setAcademicYearId(v); setTermLabel(""); }}
                  disabled={!student || academicYearsLoading || (academicYears?.length ?? 0) === 0}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue
                      placeholder={
                        !student
                          ? "Select a student first"
                          : academicYearsLoading
                            ? "Loading…"
                            : (academicYears?.length ?? 0) === 0
                              ? "No Academic Year configured"
                              : "Select Academic Year"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(academicYears ?? []).map((y: any) => (
                      <SelectItem key={y.id} value={y.id}>{y.year_name}{y.is_active ? " (active)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Term <span className="text-destructive">*</span>
                </label>
                <Select value={termLabel} onValueChange={setTermLabel} disabled={!selectedYear}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue
                      placeholder={
                        !selectedYear
                          ? "Select year first"
                          : terms.length === 0
                            ? "No Terms available"
                            : "Select Term"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((t) => (
                      <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">📋 Summary Report</SelectItem>
                    <SelectItem value="detailed">📄 Detailed Report</SelectItem>
                    <SelectItem value="talking_guide">🗣️ Talking Guide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => {
                    if (!studentId) {
                      toast({ title: "Please select a student.", variant: "destructive" });
                      return;
                    }
                    if (!academicYearId) {
                      toast({ title: "Please select an Academic Year.", variant: "destructive" });
                      return;
                    }
                    if (!termLabel) {
                      toast({ title: "Please select a Term.", variant: "destructive" });
                      return;
                    }
                    if (!reportType) {
                      toast({ title: "Please select a Report Type.", variant: "destructive" });
                      return;
                    }
                    if (!publishValidation.ok) {
                      toast({
                        title: "Complete required sections before generating",
                        description: publishValidation.missing.join(", "),
                        variant: "destructive",
                      });
                      return;
                    }
                    publishBookletMutation.mutate();
                  }}
                  disabled={
                    publishBookletMutation.isPending ||
                    !studentId ||
                    !academicYearId ||
                    !termLabel ||
                    !reportType
                  }
                >
                  {publishBookletMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
                  ) : (
                    <><BookOpen className="mr-2 h-4 w-4" />Generate PTM Booklet</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={openPreview}
                  disabled={!selectedTerm || !studentId}
                >
                  <Eye className="mr-2 h-4 w-4" />Preview PTM Booklet
                </Button>
              </div>
            </div>
            {academicYears && academicYears.length === 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Academic Years configured</AlertTitle>
                <AlertDescription>
                  This student's branch has no Academic Year set up yet. Add one under
                  <strong> Settings → Academic Years</strong> before generating a PTM Booklet.
                </AlertDescription>
              </Alert>
            )}
            {selectedTerm && (
              <p className="text-xs text-muted-foreground">
                Period: {new Date(selectedTerm.start).toLocaleDateString()} – {new Date(selectedTerm.end).toLocaleDateString()} · {(termAssessments ?? []).length} assessment{(termAssessments ?? []).length === 1 ? "" : "s"} in range
              </p>
            )}
            {validation.ok === false && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Cannot generate booklet yet</AlertTitle>
                <AlertDescription>{validation.message}</AlertDescription>
              </Alert>
            )}
            {validation.ok && !canGenerate && (
              <Alert>
                <ListChecks className="h-4 w-4" />
                <AlertTitle>Booklet not ready</AlertTitle>
                <AlertDescription>
                  {blockingIssues.length > 0
                    ? <>Complete the required sections in the <strong>PTM Preparation</strong> workspace below before generating.</>
                    : <>Approve the booklet content in the <strong>PTM Preparation</strong> workspace below before generating.</>}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Assessment Summary preview — pulled from Assessment Module (not modified) */}
        {assessmentSummary && validation.ok && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Assessment Summary — {assessmentSummary.academicYear} · {assessmentSummary.termLabel}
              </CardTitle>
              <Badge variant="outline" className="text-xs">Baseline vs Current</Badge>
            </CardHeader>
            <CardContent>
              <AssessmentComparisonTable summary={assessmentSummary} />
              <p className="mt-3 text-xs text-muted-foreground">
                Data is read directly from the Assessment Module. Baseline is the earliest assessment in the selected term; Current is the latest.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Milestones & Learning Photos review — Phase 3 */}
        {selectedTerm && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Milestones &amp; Learning Photos — {selectedYear?.year_name} · {selectedTerm.label}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {highlightIncluded.size}/{highlightItems.length} included
              </Badge>
            </CardHeader>
            <CardContent>
              {highlightsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading milestones &amp; photos…
                </div>
              ) : (
                <HighlightsReviewTable
                  items={highlightItems}
                  includedKeys={highlightIncluded}
                  order={highlightOrder}
                  onToggle={handleHighlightToggle}
                  onMove={handleHighlightMove}
                  onToggleAll={handleHighlightToggleAll}
                />
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Records are read directly from Daily Updates. Only shared moments flagged as <strong>Milestone</strong> or <strong>Portfolio</strong> with at least one photo appear here. Unchecked entries are excluded from the booklet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Learning Journey review — Phase 2 */}
        {selectedTerm && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                Learning Journey — {selectedYear?.year_name} · {selectedTerm.label}
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {journeyIncluded.size}/{journeyTimeline.length} included
              </Badge>
            </CardHeader>
            <CardContent>
              {journeyLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading Learning Journey…
                </div>
              ) : (
                <LearningJourneyReviewTable
                  items={journeyTimeline}
                  includedKeys={journeyIncluded}
                  order={journeyOrder}
                  onToggle={handleJourneyToggle}
                  onMove={handleJourneyMove}
                  onToggleAll={handleJourneyToggleAll}
                />
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Records are read directly from the Learning Journey module. TP1/TP2/TP3 levels come from teachers' original assessments and are not recalculated. Unchecked entries are excluded from the booklet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* PTM Preparation workspace — Phase 4 */}
        {selectedTerm && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardEdit className="h-4 w-4 text-primary" />
                    PTM Preparation — {selectedYear?.year_name} · {selectedTerm.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Review the automatically retrieved information above, complete the teacher summary, then approve the booklet content.
                  </p>
                </div>
                {preparation?.approved && !prepDirty ? (
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                    <ShieldCheck className="h-3 w-3" /> Approved
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                    Pending approval
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Teacher summary</h4>
                  <PtmPreparationForm
                    value={prepDraft}
                    onChange={(next) => { setPrepDraft(next); setPrepDirty(true); }}
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4 text-primary" /> Readiness checklist
                  </h4>
                  <PtmReadinessChecklist items={readinessItems} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => savePrepMutation.mutate({})}
                  disabled={savePrepMutation.isPending}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save draft
                </Button>
                {preparation?.approved && !prepDirty ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => savePrepMutation.mutate({ approved: false })}
                    disabled={savePrepMutation.isPending}
                  >
                    Revoke approval
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => savePrepMutation.mutate({ approved: true })}
                    disabled={savePrepMutation.isPending || blockingIssues.length > 0}
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Approve booklet content
                  </Button>
                )}
                {prepDirty && (
                  <span className="text-xs text-muted-foreground">Unsaved changes — save before approving.</span>
                )}
                {preparation?.approved_at && !prepDirty && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Approved {new Date(preparation.approved_at).toLocaleString()}
                  </span>
                )}
              </div>

              {blockingIssues.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Complete required sections</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-xs mt-1">
                      {blockingIssues.map((b) => <li key={b.key}>{b.label}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 5 — Booklet Publisher */}
        {selectedTerm && (
          <Card className="border-emerald-300/70 bg-emerald-50/40">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-emerald-700" />
                    Publish PTM Booklet — {selectedYear?.year_name} · {selectedTerm.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Assembles the final booklet from the teacher-approved information above. Preview it, then publish
                    to save a permanent copy in this student's PTM history. Previous booklets are never overwritten.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={publishValidation.ok
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-amber-100 text-amber-700 border-amber-200"}
                >
                  {publishValidation.ok ? "Ready to publish" : "Not ready"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openPreview}
                  disabled={!selectedTerm}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview Booklet
                </Button>
                <Button
                  size="sm"
                  onClick={() => publishBookletMutation.mutate()}
                  disabled={!publishValidation.ok || publishBookletMutation.isPending}
                >
                  {publishBookletMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Publishing…</>
                  ) : (
                    <><PackageCheck className="mr-1.5 h-3.5 w-3.5" />Publish Booklet</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Uses only teacher-approved content — no AI summaries.
                </span>
              </div>
              {!publishValidation.ok && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Complete these before publishing</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-xs mt-1">
                      {publishValidation.missing.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="reports">Reports ({reports?.length || 0})</TabsTrigger>
            <TabsTrigger value="concerns">Concern Flags</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-4">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-6"><div className="space-y-3"><div className="h-4 w-1/3 bg-muted animate-pulse rounded" /><div className="h-20 w-full bg-muted animate-pulse rounded" /><div className="h-4 w-2/3 bg-muted animate-pulse rounded" /></div></CardContent></Card>
                ))}
              </div>
            )}
            {reports?.length === 0 && !isLoading && (
              <Card>
                <CardContent className="py-16 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No reports yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Select a report type above and click "Generate PTM Booklet" to create one.</p>
                </CardContent>
              </Card>
            )}
            {reports?.map((report: any) => {
              const content = report.generated_content as any;
              const isEditing = editingId === report.id;
              // Prefer the Academic Year + Term captured at generation time
              // over the free-form `term_name` string, so the card header
              // always reflects the teacher's selected Academic Year.
              const summary = content?.assessmentSummary;
              const displayTitle =
                summary?.academicYear && summary?.termLabel
                  ? `${summary.academicYear} · ${summary.termLabel}`
                  : report.term_name;
              return (
                <Card key={report.id} className="print-report">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">{displayTitle}</CardTitle>
                      <Badge variant="outline" className={
                        report.status === "published" ? "bg-accent/15 text-accent border-accent/30" : "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30"
                      }>{report.status}</Badge>
                      <Badge variant="outline" className="text-xs">{report.report_type || "summary"}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleDateString()}</span>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {content?.assessmentSummary && (
                      <section>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5 text-primary" />
                          Assessment Summary
                          <span className="text-xs font-normal text-muted-foreground">
                            · {content.assessmentSummary.academicYear} · {content.assessmentSummary.termLabel}
                          </span>
                        </h4>
                        <AssessmentComparisonTable summary={content.assessmentSummary} />
                      </section>
                    )}
                    <section>
                      <h4 className="text-sm font-semibold mb-2">📝 Overall Progress</h4>
                      {isEditing ? (
                        <Textarea value={editContent?.overallNarrative ?? ""} onChange={e => setEditContent({ ...editContent, overallNarrative: e.target.value })} className="min-h-[100px]" />
                      ) : (
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{content?.overallNarrative}</p>
                      )}
                    </section>
                    <section>
                      <h4 className="text-sm font-semibold mb-2">🌟 Strengths</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(content?.strengthsCelebrations ?? []).map((s: string, i: number) => (
                          <li key={i} className="text-sm text-foreground/80">{s}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4 className="text-sm font-semibold mb-2">💪 Areas for Support</h4>
                      <div className="space-y-2">
                        {(content?.areasForSupport ?? []).map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border p-3">
                            <p className="text-sm font-medium">{a.area}</p>
                            <p className="text-sm text-muted-foreground">{a.description}</p>
                            <p className="text-xs text-primary mt-1">💡 {a.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    {content?.teacherTalkingPoints?.length > 0 && (
                      <section>
                        <h4 className="text-sm font-semibold mb-2">🗣️ Talking Points</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {content.teacherTalkingPoints.map((t: string, i: number) => (
                            <li key={i} className="text-sm text-foreground/80">{t}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {content?.actionPlan?.length > 0 && (
                      <section>
                        <h4 className="text-sm font-semibold mb-2">📋 Action Plan</h4>
                        <div className="space-y-2">
                          {content.actionPlan.map((a: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                              <div>
                                <span className="font-medium">{a.action}</span>
                                <span className="text-muted-foreground ml-2">({a.owner}, {a.timeline})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    {Array.isArray(content?.highlightMoments) && content.highlightMoments.length > 0 && (
                      <section>
                        <h4 className="text-sm font-semibold mb-2">📸 Learning Milestones</h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {[...content.highlightMoments]
                            .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""))
                            .map((h: any, i: number) => (
                              <div key={h.key || h.update_id || i} className="rounded-lg border bg-card overflow-hidden">
                                <div className="relative w-full aspect-[4/3] bg-muted">
                                  {h.photo_url ? (
                                    <img
                                      src={h.photo_url}
                                      alt={h.caption || "Learning milestone"}
                                      loading="lazy"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center px-3">
                                      No milestone photo available.
                                    </div>
                                  )}
                                  {h.milestone && (
                                    <Badge className="absolute top-2 left-2 bg-[hsl(var(--role-teacher))]/90 text-white border-0 text-[10px] uppercase tracking-wide">
                                      Milestone
                                    </Badge>
                                  )}
                                </div>
                                <div className="p-3 space-y-1">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                                    {h.domain || "General"}
                                  </div>
                                  {h.caption && (
                                    <p className="text-xs text-foreground/80 leading-relaxed">{h.caption}</p>
                                  )}
                                  {h.date && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {new Date(h.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground italic">
                          Photos are pulled directly from the Learning Journey — edits there flow into the booklet and the PDF.
                        </p>
                      </section>
                    )}
                    <section>
                      <h4 className="text-sm font-semibold mb-2">🏠 Home Activities</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {(content?.atHomeActivities ?? []).map((act: any, i: number) => (
                          <div key={i} className="rounded-lg border p-3 bg-secondary/30">
                            <p className="text-sm font-medium">{act.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{act.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">🧰 {act.materials}</p>
                            <Badge variant="outline" className="mt-2 text-xs">{act.learningArea}</Badge>
                          </div>
                        ))}
                      </div>
                    </section>
                    <div className="flex items-center gap-2 pt-3 border-t">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={() => updateMutation.mutate({ id: report.id, updates: { generated_content: editContent } })} disabled={updateMutation.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(report.id); setEditContent(content); }}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => window.print()}>
                            <Printer className="mr-1.5 h-3.5 w-3.5" />Print
                          </Button>
                          <Button size="sm" onClick={() => handlePrintBooklet(report)} disabled={printingId === report.id}>
                            {printingId === report.id ? (
                              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Building…</>
                            ) : (
                              <><BookOpen className="mr-1.5 h-3.5 w-3.5" />Print Booklet</>
                            )}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadPdf(report)}>
                            <Download className="mr-1.5 h-3.5 w-3.5" />Download PDF
                          </Button>
                          {report.status === "draft" && (
                            <Button size="sm" onClick={() => updateMutation.mutate({ id: report.id, updates: { status: "published" } })} disabled={updateMutation.isPending}>
                              <Send className="mr-1.5 h-3.5 w-3.5" />Publish
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="concerns" className="space-y-4">
            {loadingFlags ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Analyzing patterns...</CardContent></Card>
            ) : concernFlags?.flags?.length > 0 ? (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className={`h-5 w-5 ${concernFlags.overallRiskLevel === "elevated" ? "text-destructive" : concernFlags.overallRiskLevel === "moderate" ? "text-[hsl(var(--role-teacher))]" : "text-muted-foreground"}`} />
                      <span className="font-semibold">Risk Level: {concernFlags.overallRiskLevel}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{concernFlags.summary}</p>
                  </CardContent>
                </Card>
                {concernFlags.flags.map((flag: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={
                          flag.severity === "high" ? "bg-destructive/15 text-destructive border-destructive/30" :
                          flag.severity === "medium" ? "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30" :
                          "bg-muted text-muted-foreground"
                        }>{flag.severity}</Badge>
                        <span className="font-medium text-sm">{flag.category}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{flag.evidenceCount} observations</span>
                      </div>
                      <p className="text-sm text-foreground/80 mb-2">{flag.description}</p>
                      <p className="text-xs text-primary">💡 {flag.suggestedAction}</p>
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No concern flags detected. 🎉</CardContent></Card>
            )}
            <p className="text-xs text-muted-foreground italic">⚠️ These flags are for teacher review only — they are never shared with parents.</p>
          </TabsContent>
        </Tabs>

        {/* Phase 5 — Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4" /> Booklet Preview — {studentName}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-muted/40 -mx-6 px-6 py-4">
              {previewContent && (
                <div className="flex justify-center">
                  <div className="shadow-lg" style={{ transform: "scale(0.85)", transformOrigin: "top center" }}>
                    <PtmBookletPrintView
                      data={{
                        studentName,
                        studentPhotoUrl: (student as any)?.photo_url || null,
                        className: (student as any)?.classes?.name || null,
                        teacherName: null,
                        meetingDate: null,
                        termName: previewContent.termName,
                        schoolName: (student as any)?.branches?.name,
                        schoolAddress: (student as any)?.branches?.address,
                        schoolPhone: (student as any)?.branches?.phone,
                        schoolEmail: (student as any)?.branches?.email,
                        logoUrl: branding.generalIcon || branding.teacherIcon || branding.parentIcon,
                        content: previewContent,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <div className="text-xs text-muted-foreground self-center">
                Return to the <strong>PTM Preparation</strong> section to make edits before publishing.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button
                  onClick={() => publishBookletMutation.mutate()}
                  disabled={!publishValidation.ok || publishBookletMutation.isPending}
                >
                  {publishBookletMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Publishing…</>
                  ) : (
                    <><PackageCheck className="mr-1.5 h-3.5 w-3.5" />Confirm & Publish</>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
