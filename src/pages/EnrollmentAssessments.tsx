import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ClipboardCheck, Loader2, ChevronDown, Brain, Lightbulb, Star, Printer, FileText, BookOpen, GraduationCap, Trash2, RefreshCw, UserPlus, AlertTriangle, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { BASELINE_DOMAINS, getBaselineDomainScores } from "@/lib/baseline-domains";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";

// Comprehensive checklists aligned with the CRM Pre-Enrolment Baseline
// (ASQ-3, EYFS Prime Areas, KSPK readiness). Grouped under the 4 score
// columns supported by baseline_assessments (motor / language /
// socio_emotional / cognitive). Motor combines gross + fine motor;
// cognitive includes self-help/independence indicators.
const MOTOR_CHECKLIST = [
  // Gross motor
  "Walks & runs confidently without falling",
  "Climbs stairs with alternating feet / handrail",
  "Jumps with both feet off the ground",
  "Throws and attempts to catch a ball",
  "Balances on one foot briefly",
  // Fine motor
  "Uses pincer grip to pick up small objects",
  "Holds a crayon / pencil purposefully",
  "Scribbles, draws lines or simple shapes",
  "Stacks blocks or completes simple puzzles",
  "Uses spoon / fork to feed self",
];

const LANGUAGE_CHECKLIST = [
  "Follows simple 1-2 step instructions",
  "Speaks in 2-4 word phrases / sentences",
  "Names familiar objects, people, body parts",
  "Asks questions (what / where / why)",
  "Listens attentively to a short story",
  "Engages in back-and-forth conversation",
];

const SOCIO_EMOTIONAL_CHECKLIST = [
  "Separates from parent without prolonged distress",
  "Plays alongside or with other children",
  "Shares toys / takes turns with support",
  "Expresses feelings with words or gestures",
  "Responds to and seeks comfort from familiar adults",
  "Manages transitions between activities",
];

const COGNITIVE_CHECKLIST = [
  // Cognitive & pre-academic
  "Sustains attention on an activity for 5+ minutes",
  "Matches or sorts by colour, shape or size",
  "Counts objects (1-5 or beyond)",
  "Recognises some letters / numbers / own name",
  "Engages in pretend / imaginative play",
  "Attempts to solve simple problems independently",
  // Self-help & independence
  "Toilet trained (or in progress)",
  "Washes hands with prompting",
  "Removes / puts on simple clothing or shoes",
  "Drinks from an open cup independently",
  "Helps tidy up toys when asked",
];

const METHODOLOGY_DESCRIPTIONS: Record<string, string> = {
  Montessori: "Self-directed, hands-on learning with multi-age classrooms and individualized pacing.",
  "Reggio Emilia": "Collaborative, project-based exploration guided by children's interests and creativity.",
  Waldorf: "Holistic, imagination-rich learning emphasizing arts, nature, and rhythm-based routines.",
  KP2026: "Malaysia's national KSPK curriculum focusing on balanced development across six tunjang (learning strands).",
};

function scoreFromChecklist(responses: boolean[]): number {
  const passed = responses.filter(Boolean).length;
  const total = responses.length;
  if (total === 0) return 1;
  return Math.max(1, Math.min(5, Math.round((passed / total) * 5)));
}

export default function EnrollmentAssessments() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusedStudentId = searchParams.get("student");
  const [assessDialog, setAssessDialog] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [motorChecks, setMotorChecks] = useState<boolean[]>(new Array(MOTOR_CHECKLIST.length).fill(false));
  const [langChecks, setLangChecks] = useState<boolean[]>(new Array(LANGUAGE_CHECKLIST.length).fill(false));
  const [socioChecks, setSocioChecks] = useState<boolean[]>(new Array(SOCIO_EMOTIONAL_CHECKLIST.length).fill(false));
  const [cogChecks, setCogChecks] = useState<boolean[]>(new Array(COGNITIVE_CHECKLIST.length).fill(false));
  const [teacherNotes, setTeacherNotes] = useState("");
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [reportDialog, setReportDialog] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [retryingAI, setRetryingAI] = useState(false);
  const [enrollClassId, setEnrollClassId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: memberBranches = [] } = useQuery({
    queryKey: ["my-branches", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("branch_memberships").select("branch_id").eq("user_id", user!.id);
      return data?.map((b: any) => b.branch_id) ?? [];
    },
    enabled: !!user,
  });

  const activeBranchId = memberBranches[0];
  const { teacherClassIds, isTeacher } = useTeacherClasses(activeBranchId);
  const teacherFilter = (s: any) => {
    if (!isTeacher) return true;
    if (!teacherClassIds || teacherClassIds.length === 0) return false;
    return s.class_id && teacherClassIds.includes(s.class_id);
  };

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["assessment-students", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, date_of_birth, gender, is_active, enrollment_date, current_methodology, class_id")
        .eq("branch_id", activeBranchId!)
        .order("enrollment_date", { ascending: false });
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["baseline-assessments", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select("*")
        .eq("branch_id", activeBranchId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ["methodology-recs", activeBranchId],
    queryFn: async () => {
      const studentIds = students.map((s: any) => s.id);
      if (!studentIds.length) return [];
      const { data } = await supabase
        .from("methodology_recommendations")
        .select("*")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: students.length > 0,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["branch-classes", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, age_group")
        .eq("branch_id", activeBranchId!)
        .eq("is_active", true)
        .order("class_name");
      return data ?? [];
    },
    enabled: !!activeBranchId,
  });

  // Fetch branch settings for logo
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings", activeBranchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_settings")
        .select("logo_url, school_display_name")
        .eq("branch_id", activeBranchId!)
        .single();
      return data;
    },
    enabled: !!activeBranchId,
  });

  const submitAssessment = useMutation({
    mutationFn: async (withAI: boolean) => {
      const student = assessDialog;
      const allChecklist = [
        ...MOTOR_CHECKLIST.map((item, i) => ({ category: "motor", item, passed: motorChecks[i] })),
        ...LANGUAGE_CHECKLIST.map((item, i) => ({ category: "language", item, passed: langChecks[i] })),
        ...SOCIO_EMOTIONAL_CHECKLIST.map((item, i) => ({ category: "socio_emotional", item, passed: socioChecks[i] })),
        ...COGNITIVE_CHECKLIST.map((item, i) => ({ category: "cognitive", item, passed: cogChecks[i] })),
      ];

      const { data: assessment, error } = await supabase
        .from("baseline_assessments")
        .insert({
          student_id: student.id,
          branch_id: activeBranchId,
          assessed_by: user!.id,
          motor_skills_score: scoreFromChecklist(motorChecks),
          language_score: scoreFromChecklist(langChecks),
          socio_emotional_score: scoreFromChecklist(socioChecks),
          cognitive_score: scoreFromChecklist(cogChecks),
          checklist_responses: allChecklist,
          teacher_notes: teacherNotes || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      if (!withAI) {
        return { assessment, aiResult: null, aiFailed: false, skippedAI: true };
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke("assess-methodology", {
        body: { assessment_id: assessment.id },
      });

      if (fnError) {
        console.error("AI function error:", fnError);
        return { assessment, aiResult: null, aiFailed: true, skippedAI: false };
      }

      return { assessment, aiResult: fnData, aiFailed: false, skippedAI: false };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["baseline-assessments"] });
      await queryClient.invalidateQueries({ queryKey: ["methodology-recs"] });
      
      const student = assessDialog;
      setAssessDialog(null);
      resetForm();

      if (result.skippedAI) {
        setAiError(false);
        setReportDialog({
          student,
          assessment: result.assessment,
          recommendation: null,
          skippedAI: true,
        });
        toast({ title: "Assessment saved ✅", description: "Scores recorded. You can get AI insights later." });
        return;
      }

      if (result.aiFailed) {
        setAiError(true);
        setReportDialog({
          student,
          assessment: result.assessment,
          recommendation: null,
        });
        toast({ title: "Assessment saved", description: "AI recommendation failed. You can retry from the report.", variant: "destructive" });
        return;
      }

      const recFromFn = result.aiResult?.recommendation;
      if (recFromFn) {
        setAiError(false);
        setReportDialog({
          student,
          assessment: result.assessment,
          recommendation: recFromFn,
        });
      } else {
        let rec = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const { data: latestRecs } = await supabase
            .from("methodology_recommendations")
            .select("*")
            .eq("student_id", student.id)
            .order("created_at", { ascending: false })
            .limit(1);
          if (latestRecs?.[0]) {
            rec = latestRecs[0];
            break;
          }
        }
        setAiError(!rec);
        setReportDialog({
          student,
          assessment: result.assessment,
          recommendation: rec,
        });
      }

      toast({ title: "Assessment Submitted ✅", description: recFromFn ? "AI insights are ready!" : "AI insights are being prepared..." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAssessmentMutation = useMutation({
    mutationFn: async (assessmentId: string) => {
      await supabase.from("methodology_recommendations").delete().eq("baseline_assessment_id", assessmentId);
      const { error } = await supabase.from("baseline_assessments").delete().eq("id", assessmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["baseline-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["methodology-recs"] });
      toast({ title: "Assessment deleted" });
    },
    onError: (e: any) => toast({ title: "Error deleting assessment", description: e.message, variant: "destructive" }),
  });

  const retryAI = async () => {
    if (!reportDialog?.assessment?.id) return;
    setRetryingAI(true);
    setAiError(false);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("assess-methodology", {
        body: { assessment_id: reportDialog.assessment.id },
      });
      if (fnError) throw fnError;
      
      await queryClient.invalidateQueries({ queryKey: ["methodology-recs"] });
      const rec = fnData?.recommendation;
      if (rec) {
        setReportDialog({ ...reportDialog, recommendation: rec, skippedAI: false });
        toast({ title: "AI recommendation ready ✅" });
      } else {
        const { data: latestRecs } = await supabase
          .from("methodology_recommendations")
          .select("*")
          .eq("baseline_assessment_id", reportDialog.assessment.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (latestRecs?.[0]) {
          setReportDialog({ ...reportDialog, recommendation: latestRecs[0], skippedAI: false });
          toast({ title: "AI recommendation ready ✅" });
        } else {
          setAiError(true);
          toast({ title: "AI still unavailable", description: "Please try again later.", variant: "destructive" });
        }
      }
    } catch (e: any) {
      setAiError(true);
      toast({ title: "AI retry failed", description: e.message, variant: "destructive" });
    } finally {
      setRetryingAI(false);
    }
  };

  const enrollStudent = async () => {
    if (!enrollClassId || !reportDialog) return;
    setEnrolling(true);
    try {
      const selectedClass = classes.find((c: any) => c.id === enrollClassId);
      const methodology = reportDialog.recommendation?.suggested_methodology || "KP2026";
      
      const { error } = await supabase
        .from("students")
        .update({
          class_id: enrollClassId,
          class_name: selectedClass?.class_name || "",
          current_methodology: methodology,
        } as any)
        .eq("id", reportDialog.student.id);
      
      if (error) throw error;

      if (reportDialog.recommendation?.id) {
        await supabase
          .from("methodology_recommendations")
          .update({ status: "accepted" } as any)
          .eq("id", reportDialog.recommendation.id);
      }

      await queryClient.invalidateQueries({ queryKey: ["assessment-students"] });
      await queryClient.invalidateQueries({ queryKey: ["methodology-recs"] });
      
      toast({ title: "Student enrolled ✅", description: `${reportDialog.student.first_name} assigned to ${selectedClass?.class_name} with ${methodology} methodology.` });
      setEnrollClassId("");
    } catch (e: any) {
      toast({ title: "Enrollment failed", description: e.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const resetForm = () => {
    setStep(0);
    setMotorChecks(new Array(MOTOR_CHECKLIST.length).fill(false));
    setLangChecks(new Array(LANGUAGE_CHECKLIST.length).fill(false));
    setSocioChecks(new Array(SOCIO_EMOTIONAL_CHECKLIST.length).fill(false));
    setCogChecks(new Array(COGNITIVE_CHECKLIST.length).fill(false));
    setTeacherNotes("");
  };

  const getStudentAssessments = (studentId: string) =>
    assessments.filter((a: any) => a.student_id === studentId);

  const getStudentRecommendation = (studentId: string) =>
    recommendations.find((r: any) => r.student_id === studentId && r.status === "pending");

  const openReport = async (student: any, assessment: any) => {
    const rec = recommendations.find((r: any) => r.baseline_assessment_id === assessment.id);
    setAiError(false);
    setReportDialog({ student, assessment, recommendation: rec || null });
  };

  const handleDownloadBlankForm = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Mirror the CRM Pre-enrolment baseline dialog: 9 KSPK-aligned
    // domains, each indicator rated 1 (emerging) → 5 (secure).
    const ratingBoxes = () =>
      [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid #9ca3af;border-radius:4px;font-size:10px;color:#6b7280;margin-right:4px;">${n}</span>`,
        )
        .join("");

    const renderDomain = (domain: typeof BASELINE_DOMAINS[number]) => `
      <div style="margin-bottom:18px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:6px;">
          <h3 style="font-size:13px;margin:0;color:#111827;">${domain.emoji} ${domain.label}</h3>
          <span style="font-size:10px;color:#9ca3af;">${domain.hint} · Avg: ___ / 5</span>
        </div>
        ${domain.indicators
          .map(
            (ind) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dotted #f0f0f0;">
            <span style="font-size:11px;flex:1;">${ind.label}</span>
            <span style="white-space:nowrap;">${ratingBoxes()}</span>
          </div>`,
          )
          .join("")}
      </div>
    `;

    const schoolName = branchSettings?.school_display_name || "School";
    const logoHtml = branchSettings?.logo_url
      ? `<img src="${branchSettings.logo_url}" style="height:50px;margin:0 auto 8px;" />`
      : "";

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Pre-enrolment Baseline Assessment</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #1a1a1a; max-width: 760px; margin: 0 auto; }
        @media print { body { padding: 12mm; } @page { margin: 10mm; } }
      </style></head><body>
      <div style="text-align:center;border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px;">
        ${logoHtml}
        <h1 style="font-size:18px;margin:0;">${schoolName}</h1>
        <h2 style="font-size:14px;font-weight:normal;color:#6b7280;margin:4px 0 0;">Pre-enrolment Baseline Assessment</h2>
        <p style="font-size:10px;color:#9ca3af;margin:6px 0 0;">Observe the child across 7 KSPK developmental domains. Circle each indicator <strong>1 (emerging)</strong> → <strong>5 (secure)</strong>. Aligned with ASQ-3, EYFS Prime Areas &amp; KSPK readiness benchmarks.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;font-size:12px;">
        <div><strong>Student Name:</strong> ____________________________</div>
        <div><strong>Date:</strong> ____________________________</div>
        <div><strong>Assessed By:</strong> ____________________________</div>
        <div><strong>DOB:</strong> ____________________________</div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:20px;background:#f9fafb;page-break-inside:avoid;">
        <h3 style="font-size:13px;margin:0 0 4px;color:#111827;">🏠 Child Context</h3>
        <p style="font-size:10px;color:#6b7280;margin:0 0 10px;">Home, interests, temperament &amp; flags — feeds the AI planner.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;">
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Languages spoken at home</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:30px;padding:4px;background:#fff;"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Prior schooling / playgroup</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:30px;padding:4px;background:#fff;"></div>
          </div>
          <div style="grid-column:span 2;">
            <div style="font-weight:600;margin-bottom:2px;">Interests &amp; passions</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:40px;padding:4px;background:#fff;"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Favourite activities</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:40px;padding:4px;background:#fff;"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Dislikes / triggers</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:40px;padding:4px;background:#fff;"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Temperament / personality</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:30px;padding:4px;background:#fff;"></div>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:2px;">Medical / allergies / flags</div>
            <div style="border:1px solid #d1d5db;border-radius:4px;min-height:30px;padding:4px;background:#fff;"></div>
          </div>
        </div>
      </div>
      ${BASELINE_DOMAINS.map(renderDomain).join("")}
      <div style="margin-top:20px;">
        <h3 style="font-size:14px;color:#374151;">📝 Teacher Notes & Observations</h3>
        <div style="border:1px solid #d1d5db;border-radius:4px;min-height:100px;padding:8px;margin-top:8px;"></div>
      </div>
      <p style="margin-top:24px;font-size:10px;color:#9ca3af;text-align:center;">Pass this completed form to the principal to enter into the e-Form so the AI Assessment Report can be generated. Generated on ${format(new Date(), "PPP")}</p>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrint = () => {
    if (!reportDialog) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const a = reportDialog.assessment;
    const s = reportDialog.student;
    const rec = reportDialog.recommendation;
    const schoolName = branchSettings?.school_display_name || "School";
    const logoUrl = branchSettings?.logo_url || "";
    const checklist = a.checklist_responses as any[] || [];
    const domainRows = getBaselineDomainScores(a);
    const indicatorMap = (a.indicators as Record<string, number> | undefined) || {};
    const hasRichIndicators = Object.keys(indicatorMap).length > 0;

    const domainPalette = ["#3b82f6","#22c55e","#a855f7","#f59e0b","#ef4444","#0ea5e9","#14b8a6","#ec4899","#8b5cf6"];

    const scoreBar = (label: string, score: number, color: string) => `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span>${label}</span><span style="font-weight:700;">${score ? score.toFixed(1) : "—"}/5</span>
        </div>
        <div style="background:#f3f4f6;border-radius:8px;height:10px;overflow:hidden;">
          <div style="width:${((Number(score)||0)/5)*100}%;height:100%;background:${color};border-radius:8px;"></div>
        </div>
      </div>
    `;

    // Rich (CRM) checklist details rendered per indicator with 1-5 dots
    const richDetails = hasRichIndicators
      ? `<h3 style="font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:20px 0 12px;">📋 Indicator Detail</h3>
         <div style="columns:2;column-gap:24px;">
           ${BASELINE_DOMAINS.map((d) => {
             const items = d.indicators
               .map((ind) => {
                 const v = indicatorMap[`${d.key}.${ind.key}`];
                 if (typeof v !== "number") return "";
                 const color = v >= 4 ? "#16a34a" : v >= 3 ? "#ca8a04" : "#dc2626";
                 return `<div style="font-size:11px;padding:2px 0;color:${color};">${v}/5 · ${ind.label}</div>`;
               })
               .filter(Boolean)
               .join("");
             if (!items) return "";
             return `<div style="break-inside:avoid;margin-bottom:10px;">
               <h4 style="font-size:12px;color:#6b7280;margin-bottom:4px;">${d.emoji} ${d.label}</h4>
               ${items}
             </div>`;
           }).join("")}
         </div>`
      : "";

    const checklistSection = (title: string, category: string) => {
      const items = checklist.filter((c: any) => c.category === category);
      if (!items.length) return "";
      return `<div style="margin-bottom:12px;">
        <h4 style="font-size:12px;color:#6b7280;margin-bottom:4px;">${title}</h4>
        ${items.map((c: any) => `<div style="font-size:11px;padding:2px 0;color:${c.passed ? '#16a34a' : '#dc2626'};">${c.passed ? '✓' : '✗'} ${c.item}</div>`).join("")}
      </div>`;
    };

    const legacyDetails = !hasRichIndicators && checklist.length
      ? `<h3 style="font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin:20px 0 12px;">📋 Checklist Details</h3>
         <div style="columns:2;column-gap:24px;">
           ${checklistSection("Motor Skills", "motor")}
           ${checklistSection("Language", "language")}
           ${checklistSection("Socio-Emotional", "socio_emotional")}
           ${checklistSection("Cognitive", "cognitive")}
         </div>`
      : "";

    const aiSection = rec ? `
      <div style="margin-top:24px;padding:16px;border:2px solid #3b82f6;border-radius:8px;background:#eff6ff;">
        <h3 style="font-size:15px;color:#1e40af;margin:0 0 12px;">🧠 AI Insights & Recommendations</h3>
        ${a.ai_detected_learning_style ? `<p style="font-size:12px;margin-bottom:8px;">Learning Style: <strong>${a.ai_detected_learning_style}</strong></p>` : ""}
        <div style="background:white;padding:12px;border-radius:6px;border-left:4px solid #3b82f6;margin-bottom:12px;">
          <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Recommended Methodology</p>
          <p style="font-size:16px;font-weight:700;color:#1e40af;margin:0;">${rec.suggested_methodology}</p>
          <p style="font-size:11px;color:#6b7280;font-style:italic;margin:4px 0 0;">${METHODOLOGY_DESCRIPTIONS[rec.suggested_methodology] || ""}</p>
        </div>
        <div style="background:white;padding:12px;border-radius:6px;margin-bottom:8px;">
          <p style="font-size:12px;color:#374151;">${rec.ai_reasoning}</p>
        </div>
        ${(rec as any).suggested_program ? `
          <div style="background:white;padding:12px;border-radius:6px;border-left:4px solid #22c55e;">
            <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Recommended Program</p>
            <p style="font-size:14px;font-weight:700;color:#166534;margin:0;">${(rec as any).suggested_program}</p>
            ${(rec as any).program_reasoning ? `<p style="font-size:11px;color:#374151;margin:4px 0 0;">${(rec as any).program_reasoning}</p>` : ""}
          </div>
        ` : ""}
      </div>
    ` : "";

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Assessment Report - ${s.first_name} ${s.last_name}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 750px; margin: 0 auto; color: #1a1a1a; }
        @media print { body { padding: 20px; } @page { margin: 15mm; } }
      </style></head><body>
      <div style="text-align:center;border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:24px;">
        ${logoUrl ? `<img src="${logoUrl}" style="height:60px;margin-bottom:8px;" />` : ""}
        <h1 style="font-size:20px;color:#1e40af;margin:0;">${schoolName}</h1>
        <h2 style="font-size:14px;font-weight:normal;color:#6b7280;margin:6px 0 0;">Child Development Assessment Report</h2>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f9fafb;padding:14px;border-radius:8px;font-size:12px;margin-bottom:20px;">
        <div><strong>Student:</strong> ${s.first_name} ${s.last_name}</div>
        <div><strong>Gender:</strong> ${s.gender || "—"}</div>
        <div><strong>DOB:</strong> ${s.date_of_birth || "—"}</div>
        <div><strong>Assessment Date:</strong> ${format(new Date(a.created_at), "dd MMMM yyyy")}</div>
      </div>

      <h3 style="font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:12px;">📊 Development Scores</h3>
      ${domainRows.map((r, i) => scoreBar(`${r.emoji} ${r.label}`, r.score, domainPalette[i % domainPalette.length])).join("")}

      ${richDetails}
      ${legacyDetails}

      ${a.teacher_notes ? `
        <div style="margin-top:16px;background:#fefce8;padding:12px;border-radius:6px;border-left:4px solid #eab308;">
          <p style="font-size:11px;color:#92400e;margin:0 0 4px;font-weight:600;">Teacher Notes</p>
          <p style="font-size:12px;margin:0;">${a.teacher_notes}</p>
        </div>
      ` : ""}

      ${aiSection}

      <div style="margin-top:32px;padding-top:16px;border-top:2px solid #e5e7eb;text-align:center;">
        <p style="font-size:10px;color:#9ca3af;margin:0;">${schoolName} • Generated on ${format(new Date(), "PPP 'at' p")}</p>
        <p style="font-size:9px;color:#d1d5db;margin:4px 0 0;">This report is computer-generated and does not require a signature.</p>
      </div>
      </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  // Split students: pre-enrollment (no class) vs enrolled (has class)
  // Teachers don't see pre-enrollment (those students aren't assigned to any class yet)
  const preEnrollmentStudents = isTeacher ? [] : students.filter((s: any) => !s.class_id);
  const enrolledStudents = students.filter((s: any) => s.class_id).filter(teacherFilter);

  const sortedStudents = [...preEnrollmentStudents].sort((a: any, b: any) => {
    const aHas = assessments.some((as: any) => as.student_id === a.id);
    const bHas = assessments.some((as: any) => as.student_id === b.id);
    if (!aHas && bHas) return -1;
    if (aHas && !bHas) return 1;
    return 0;
  });

  const enrolledWithAssessments = enrolledStudents.filter((s: any) =>
    assessments.some((a: any) => a.student_id === s.id)
  );

  const [showCompleted, setShowCompleted] = useState(false);

  // If routed with ?student=<id>, auto-expand that student's row
  useEffect(() => {
    if (focusedStudentId) {
      setExpandedStudent(focusedStudentId);
      // smooth scroll into view shortly after render
      const t = setTimeout(() => {
        const el = document.getElementById(`student-row-${focusedStudentId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [focusedStudentId]);

  const steps = [
    { title: "Motor Skills", icon: "🤸", checklist: MOTOR_CHECKLIST, checks: motorChecks, setChecks: setMotorChecks },
    { title: "Language", icon: "🗣️", checklist: LANGUAGE_CHECKLIST, checks: langChecks, setChecks: setLangChecks },
    { title: "Socio-Emotional", icon: "🤝", checklist: SOCIO_EMOTIONAL_CHECKLIST, checks: socioChecks, setChecks: setSocioChecks },
    { title: "Cognitive", icon: "🧩", checklist: COGNITIVE_CHECKLIST, checks: cogChecks, setChecks: setCogChecks },
    { title: "Teacher Notes", icon: "📝", checklist: [], checks: [], setChecks: () => {} },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              Admissions Assessment Library
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pre-enrolment and initial baseline assessments only. Ongoing teacher assessments for enrolled children live on each Child Profile › Assessments tab.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadBlankForm} className="gap-1">
            <Download className="h-4 w-4" /> Assessment Form
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading students...
          </div>
        ) : isTeacher ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pre-Enrollment Students</CardTitle>
              <CardDescription>Students pending class assignment. Already-enrolled students' assessments are in the "Completed" section below.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Enrollment Date</TableHead>
                    <TableHead>Methodology</TableHead>
                    <TableHead>Assessments</TableHead>
                    <TableHead>AI Insight</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.map((student: any) => {
                    const stuAssessments = getStudentAssessments(student.id);
                    const pendingRec = getStudentRecommendation(student.id);
                    const isExpanded = expandedStudent === student.id;
                    const hasNoAssessment = stuAssessments.length === 0;

                    return (
                      <Collapsible key={student.id} open={isExpanded} onOpenChange={() => setExpandedStudent(isExpanded ? null : student.id)} asChild>
                        <>
                          <TableRow
                            id={`student-row-${student.id}`}
                            className={`cursor-pointer hover:bg-muted/50 ${hasNoAssessment ? "bg-amber-50/50 dark:bg-amber-950/10" : ""} ${focusedStudentId === student.id ? "ring-2 ring-primary ring-offset-1" : ""}`}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {student.first_name} {student.last_name}
                                {hasNoAssessment && (
                                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-400">
                                    New
                                  </Badge>
                                )}
                              </div>
                              {student.date_of_birth && (
                                <span className="text-xs text-muted-foreground">
                                  DOB: {student.date_of_birth}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {student.enrollment_date || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {(student as any).current_methodology || "KP2026"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-xs gap-1">
                                  {stuAssessments.length} assessment{stuAssessments.length !== 1 ? "s" : ""}
                                  <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                </Button>
                              </CollapsibleTrigger>
                            </TableCell>
                            <TableCell>
                              {pendingRec && (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs gap-1">
                                  <Lightbulb className="h-3 w-3" />
                                  {pendingRec.suggested_methodology}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setAssessDialog(student); resetForm(); }}
                                className="text-xs gap-1"
                              >
                                <ClipboardCheck className="h-3 w-3" /> Start Assessment
                              </Button>
                            </TableCell>
                          </TableRow>
                          <CollapsibleContent asChild>
                            <TableRow>
                              <TableCell colSpan={6} className="bg-muted/30 p-4">
                                {stuAssessments.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-2">No assessments yet</p>
                                ) : (
                                  <div className="space-y-3">
                                    {stuAssessments.map((a: any) => {
                                      const rec = recommendations.find((r: any) => r.baseline_assessment_id === a.id);
                                      return (
                                        <Card key={a.id} className="border-border/50">
                                          <CardContent className="p-4">
                                            <div className="flex items-start justify-between gap-4">
                                              <div className="space-y-2 flex-1">
                                                <div className="flex items-center gap-3 text-sm">
                                                  <span className="font-medium">
                                                    {format(new Date(a.created_at), "dd MMM yyyy")}
                                                  </span>
                                                  {a.ai_detected_learning_style && (
                                                    <Badge variant="secondary" className="text-xs gap-1">
                                                      <Brain className="h-3 w-3" />
                                                      {a.ai_detected_learning_style}
                                                    </Badge>
                                                  )}
                                                </div>
                                                <div className="grid grid-cols-4 gap-3">
                                                  {[
                                                    { label: "Motor", score: a.motor_skills_score },
                                                    { label: "Language", score: a.language_score },
                                                    { label: "Socio-Emo", score: a.socio_emotional_score },
                                                    { label: "Cognitive", score: a.cognitive_score },
                                                  ].map((s) => (
                                                    <div key={s.label} className="space-y-1">
                                                      <div className="flex justify-between text-xs text-muted-foreground">
                                                        <span>{s.label}</span>
                                                        <span>{s.score}/5</span>
                                                      </div>
                                                      <Progress value={(s.score / 5) * 100} className="h-1.5" />
                                                    </div>
                                                  ))}
                                                </div>
                                                {a.teacher_notes && (
                                                  <p className="text-xs text-muted-foreground italic">"{a.teacher_notes}"</p>
                                                )}
                                              </div>
                                              <div className="flex flex-col gap-2 items-end min-w-[160px]">
                                                {rec && (
                                                  <div className="text-right space-y-1">
                                                    <Badge
                                                      variant={rec.status === "accepted" ? "default" : rec.status === "rejected" ? "destructive" : "secondary"}
                                                      className="text-xs"
                                                    >
                                                      {rec.suggested_methodology}
                                                    </Badge>
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{rec.ai_reasoning}</p>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-xs gap-1"
                                                    onClick={() => openReport(student, a)}
                                                  >
                                                    <FileText className="h-3 w-3" /> View Report
                                                  </Button>
                                                  <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                      <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-xs text-destructive hover:text-destructive h-8 w-8 p-0"
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                      </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Assessment</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                          This will permanently delete this assessment and its AI recommendation. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                          onClick={() => deleteAssessmentMutation.mutate(a.id)}
                                                        >
                                                          Delete
                                                        </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                  </AlertDialog>
                                                </div>
                                              </div>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      );
                                    })}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Completed Assessments (Enrolled Students) */}
        {enrolledWithAssessments.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="cursor-pointer" onClick={() => setShowCompleted(!showCompleted)}>
              <CardTitle className="text-base flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 transition-transform ${showCompleted ? "rotate-180" : ""}`} />
                Completed Assessments ({enrolledWithAssessments.length} enrolled students)
              </CardTitle>
            </CardHeader>
            {showCompleted && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Methodology</TableHead>
                      <TableHead>Assessments</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrolledWithAssessments.map((student: any) => {
                      const stuAssessments = getStudentAssessments(student.id);
                      const latestAssessment = stuAssessments[0];
                      return (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium">{student.first_name} {student.last_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{student.class_name || "—"}</Badge></TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{student.current_methodology || "KP2026"}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{stuAssessments.length} assessment{stuAssessments.length !== 1 ? "s" : ""}</TableCell>
                          <TableCell>
                            {latestAssessment && (
                              <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openReport(student, latestAssessment)}>
                                <FileText className="h-3 w-3" /> View Report
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      {/* Assessment Dialog - Step by Step */}
      <Dialog open={!!assessDialog} onOpenChange={() => { setAssessDialog(null); resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Assess: {assessDialog?.first_name} {assessDialog?.last_name}
            </DialogTitle>
            <DialogDescription>
              Step {step + 1} of {steps.length}: {steps[step]?.icon} {steps[step]?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>

          <div className="space-y-4 py-2">
            {step < 4 ? (
              <div className="space-y-3">
                {steps[step].checklist.map((item, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={steps[step].checks[idx]}
                      onChange={() => {
                        const newChecks = [...steps[step].checks];
                        newChecks[idx] = !newChecks[idx];
                        steps[step].setChecks(newChecks);
                      }}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{item}</span>
                    {steps[step].checks[idx] && <Star className="h-3.5 w-3.5 text-amber-500 ml-auto" />}
                  </label>
                ))}
                <div className="pt-2 text-center">
                  <Badge variant="outline" className="text-xs">
                    Score: {scoreFromChecklist(steps[step].checks)}/5
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Label>Teacher Observations & Notes</Label>
                <Textarea
                  placeholder="Add any observations about the child's behavior, interests, learning tendencies, or areas of concern..."
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  rows={5}
                />
                <Card className="bg-muted/50 border-border/50">
                  <CardContent className="p-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Assessment Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>🤸 Motor: <strong>{scoreFromChecklist(motorChecks)}/5</strong></div>
                      <div>🗣️ Language: <strong>{scoreFromChecklist(langChecks)}/5</strong></div>
                      <div>🤝 Socio-Emo: <strong>{scoreFromChecklist(socioChecks)}/5</strong></div>
                      <div>🧩 Cognitive: <strong>{scoreFromChecklist(cogChecks)}/5</strong></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => step > 0 && setStep(step - 1)}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => submitAssessment.mutate(false)}
                  disabled={submitAssessment.isPending}
                >
                  {submitAssessment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Submit
                </Button>
                <Button
                  onClick={() => submitAssessment.mutate(true)}
                  disabled={submitAssessment.isPending}
                  className="gap-1"
                >
                  {submitAssessment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <Brain className="h-4 w-4" />
                  Submit & Get AI Insight
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assessment Report Dialog */}
      <Dialog open={!!reportDialog} onOpenChange={() => { setReportDialog(null); setAiError(false); setEnrollClassId(""); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Assessment Report
            </DialogTitle>
            <DialogDescription>
              Baseline development assessment {reportDialog?.recommendation ? "& AI recommendation" : ""}
            </DialogDescription>
          </DialogHeader>

          {reportDialog && (
            <div ref={reportRef}>
              <div className="header text-center border-b pb-4 mb-4">
                <h1 className="text-xl font-bold text-foreground">Child Development Assessment Report</h1>
                <p className="text-sm text-muted-foreground">
                  {reportDialog.student.first_name} {reportDialog.student.last_name}
                  {reportDialog.student.date_of_birth && ` • DOB: ${reportDialog.student.date_of_birth}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Assessment Date: {format(new Date(reportDialog.assessment.created_at), "dd MMMM yyyy")}
                </p>
              </div>

              {/* Scores */}
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" /> Development Scores
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {getBaselineDomainScores(reportDialog.assessment).map((s) => (
                    <Card key={s.key} className="border-border/50">
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground mb-1">{s.emoji} {s.label}</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-foreground">{s.score ? s.score.toFixed(1) : "—"}</span>
                          <span className="text-sm text-muted-foreground mb-0.5">/5</span>
                        </div>
                        <Progress value={((Number(s.score) || 0) / 5) * 100} className="h-2 mt-2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Per-indicator detail when rich CRM data is available */}
                {reportDialog.assessment.indicators && Object.keys(reportDialog.assessment.indicators).length > 0 && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Indicator detail</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {BASELINE_DOMAINS.map((d) => {
                        const rows = d.indicators
                          .map((ind) => {
                            const v = (reportDialog.assessment.indicators as any)[`${d.key}.${ind.key}`];
                            if (typeof v !== "number") return null;
                            const tone = v >= 4 ? "text-emerald-600 dark:text-emerald-400" : v >= 3 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                            return (
                              <div key={ind.key} className={`text-[11px] ${tone}`}>
                                {v}/5 · {ind.label}
                              </div>
                            );
                          })
                          .filter(Boolean);
                        if (!rows.length) return null;
                        return (
                          <div key={d.key} className="break-inside-avoid mb-2">
                            <div className="text-[11px] font-medium text-foreground mb-1">{d.emoji} {d.label}</div>
                            {rows}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {reportDialog.assessment.teacher_notes && (
                  <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-primary/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Teacher Notes</p>
                    <p className="text-sm text-foreground">{reportDialog.assessment.teacher_notes}</p>
                  </div>
                )}
              </div>

              <Separator className="my-5" />

              {/* AI Recommendation */}
              {reportDialog.recommendation ? (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Brain className="h-4 w-4" /> AI Insights & Recommendations
                  </h2>

                  {reportDialog.assessment.ai_detected_learning_style && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Detected Learning Style:</span>
                      <Badge variant="secondary" className="capitalize">
                        {reportDialog.assessment.ai_detected_learning_style}
                      </Badge>
                    </div>
                  )}

                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">Recommended Methodology</span>
                      </div>
                      <Badge className="text-sm px-3 py-1">{reportDialog.recommendation.suggested_methodology}</Badge>
                      <p className="text-xs text-muted-foreground italic">
                        {METHODOLOGY_DESCRIPTIONS[reportDialog.recommendation.suggested_methodology] || ""}
                      </p>
                      <div className="bg-background rounded-md p-3 border-l-4 border-primary mt-2">
                        <p className="text-sm text-foreground">{reportDialog.recommendation.ai_reasoning}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {(reportDialog.recommendation as any).suggested_program && (
                    <Card className="border-accent/20 bg-accent/5">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-accent-foreground" />
                          <span className="text-sm font-medium text-foreground">Recommended Program</span>
                        </div>
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                          {(reportDialog.recommendation as any).suggested_program}
                        </Badge>
                        <div className="bg-background rounded-md p-3 border-l-4 border-accent mt-2">
                          <p className="text-sm text-foreground">{(reportDialog.recommendation as any).program_reasoning}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Separator className="my-4" />

                  {/* Enroll into Class */}
                  <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-foreground">Enroll Student into Class</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Assign this student to a class and apply the recommended methodology ({reportDialog.recommendation.suggested_methodology}).
                      </p>
                      <div className="flex items-center gap-2">
                        <Select value={enrollClassId} onValueChange={setEnrollClassId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a class" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.class_name} ({c.age_group})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={enrollStudent}
                          disabled={!enrollClassId || enrolling}
                          className="gap-1"
                        >
                          {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                          Enroll
                        </Button>
                      </div>
                      {classes.length === 0 && (
                        <p className="text-xs text-muted-foreground">No classes found. Create classes in the Students module first.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : reportDialog.skippedAI ? (
                <div className="text-center py-6">
                  <ClipboardCheck className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-sm font-medium text-foreground mb-1">Assessment saved without AI insight</p>
                  <p className="text-xs text-muted-foreground mb-3">You can get AI recommendations anytime by clicking the button below.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={retryAI}
                    disabled={retryingAI}
                  >
                    {retryingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    Get AI Insight
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  {aiError ? (
                    <>
                      <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
                      <p className="text-sm font-medium text-foreground mb-1">AI recommendation failed</p>
                      <p className="text-xs text-muted-foreground mb-3">The AI service was unable to generate a recommendation. You can retry or close this report.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={retryAI}
                        disabled={retryingAI}
                      >
                        {retryingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Retry AI Analysis
                      </Button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">AI recommendation is still being generated...</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1"
                        onClick={async () => {
                          const { data: latestRecs } = await supabase
                            .from("methodology_recommendations")
                            .select("*")
                            .eq("baseline_assessment_id", reportDialog.assessment.id)
                            .order("created_at", { ascending: false })
                            .limit(1);
                          if (latestRecs?.[0]) {
                            setReportDialog({ ...reportDialog, recommendation: latestRecs[0] });
                          } else {
                            setAiError(true);
                          }
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => { setReportDialog(null); setAiError(false); setEnrollClassId(""); }}>Close</Button>
            <Button onClick={handlePrint} className="gap-1">
              <Printer className="h-4 w-4" /> Print Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
