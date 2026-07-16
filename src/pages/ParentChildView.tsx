import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, TrendingUp, GraduationCap, BookOpen, Heart, Save, Loader2, ChevronLeft, ChevronRight, Thermometer, ClipboardCheck, Link2, Clock, Sparkles, PartyPopper, DollarSign, ChevronDown, ChevronUp, CheckCircle2, Circle, Phone, Users, Home, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import ParentOnboardingWizard from "@/components/ParentOnboardingWizard";
import { MomentsFeed } from "@/components/daily-updates/MomentsFeed";
import { UpdateDetailDialog } from "@/components/daily-updates/UpdateDetailDialog";
import ObservationEvidence from "@/components/parent/ObservationEvidence";
import { PickupChangeCard } from "@/components/parent/PickupChangeCard";
import { DevelopmentWheel } from "@/components/parent/DevelopmentWheel";
import {
  ParentProfileBlock,
  ParentNotificationsBlock,
  ParentSecurityBlock,
} from "@/components/parent/ParentAccountSettings";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  useWeeklyLessonContext,
  buildGrowingNextText,
  ParentWeeklyAtHomeCard,
  ParentTeacherNextFocusCard,
  ParentEvidenceStrip,
} from "@/components/parent/ParentLessonContextCards";
import { useChildNextFocus, useChildFocusEvidenceCount } from "@/hooks/use-child-next-focus";
import { useCatalogueDomainTotals, useCatalogueObjectivesByIds } from "@/lib/objective-catalogue";

const proficiencyColors: Record<string, string> = {
  TP1: "bg-destructive/15 text-destructive border-destructive/30",
  TP2: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  TP3: "bg-accent/15 text-accent border-accent/30",
  not_yet: "bg-muted text-muted-foreground border-muted-foreground/30",
  emerging: "bg-destructive/15 text-destructive border-destructive/30",
  developing: "bg-[hsl(var(--role-teacher))]/15 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30",
  consistent: "bg-accent/15 text-accent border-accent/30",
  secure: "bg-accent/15 text-accent border-accent/30",
};

const proficiencyLabel: Record<string, string> = {
  TP1: "🌱 Building",
  TP2: "🌿 Growing",
  TP3: "🌳 Confident",
  not_yet: "Not Yet",
  emerging: "🌱 Building",
  developing: "🌿 Growing",
  consistent: "🌳 Confident",
  secure: "🌳 Secure",
};

const proficiencyValue: Record<string, number> = {
  TP1: 1, TP2: 2, TP3: 3,
  not_yet: 0, emerging: 1, developing: 2, consistent: 3, secure: 3,
};

export default function ParentChildView({ mode }: { mode?: "journey" | "today" | "progress" | "account" } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const momentParam = searchParams.get("moment");
  const [openMomentId, setOpenMomentId] = useState<string | null>(null);
  useEffect(() => {
    if (momentParam) setOpenMomentId(momentParam);
  }, [momentParam]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  // Map URL mode → internal tab id. Default landing page is the Journey feed.
  const modeToTab: Record<string, string> = {
    journey: "portfolio",
    today: "today",
    progress: "progress",
    account: "profile",
  };
  const lockedTab = mode ? modeToTab[mode] : undefined;
  const [activeTab, setActiveTab] = useState(lockedTab ?? "portfolio");
  // When the route changes (mode prop changes), keep the active tab in sync.
  if (lockedTab && lockedTab !== activeTab) {
    setActiveTab(lockedTab);
  }
  const singleMode = !!lockedTab;
  const [checkInMonth, setCheckInMonth] = useState(new Date());
  const [healthForm, setHealthForm] = useState<Record<string, any>>({});
  const [healthInitialized, setHealthInitialized] = useState<string | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [progressView, setProgressView] = useState<"assessed" | "not-assessed">("assessed");
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [expandedStandard, setExpandedStandard] = useState<string | null>(null);

  // Get parent's profile
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Get parent's children with status
  const { data: childLinks, isLoading: loadingChildren } = useQuery({
    queryKey: ["my-children-links", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parent_students")
        .select("id, student_id, status, students(id, first_name, last_name, date_of_birth, gender, allergies, medical_conditions, emergency_contact_name, emergency_contact_phone, dietary_notes, blood_type, home_address, branch_id, class_id, classes:class_id(id, class_name), father_name, father_ic, father_phone, father_occupation, mother_name, mother_ic, mother_phone, mother_occupation, emergency_contact_relation)")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const children = childLinks?.filter((l: any) => l.status === "approved").map((l: any) => l.students).filter(Boolean) ?? [];
  const pendingLinks = childLinks?.filter((l: any) => l.status === "pending") ?? [];

  // Check PDPA consent
  const { data: consents, isLoading: loadingConsents } = useQuery({
    queryKey: ["pdpa-consents", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("pdpa_consents" as any).select("*").eq("parent_user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  // Determine if onboarding is needed.
  // IMPORTANT: only evaluate once profile + consents have actually loaded,
  // otherwise the wizard flashes for already-onboarded parents (consents
  // is `undefined` on first render and `(undefined)?.length === 0` is true).
  // Legacy 2-step wizard has been superseded by the 4-step
  // ParentFirstRunOnboarding gate at /parent-onboarding (enforced in
  // ProtectedRoute). Keep the variable as `false` so this view never
  // pre-empts the new flow.
  const onboardingDataReady = !!profile && !loadingConsents && consents !== undefined;
  const needsOnboarding = false;
  void onboardingDataReady;

  const childId = selectedChild || children?.[0]?.id;
  const child = children?.find((c: any) => c.id === childId);

  if (child && healthInitialized !== childId) {
    setHealthForm({
      allergies: child.allergies ?? "",
      medical_conditions: child.medical_conditions ?? "",
      emergency_contact_name: child.emergency_contact_name ?? "",
      emergency_contact_phone: child.emergency_contact_phone ?? "",
      dietary_notes: child.dietary_notes ?? "",
      blood_type: child.blood_type ?? "",
      home_address: (child as any).home_address ?? "",
      emergency_contact_relation: (child as any).emergency_contact_relation ?? "",
      father_name: (child as any).father_name ?? "",
      father_ic: (child as any).father_ic ?? "",
      father_phone: (child as any).father_phone ?? "",
      father_occupation: (child as any).father_occupation ?? "",
      mother_name: (child as any).mother_name ?? "",
      mother_ic: (child as any).mother_ic ?? "",
      mother_phone: (child as any).mother_phone ?? "",
      mother_occupation: (child as any).mother_occupation ?? "",
    });
    setHealthInitialized(childId!);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Progress data — new pipeline reading from child_update_skills (the merged
  // "Learning Moment" tags). The legacy student_observations / learning_areas /
  // curriculum_standards pipeline is no longer populated after the merge.
  //   - 7 rings = 7 development_domains
  //   - denominator per ring = development_outcomes for the child's age_profile
  //   - numerator per ring = distinct indicators tagged on this child in that domain
  // ──────────────────────────────────────────────────────────────────────────
  const { data: domains } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase
        .from("development_domains")
        .select("id, code, name, sort_order")
        .order("sort_order");
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === "portfolio" || activeTab === "progress",
  });

  // Resolve the age profile that matches the child's current age in years.
  const childAgeYears = (() => {
    if (!child?.date_of_birth) return null;
    const dob = new Date(child.date_of_birth as any);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
    return years;
  })();

  const { data: ageProfile } = useQuery({
    queryKey: ["age-profile-for-child", childAgeYears],
    queryFn: async () => {
      if (childAgeYears == null) return null;
      // age_profiles.age_group is an integer (3..6). Clamp to nearest available.
      const clamped = Math.max(3, Math.min(6, childAgeYears));
      const { data } = await supabase
        .from("age_profiles")
        .select("id, age_group, stage_name")
        .eq("age_group", clamped)
        .maybeSingle();
      return data;
    },
    enabled: childAgeYears != null && (activeTab === "portfolio" || activeTab === "progress"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: domainOutcomes } = useQuery({
    queryKey: ["domain-outcomes", ageProfile?.id],
    queryFn: async () => {
      let query = supabase
        .from("development_outcomes")
        .select("id, domain_id, outcome_code, outcome_title, outcome_description, age_profile_id");
      if (ageProfile?.id) {
        query = query.eq("age_profile_id", ageProfile.id);
      }
      const { data } = await query;
      return data ?? [];
    },
    enabled: activeTab === "portfolio" || activeTab === "progress",
    staleTime: 10 * 60 * 1000,
  });

  // Batch 6B-3 — prefer Objective Catalogue denominator when seeded for this
  // age. Falls back silently to development_outcomes when catalogue is empty.
  const { data: catalogueTotals } = useCatalogueDomainTotals(
    (activeTab === "portfolio" || activeTab === "progress") ? (ageProfile?.id ?? null) : null,
  );

  // All skill tags for this child, joined to the parent learning-moment row
  // (for date, caption, photo evidence, and visibility).
  const { data: skillAssessments } = useQuery({
    queryKey: ["child-skill-assessments", childId],
    queryFn: async () => {
      // Two-step fetch — more robust than PostgREST's foreign-table .or() filter,
      // which silently dropped skill rows whose joined moment used student_id
      // (single-child) instead of the group join table. This is the root cause
      // of the "0 of 18" Progress Wheel bug in Batch 6C smoke test.
      // Step 1: collect every parent-visible update_id linked to this child,
      //         either directly (student_id) or via child_update_students.
      const [directRes, groupRes] = await Promise.all([
        supabase
          .from("child_updates")
          .select("id, student_id, activity_date, caption, teacher_note, parent_summary, ai_learning_story, visible_to_parent, created_by, child_update_media(url, kind, thumbnail_url, sort_order)")
          .eq("student_id", childId!)
          .eq("visible_to_parent", true)
          .order("activity_date", { ascending: false })
          .limit(500),
        supabase
          .from("child_update_students")
          .select("update_id, child_updates!inner(id, student_id, activity_date, caption, teacher_note, parent_summary, ai_learning_story, visible_to_parent, created_by, child_update_media(url, kind, thumbnail_url, sort_order))")
          .eq("student_id", childId!)
          .eq("child_updates.visible_to_parent", true)
          .limit(500),
      ]);
      const updateById = new Map<string, any>();
      (directRes.data ?? []).forEach((u: any) => updateById.set(u.id, u));
      (groupRes.data ?? []).forEach((row: any) => {
        const u = row.child_updates;
        if (u && !updateById.has(u.id)) updateById.set(u.id, u);
      });
      const updateIds = Array.from(updateById.keys());
      if (!updateIds.length) return [];

      // Step 2: fetch every skill row attached to those updates.
      const { data: skillRows } = await supabase
        .from("child_update_skills")
        .select("id, update_id, domain_id, indicator_id, indicator_label, proficiency_level, created_at, curriculum_objective_id, curriculum_indicator_id")
        .in("update_id", updateIds)
        .limit(2000);
      const rows = (skillRows ?? []).map((s: any) => ({
        ...s,
        child_updates: updateById.get(s.update_id) ?? null,
      })).filter((r: any) => r.child_updates);
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("debugProgress")) {
        const groupedCounts = rows.reduce((acc: Record<string, number>, s: any) => {
          if (!s.domain_id) return acc;
          const key = s.indicator_id || `lbl:${(s.indicator_label || "").toLowerCase().trim()}`;
          if (!key || key === "lbl:") return acc;
          const bucket = `${s.domain_id}::${key}`;
          acc[bucket] = 1;
          return acc;
        }, {});
        console.debug("[progress-debug] child skill fetch", {
          childId,
          visibleUpdateIds: updateIds,
          skillRows: rows.map(({ child_updates, ...s }: any) => s),
          groupedSkillCounts: Object.entries(groupedCounts).reduce((acc: Record<string, number>, [bucket]) => {
            const domainId = bucket.split("::")[0];
            acc[domainId] = (acc[domainId] ?? 0) + 1;
            return acc;
          }, {}),
        });
      }
      // Hydrate teacher names for observer attribution.
      const teacherIds = Array.from(new Set(rows.map((r: any) => r.child_updates?.created_by).filter(Boolean)));
      let nameById = new Map<string, string>();
      if (teacherIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", teacherIds);
        nameById = new Map((profs ?? []).map((p: any) => [
          p.id,
          `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        ]));
      }
      return rows.map((r: any) => ({
        ...r,
        _teacher_name: nameById.get(r.child_updates?.created_by) || null,
      }));
    },
    enabled: !!childId && (activeTab === "portfolio" || activeTab === "progress"),
    staleTime: 60 * 1000,
  });

  // Phase 4 — baseline assessment as a fallback so the Development Wheel
  // isn't blank on day 1. The intake assessor scores 4 broad areas (1-5);
  // we map each to its development_domain and surface it as a synthetic
  // "skill assessed" entry until the teacher tags real learning moments.
  const { data: baselineRow } = useQuery({
    queryKey: ["child-baseline", childId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select(
          "id, date_evaluated, motor_skills_score, language_score, socio_emotional_score, cognitive_score, domain_scores",
        )
        .eq("student_id", childId!)
        .order("date_evaluated", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!childId && (activeTab === "portfolio" || activeTab === "progress"),
    staleTime: 10 * 60 * 1000,
  });

  // Batch 6E — Assessment Insight needs both earliest and latest baseline rows.
  const { data: allAssessments } = useQuery({
    queryKey: ["child-baseline-history", childId],
    queryFn: async () => {
      const { data } = await supabase
        .from("baseline_assessments")
        .select(
          "id, date_evaluated, motor_skills_score, language_score, socio_emotional_score, cognitive_score, domain_scores, teacher_notes",
        )
        .eq("student_id", childId!)
        .order("date_evaluated", { ascending: true });
      return data ?? [];
    },
    enabled: !!childId && activeTab === "progress",
    staleTime: 10 * 60 * 1000,
  });

  // Batch 6D — Child Progress Engine Lite.
  // Rollup query for Strengths / Growing next sections. Additive — the
  // Development Wheel still computes from `skillAssessments` so existing
  // counts (e.g. 3/18) do not regress while the rollup table seeds.
  const { data: skillProgressRollup } = useQuery({
    queryKey: ["child-skill-progress", childId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("child_skill_progress")
        .select("id, domain_id, indicator_id, indicator_label, current_status, evidence_count, last_observed_at")
        .eq("student_id", childId!)
        .order("last_observed_at", { ascending: false })
        .limit(200);
      return (data ?? []) as Array<{
        id: string; domain_id: string | null; indicator_id: string | null;
        indicator_label: string; current_status: string;
        evidence_count: number; last_observed_at: string;
      }>;
    },
    enabled: !!childId && activeTab === "progress",
    staleTime: 30 * 1000,
  });

  // Map baseline column → development_domain.code. Adjusted to current 7-domain taxonomy.
  const BASELINE_DOMAIN_CODE: Record<string, string> = {
    motor_skills_score: "PM",
    language_score: "CL",
    socio_emotional_score: "SE",
    cognitive_score: "NT",
  };
  // Convert a 1-5 baseline score into the 3-level proficiency we use everywhere else.
  const scoreToProficiency = (n: number | null | undefined): "emerging" | "developing" | "consistent" | null => {
    if (n == null) return null;
    if (n <= 2) return "emerging";
    if (n === 3) return "developing";
    return "consistent";
  };

  // Fee summary
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
      const lastPaid = invoices.find((i: any) => i.status === "paid");
      const nextDue = invoices.find((i: any) => ["issued", "partial", "overdue"].includes(i.status));
      return { outstanding, overdue, lastPaid, nextDue, total: invoices.length };
    },
    enabled: !!childId,
    staleTime: 60 * 1000,
  });

  const monthStart = format(startOfMonth(checkInMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(checkInMonth), "yyyy-MM-dd");
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["child-attendance", childId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", childId!)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false });
      return data ?? [];
    },
    enabled: !!childId && (activeTab === "today" || activeTab === "portfolio"),
    staleTime: 60 * 1000,
  });

  // Build per-domain summary from the merged learning-moment skill tags.
  // Identity for "skill assessed" = indicator_id when present, else indicator_label.
  const domainSummary = (domains ?? []).map((d: any) => {
    const domainOutcomesList = (domainOutcomes ?? []).filter((o: any) => o.domain_id === d.id);
    const domainSkills = (skillAssessments ?? []).filter((s: any) => s.domain_id === d.id);
    const latestBySkill = new Map<string, any>();
    const allBySkill = new Map<string, any[]>();
    domainSkills.forEach((s: any) => {
      // Batch 6B-4 — when the teacher tagged a catalogue objective, dedupe
      // by objective so multiple indicators under one objective count once.
      // Fall back to legacy indicator_id, then label.
      const key = s.curriculum_objective_id
        ? `obj:${s.curriculum_objective_id}`
        : (s.indicator_id || `lbl:${(s.indicator_label || "").toLowerCase().trim()}`);
      if (!key) return;
      const when = s.child_updates?.activity_date || s.created_at;
      const prev = latestBySkill.get(key);
      const prevWhen = prev ? (prev.child_updates?.activity_date || prev.created_at) : null;
      if (!prev || (when && prevWhen && when > prevWhen)) {
        latestBySkill.set(key, s);
      }
      const list = allBySkill.get(key) ?? [];
      list.push(s);
      allBySkill.set(key, list);
    });

    // Phase 4 — merge baseline assessment as a synthetic entry per domain so
    // brand-new children show a starting point on the wheel. Only added if
    // the teacher hasn't already tagged a real moment for this domain.
    let baselineApplied = false;
    if (baselineRow && latestBySkill.size === 0) {
      const colForCode = Object.entries(BASELINE_DOMAIN_CODE).find(([, code]) => code === d.code)?.[0];
      if (colForCode) {
        const score = (baselineRow as any)[colForCode] as number | null;
        const prof = scoreToProficiency(score);
        if (prof) {
          const synthetic = {
            id: `baseline:${baselineRow.id}:${d.code}`,
            domain_id: d.id,
            indicator_id: null,
            indicator_label: "Intake baseline assessment",
            proficiency_level: prof,
            created_at: baselineRow.date_evaluated,
            child_updates: {
              activity_date: baselineRow.date_evaluated,
              caption: "Starting point recorded during onboarding.",
              child_update_media: [],
              child_update_students: [{ student_id: childId }],
              visible_to_parent: true,
            },
            _teacher_name: null,
            _from_baseline: true,
          };
          latestBySkill.set(`baseline:${d.code}`, synthetic);
          allBySkill.set(`baseline:${d.code}`, [synthetic]);
          baselineApplied = true;
        }
      }
    }

    const assessed = latestBySkill.size;
    // Denominator: number of outcomes for this domain (age-scoped).
    // Fallback to assessed count if no outcomes seeded, so the ring still draws.
    // Batch 6B-3 — prefer Objective Catalogue count when seeded; fall back to
    // legacy development_outcomes; finally fall back to assessed so the ring
    // still draws when neither source is populated.
    const catalogueCount = catalogueTotals?.byDomain?.get(d.id) ?? 0;
    const total =
      catalogueCount ||
      domainOutcomesList.length ||
      Math.max(assessed, 1);
    // Cap so the wheel never shows e.g. 9/7 when teachers tag more free-text
    // indicators than catalogue objectives.
    const cappedAssessed = Math.min(assessed, total);
    const avgScore = assessed > 0
      ? Array.from(latestBySkill.values())
          .reduce((sum, s: any) => sum + (proficiencyValue[s.proficiency_level] || 0), 0) / assessed
      : 0;
    return { domain: d, assessed: cappedAssessed, total, avgScore, latestBySkill, allBySkill, domainOutcomes: domainOutcomesList, baselineApplied };
  });

  const totalAssessed = domainSummary.reduce((s, a) => s + a.assessed, 0);
  const totalStandards = domainSummary.reduce((s, a) => s + a.total, 0);

  // Batch 6B-5 — hydrate parent-friendly wording for any mapped objectives
  // surfaced in the domain detail panel. We collect every distinct
  // curriculum_objective_id observed across this child's skill rows and
  // fetch parent_title / parent_description in one query.
  const observedObjectiveIds = Array.from(new Set(
    (skillAssessments ?? [])
      .map((s: any) => s.curriculum_objective_id)
      .filter(Boolean) as string[],
  ));
  const { data: catalogueWordingMap } = useCatalogueObjectivesByIds(observedObjectiveIds);

  // Batch 6F — weekly lesson context for the child's class. Drives the
  // "This Week's Learning at Home" card and enriches Growing-next copy.
  const { data: weeklyCtx } = useWeeklyLessonContext((child as any)?.class_id);
  const { data: approvedFocus } = useChildNextFocus(childId, { parentVisibleOnly: true });
  const { data: focusEvidenceCount } = useChildFocusEvidenceCount(approvedFocus?.id ?? null);
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("debugProgress") && childId) {
    console.debug("[progress-debug] wheel payload", {
      childId,
      totalAssessed,
      totalStandards,
      areas: domainSummary.map(({ domain, assessed, total, avgScore }: any) => ({
        id: domain.id,
        code: domain.code,
        name: domain.name,
        assessed,
        total,
        avgScore,
      })),
    });
  }

  // Link child mutation
  const linkChildMutation = useMutation({
    mutationFn: async (code: string) => {
      const { data: student, error: lookupErr } = await (supabase
        .from("students")
        .select("id") as any)
        .eq("student_access_code", code.toUpperCase().trim())
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!student) throw new Error("No student found with that access code. Please check and try again.");
      const { error } = await supabase.from("parent_students").insert({
        parent_id: user!.id,
        student_id: student.id,
        status: "pending",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-children-links"] });
      setShowLinkDialog(false);
      setAccessCode("");
      toast({ title: "Request submitted! ⏳", description: "Your child's teacher will review and approve the connection." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveHealthMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("students")
        .update({
          allergies: healthForm.allergies || null,
          medical_conditions: healthForm.medical_conditions || null,
          emergency_contact_name: healthForm.emergency_contact_name || null,
          emergency_contact_phone: healthForm.emergency_contact_phone || null,
          dietary_notes: healthForm.dietary_notes || null,
          blood_type: healthForm.blood_type || null,
          home_address: healthForm.home_address || null,
          emergency_contact_relation: healthForm.emergency_contact_relation || null,
          father_name: healthForm.father_name || null,
          father_ic: healthForm.father_ic || null,
          father_phone: healthForm.father_phone || null,
          father_occupation: healthForm.father_occupation || null,
          mother_name: healthForm.mother_name || null,
          mother_ic: healthForm.mother_ic || null,
          mother_phone: healthForm.mother_phone || null,
          mother_occupation: healthForm.mother_occupation || null,
        } as any)
        .eq("id", childId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-children-links"] });
      toast({ title: "Health info updated", description: "Your child's details have been saved." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (loadingChildren) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  // Show onboarding wizard
  if (needsOnboarding) {
    return (
      <DashboardLayout>
        <ParentOnboardingWizard
          children={children}
          profile={profile}
          onComplete={() => {
            setOnboardingComplete(true);
            queryClient.invalidateQueries({ queryKey: ["my-profile"] });
            queryClient.invalidateQueries({ queryKey: ["pdpa-consents"] });
          }}
        />
      </DashboardLayout>
    );
  }

  // Empty state — no children linked
  if (!children?.length) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <GraduationCap className="h-14 w-14 text-muted-foreground/30" />
          <div className="text-center space-y-1">
            <h2 className="font-semibold text-foreground">No Children Linked</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Connect your child using the access code provided by their teacher, or wait for an invitation email.
            </p>
          </div>

          {pendingLinks.length > 0 && (
            <div className="space-y-2 w-full max-w-sm">
              {pendingLinks.map((pl: any) => (
                <div key={pl.id} className="flex items-center gap-2 rounded-lg border p-3 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">
                    {pl.students?.first_name} {pl.students?.last_name}
                  </span>
                  <Badge variant="outline" className="ml-auto text-xs text-yellow-700">Pending Approval</Badge>
                </div>
              ))}
            </div>
          )}

          <Button onClick={() => setShowLinkDialog(true)} className="mt-2">
            <Link2 className="h-4 w-4 mr-2" /> Connect Your Child
          </Button>

          <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Connect Your Child</DialogTitle>
                <DialogDescription>Enter the 6-digit access code provided by your child's teacher.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Label>Student Access Code</Label>
                <Input
                  placeholder="e.g. A1B2C3"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase().slice(0, 6))}
                  className="font-mono text-center text-xl tracking-widest"
                  maxLength={6}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => accessCode.length === 6 && linkChildMutation.mutate(accessCode)}
                  disabled={accessCode.length !== 6 || linkChildMutation.isPending}
                >
                  {linkChildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Submit Request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  const isJourneyMode = mode === undefined || mode === "journey";
  // Hero carousel (with child + fees summary) only on Journey & Today.
  // Progress should focus on the developmental wheel only — no fees here.
  const isHeroMode = mode === undefined || mode === "journey" || mode === "today";
  const headerBlock = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          {mode === "today" ? (<><Clock className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Daily Check-In</>) :
           mode === "progress" ? (<><TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Progress</>) :
           mode === "account" ? (<><Heart className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Account & Profile</>) :
           (<><Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> Learning Journey</>)}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {mode === "today" ? "Pickup changes and recent attendance check-ins." :
           mode === "progress" ? "Domain-by-domain assessment overview." :
           mode === "account" ? "Your details, family info, security and notifications." :
           "Today's stories, photos and skills your child explored."}
        </p>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {mode === "account" && headerBlock}

        {children.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {children.map((c: any) => (
              <Badge
                key={c.id}
                variant={childId === c.id ? "default" : "outline"}
                className="cursor-pointer text-sm px-3 py-1"
                onClick={() => { setSelectedChild(c.id); setHealthInitialized(null); }}
              >
                {c.first_name} {c.last_name}
              </Badge>
            ))}
          </div>
        )}

        {/* Hero/Fees carousel removed — already shown on Home (/) to avoid duplication. */}
        {isHeroMode && headerBlock}

        {/* IA: Journey first — that's what parents come for.
            When the page is opened on a dedicated route (/check-in, /progress, /account)
            we lock to a single section and hide the tab strip — the bottom nav handles
            navigation between sections instead. */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full grid-cols-3 h-auto ${singleMode ? "hidden" : ""}`}>
            <TabsTrigger value="portfolio" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Journey</span>
            </TabsTrigger>
            <TabsTrigger value="today" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <Clock className="h-3.5 w-3.5" />
              <span>Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="progress" className="flex items-center gap-1 text-[11px] sm:text-sm py-2">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Progress</span>
            </TabsTrigger>
          </TabsList>

          {/* TODAY = Schedule + Daily Check-In */}
          <TabsContent value="today" className="space-y-4">
            {/* Pickup change is the most useful action parents need on the Today tab */}
            {childId && (child as any)?.branch_id && (
              <PickupChangeCard
                studentId={childId}
                branchId={(child as any).branch_id}
                studentName={child?.first_name}
              />
            )}

            <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Daily Check-In
              </h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCheckInMonth(subMonths(checkInMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs sm:text-sm font-medium min-w-[100px] sm:min-w-[120px] text-center">{format(checkInMonth, "MMM yyyy")}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCheckInMonth(addMonths(checkInMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {attendanceRecords.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No attendance records for this month.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {attendanceRecords.map((rec: any) => {
                  const temp = rec.temperature ? Number(rec.temperature) : null;
                  const hasFever = temp !== null && temp >= 37.5;
                  const isUnwell = rec.health_status === "unwell" || rec.health_status === "injured";
                  const moodEmoji: Record<string, string> = { happy: "😊", neutral: "😐", sad: "😢", angry: "😠", tired: "😴", excited: "🤩" };

                  return (
                    <Card key={rec.id} className={`${hasFever || isUnwell ? "border-destructive/50 bg-destructive/5" : ""}`}>
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{format(new Date(rec.date), "EEE, d MMM yyyy")}</span>
                              <Badge variant={rec.status === "present" ? "default" : rec.status === "absent" ? "destructive" : "secondary"} className="capitalize text-xs">
                                {rec.status}
                              </Badge>
                              {rec.mood && <span className="text-lg" title={rec.mood}>{moodEmoji[rec.mood] ?? "😐"}</span>}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {temp !== null && (
                                <span className={`flex items-center gap-1 ${hasFever ? "text-destructive font-medium" : ""}`}>
                                  <Thermometer className="h-3 w-3" />
                                  {temp}°C {hasFever && "⚠️"}
                                </span>
                              )}
                              {rec.health_status && rec.health_status !== "healthy" && (
                                <Badge variant="outline" className="text-xs border-destructive/30 text-destructive capitalize">{rec.health_status}</Badge>
                              )}
                              {rec.has_medication && (
                                <Badge variant="outline" className="text-xs">💊 Medication</Badge>
                              )}
                            </div>
                            {rec.body_marks && <p className="text-xs text-muted-foreground"><span className="font-medium">Body marks:</span> {rec.body_marks}</p>}
                            {rec.medication_notes && <p className="text-xs text-muted-foreground"><span className="font-medium">Medication:</span> {rec.medication_notes}</p>}
                            {rec.health_notes && <p className="text-xs text-muted-foreground"><span className="font-medium">Health notes:</span> {rec.health_notes}</p>}
                            {rec.notes && <p className="text-xs text-foreground/80"><span className="font-medium">Teacher notes:</span> {rec.notes}</p>}
                          </div>
                          {rec.arrival_photo_url && (
                            <img src={rec.arrival_photo_url} alt="Arrival" className="h-16 w-16 rounded-lg object-cover border" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            </div>
          </TabsContent>

          {/* JOURNEY = Moments feed (parents' main view) */}
          <TabsContent value="portfolio" className="space-y-4">
            <div className="max-w-[640px] mx-auto w-full space-y-4">
              {childId && <WhatWereLearningCard classId={(child as any)?.class_id} />}
              {childId && <MomentsFeed studentId={childId} parentVisibleOnly />}
            </div>
          </TabsContent>

          {/* PROGRESS = Domain-by-domain assessment overview */}
          <TabsContent value="progress" className="space-y-4">
            {domainSummary.length > 0 && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Development Wheel
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        A visual map of skills your teacher has tagged across all
                        {childAgeYears != null ? ` age-${childAgeYears} ` : " "}
                        developmental domains.
                      </p>
                      {totalStandards > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          <span className="font-medium text-foreground">{totalAssessed} of {totalStandards}</span> learning objectives have recent evidence, tracked across <span className="font-medium text-foreground">{domainSummary.length} developmental {domainSummary.length === 1 ? "area" : "areas"}</span> — your teacher will keep adding more as the term unfolds.
                        </p>
                      )}
                    </div>
                  </div>
                  <DevelopmentWheel
                    areas={domainSummary.map(({ domain, assessed, total, avgScore }: any) => ({
                      id: domain.id,
                      code: domain.code,
                      name: domain.name,
                      assessed,
                      total,
                      avgScore,
                    }))}
                    size={280}
                  />
                </CardContent>
              </Card>
            )}
            {/* Batch 6E — Assessment Insight (baseline → latest trend). Renders only when
                a baseline assessment exists; uses domain_scores or legacy columns. */}
            {(() => {
              const list = (allAssessments ?? []) as any[];
              if (!list.length) return null;
              const first = list[0];
              const latest = list[list.length - 1];
              const scoreMap = (row: any) => {
                const ds = (row?.domain_scores && typeof row.domain_scores === "object") ? row.domain_scores : {};
                const out: Record<string, number> = {};
                for (const [k, v] of Object.entries(ds)) if (typeof v === "number") out[k] = v;
                if (!Object.keys(out).length) {
                  if (typeof row?.motor_skills_score === "number")    out.PM = row.motor_skills_score;
                  if (typeof row?.language_score === "number")        out.CL = row.language_score;
                  if (typeof row?.socio_emotional_score === "number") out.SE = row.socio_emotional_score;
                  if (typeof row?.cognitive_score === "number")       out.NT = row.cognitive_score;
                }
                return out;
              };
              const f = scoreMap(first);
              const l = scoreMap(latest);
              const codeName = (c: string) =>
                (domains ?? []).find((d: any) => d.code === c)?.name ?? c;
              const latestRanked = Object.entries(l).sort((a, b) => b[1] - a[1]);
              const strongest = latestRanked[0]?.[0];
              const deltas = Object.keys(l)
                .map((k) => ({ k, d: (l[k] ?? 0) - (f[k] ?? 0) }))
                .sort((a, b) => b.d - a.d);
              const growing = deltas.find((x) => x.d > 0)?.k;
              const supportFocus = latestRanked[latestRanked.length - 1]?.[0];
              const childFirst = child?.first_name ?? "Your child";
              return (
                <Card className="border-primary/20 bg-primary/[0.03]">
                  <CardContent className="p-4 space-y-1.5">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> Assessment Insight
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      First assessment: {first.date_evaluated} · Latest: {latest.date_evaluated}
                    </p>
                    {growing ? (
                      <p className="text-xs text-foreground/90">
                        Since the first assessment, <span className="font-medium">{childFirst}</span> is
                        showing growth in <span className="font-medium">{codeName(growing)}</span>.
                      </p>
                    ) : list.length > 1 ? (
                      <p className="text-xs text-foreground/90">
                        <span className="font-medium">{childFirst}</span> is building a steady rhythm across all areas.
                      </p>
                    ) : (
                      <p className="text-xs text-foreground/90">
                        Baseline captured — teachers will watch for growth in the next assessment.
                      </p>
                    )}
                    {strongest && (
                      <p className="text-[11px] text-muted-foreground">
                        Strongest right now: <span className="font-medium text-foreground/85">{codeName(strongest)}</span>
                        {supportFocus && supportFocus !== strongest && (
                          <> · Teacher is gently supporting: <span className="font-medium text-foreground/85">{codeName(supportFocus)}</span></>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
            {/* Batch 6D — parent-friendly rollup sections (Strengths / Growing / Try-at-home).
                Batch 6E — Try-at-home now always renders with domain-based fallbacks. */}
            {(() => {
              const rollup = skillProgressRollup ?? [];
              const domainName = (id: string | null) =>
                (domains ?? []).find((d: any) => d.id === id)?.name ?? "Development";
              const secure = rollup.filter((r) => r.current_status === "secure");
              const developing = rollup.filter((r) => r.current_status === "developing");
              const strengths = (secure.length ? secure : developing).slice(0, 3);
              const growing = rollup
                .filter((r) => r.current_status === "not_yet" || r.current_status === "emerging")
                .slice(0, 3);
              const childFirst = child?.first_name ?? "Your child";
              // Domains needing more support if rollup is empty: use domains with 0 assessed.
              const lowDomains = (domainSummary ?? [])
                .filter((a: any) => a.assessed === 0)
                .slice(0, 3);
              const HOME_TIPS: Record<string, string> = {
                CL: "Chat about your day at dinner — invite full sentences.",
                EL: "Read one short book together and point to familiar words.",
                NT: "Count toys, steps or snacks together during routines.",
                PM: "Try a quick hop, jump or balance game in the living room.",
                SE: "Name a feeling you each felt today and why.",
                CD: "Offer crayons or playdough and ask what they're making.",
                VC: "Practise please / thank you / sorry in a small role-play.",
              };
              const tipFor = (domainId: string | null) => {
                const code = (domains ?? []).find((d: any) => d.id === domainId)?.code as string | undefined;
                return code ? HOME_TIPS[code] ?? `Talk about ${domainName(domainId).toLowerCase()} during play today.`
                            : "Spend a few minutes in focused play together today.";
              };
              const tipForCode = (code: string | undefined, nm: string) =>
                code && HOME_TIPS[code] ? HOME_TIPS[code] : `Talk about ${nm.toLowerCase()} during play today.`;
              const homeTips: { key: string; text: string }[] = [];
              if (growing.length) {
                growing.forEach((r) => homeTips.push({ key: `g-${r.id}`, text: tipFor(r.domain_id) }));
              } else if (lowDomains.length) {
                lowDomains.forEach((a: any) => homeTips.push({ key: `d-${a.domain.id}`, text: tipForCode(a.domain.code, a.domain.name) }));
              } else {
                ["CL", "SE", "PM"].forEach((c) => homeTips.push({ key: `f-${c}`, text: HOME_TIPS[c] }));
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Strengths observed
                      </h4>
                      {strengths.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Teachers are still gathering evidence — every learning moment will start to shape {childFirst}'s strengths here.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {strengths.map((r) => (
                            <li key={r.id} className="text-xs">
                              <div className="font-medium text-foreground line-clamp-2">
                                {childFirst} is showing confidence in <span className="text-primary">{r.indicator_label}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {domainName(r.domain_id)}
                                {r.last_observed_at ? ` · last seen ${format(new Date(r.last_observed_at), "d MMM")}` : ""}
                                {r.evidence_count ? ` · ${r.evidence_count} moment${r.evidence_count === 1 ? "" : "s"}` : ""}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" /> Growing next
                      </h4>
                      {(() => {
                        const weeklyLine = buildGrowingNextText(
                          childFirst,
                          weeklyCtx ?? null,
                          lowDomains.map((a: any) => a.domain.name),
                        );
                        if (growing.length === 0) {
                          return (
                            <p className="text-xs text-muted-foreground">
                              {weeklyLine ?? "Lots of confident skills — keep going!"}
                            </p>
                          );
                        }
                        return (
                          <>
                            {weeklyLine && (
                              <p className="text-xs text-foreground/85">{weeklyLine}</p>
                            )}
                            <ul className="space-y-2">
                              {growing.map((r) => (
                                <li key={r.id} className="text-xs">
                                  <div className="font-medium text-foreground line-clamp-2">
                                    Teacher is supporting <span className="text-primary">{r.indicator_label}</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {domainName(r.domain_id)}
                                    {r.evidence_count ? ` · ${r.evidence_count} moment${r.evidence_count === 1 ? "" : "s"}` : " · gathering evidence"}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                  <ParentWeeklyAtHomeCard childFirst={childFirst} ctx={weeklyCtx ?? null} />
                </div>
              );
            })()}
            {/* Batch 6F — Teacher's Next Focus + Evidence strip */}
            {(() => {
              const rollup = skillProgressRollup ?? [];
              const growing = rollup
                .filter((r) => r.current_status === "not_yet" || r.current_status === "emerging")
                .slice(0, 3)
                .map((r) => ({ label: r.indicator_label, domain: r.domain_id }));
              const lowDomainNames = (domainSummary ?? [])
                .filter((a: any) => a.assessed === 0)
                .slice(0, 3)
                .map((a: any) => a.domain.name);
              const childFirst = child?.first_name ?? "Your child";
              const domName = (id: string | null) =>
                (domains ?? []).find((d: any) => d.id === id)?.name ?? "Development";
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ParentTeacherNextFocusCard
                    childFirst={childFirst}
                    ctx={weeklyCtx ?? null}
                    growingSkills={growing}
                    lowDomainNames={lowDomainNames}
                    approvedFocus={approvedFocus ?? null}
                    evidenceCount={focusEvidenceCount ?? 0}
                  />
                  <ParentEvidenceStrip
                    skillAssessments={skillAssessments as any[]}
                    domainName={domName}
                    onOpenMoment={(updateId) => setOpenMomentId(updateId)}
                  />
                </div>
              );
            })()}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Progress by Domain
              </h3>
            <div className="flex items-center gap-2">
              <Button
                variant={progressView === "assessed" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setProgressView("assessed")}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Observed ({domainSummary.filter(a => a.assessed > 0).length})
              </Button>
              <Button
                variant={progressView === "not-assessed" ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setProgressView("not-assessed")}
              >
                <Circle className="h-3 w-3 mr-1" />
                Growing Next ({domainSummary.filter(a => a.assessed === 0).length})
              </Button>
            </div>
            {progressView === "not-assessed" && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                "Growing next" simply means we are still collecting evidence for this area — not a sign your child is behind.
              </p>
            )}

            {progressView === "assessed" ? (
              <div className="space-y-3">
                {domainSummary.filter(a => a.assessed > 0).length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No observed skills yet. Once your child's teacher tags learning
                      moments, progress will appear here.
                    </CardContent>
                  </Card>
                ) : (
                  domainSummary.filter(a => a.assessed > 0).map(({ domain, assessed, total, avgScore, latestBySkill, allBySkill, baselineApplied }) => (
                    <Card
                      key={domain.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setExpandedArea(expandedArea === domain.id ? null : domain.id)}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">{domain.name}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{assessed}/{total}</Badge>
                            {baselineApplied && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">Baseline</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {avgScore > 0 && (
                              <Badge className={`text-[10px] ${avgScore >= 2.5 ? proficiencyColors.TP3 : avgScore >= 1.5 ? proficiencyColors.TP2 : proficiencyColors.TP1}`}>
                                {avgScore >= 2.5 ? proficiencyLabel.TP3 : avgScore >= 1.5 ? proficiencyLabel.TP2 : proficiencyLabel.TP1}
                              </Badge>
                            )}
                            {expandedArea === domain.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {baselineApplied
                            ? "Starting point from onboarding — your teacher will add more learning moments here soon."
                            : `${assessed} skill${assessed === 1 ? "" : "s"} observed this term`}
                        </p>
                        <Progress value={total > 0 ? (assessed / total) * 100 : 0} className="h-1.5" />

                        {expandedArea === domain.id && (
                          <div className="mt-3 pt-3 border-t space-y-1.5">
                            {(() => {
                              const entries = Array.from(latestBySkill.entries()) as Array<[string, any]>;
                              const mapped = entries.filter(([k]) => k.startsWith("obj:"));
                              const custom = entries.filter(([k]) => !k.startsWith("obj:"));
                              return [
                                ...mapped.map(([k, v]) => ({ key: k, latest: v, kind: "mapped" as const })),
                                ...(custom.length ? [{ kind: "divider" as const, key: "__divider__", latest: null }] : []),
                                ...custom.map(([k, v]) => ({ key: k, latest: v, kind: "custom" as const })),
                              ];
                            })().map((row: any) => {
                              if (row.kind === "divider") {
                                return (
                                  <p key="__custom-divider__" className="pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Additional observations
                                  </p>
                                );
                              }
                              const key = row.key;
                              const latest = row.latest;
                              const isOpen = expandedStandard === `${domain.id}:${key}`;
                              const all = (allBySkill?.get(key) ?? [latest])
                                .slice()
                                .sort((a: any, b: any) => {
                                  const ad = a.child_updates?.activity_date || a.created_at;
                                  const bd = b.child_updates?.activity_date || b.created_at;
                                  return ad < bd ? 1 : -1;
                                });
                              // Batch 6B-5 — when the row is mapped to a catalogue
                              // objective, show the warm parent_title (and parent
                              // description when expanded). Fall back to the legacy
                              // indicator label safely.
                              const mapped = latest.curriculum_objective_id
                                ? catalogueWordingMap?.get(latest.curriculum_objective_id)
                                : undefined;
                              const label =
                                (mapped?.parent_title?.trim()) ||
                                latest.indicator_label ||
                                "Skill observed";
                              const parentDescription = mapped?.parent_description?.trim() || null;
                              const evidenceCount = all.length;
                              return (
                                <div key={key} className="text-xs">
                                  <button
                                    type="button"
                                    className="w-full flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded px-1 -mx-1 text-left"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedStandard(isOpen ? null : `${domain.id}:${key}`);
                                    }}
                                  >
                                    <span className="flex-1 truncate text-foreground/90">{label}</span>
                                    {evidenceCount > 1 && (
                                      <Badge variant="secondary" className="text-[10px] shrink-0">
                                        {evidenceCount} moments
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className={`text-[10px] ${proficiencyColors[latest.proficiency_level] || ""}`}>
                                      {proficiencyLabel[latest.proficiency_level] || latest.proficiency_level}
                                    </Badge>
                                    {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </button>
                                  {isOpen && (
                                    <div className="pl-2 pr-1 pb-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                      {parentDescription && (
                                        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                                          {parentDescription}
                                        </p>
                                      )}
                                      <ObservationEvidence
                                        observations={all.map((s: any) => {
                                          const u = s.child_updates || {};
                                          const media = (u.child_update_media ?? [])
                                            .slice()
                                            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                                          const first = media[0];
                                          return {
                                            id: s.id,
                                            observed_at: u.activity_date || s.created_at,
                                            notes: u.teacher_note || u.caption || u.parent_summary || null,
                                            ai_learning_story: u.ai_learning_story || null,
                                            media_url: first?.url || null,
                                            evidence_url: null,
                                            proficiency_level: s.proficiency_level,
                                            observer_name: s._teacher_name,
                                            media: media.map((m: any) => ({
                                              media_url: m.url,
                                              media_type: m.kind,
                                              caption: m.caption,
                                              sort_order: m.sort_order,
                                            })),
                                          };
                                        })}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {domainSummary.filter(a => a.assessed === 0).length === 0 ? (
                  <Card className="bg-accent/5 border-accent/20">
                    <CardContent className="py-8 text-center">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-accent mb-2" />
                      <p className="text-sm font-medium text-foreground">Every domain has at least one learning moment! 🎉</p>
                    </CardContent>
                  </Card>
                ) : (
                  domainSummary.filter(a => a.assessed === 0).map(({ domain, total }) => (
                    <Card key={domain.id} className="border-dashed">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center gap-2">
                          <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{domain.name}</p>
                            <p className="text-xs text-muted-foreground">Waiting for your teacher's first learning moment in this area.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
            </div>
          </TabsContent>

          {/* PROFILE = Health & Family Details */}
          <TabsContent value="profile" className="space-y-4">
            {children.length > 1 && child && (
              <p className="text-xs text-muted-foreground">
                Family info for: <span className="font-medium text-foreground">{child.first_name} {child.last_name}</span>
              </p>
            )}
            <Accordion type="single" collapsible defaultValue="about-you" className="w-full">
              <AccordionItem value="about-you">
                <AccordionTrigger className="text-sm font-semibold">
                  About You
                </AccordionTrigger>
                <AccordionContent>
                  <ParentProfileBlock />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="security">
                <AccordionTrigger className="text-sm font-semibold">
                  Password &amp; Security
                </AccordionTrigger>
                <AccordionContent>
                  <ParentSecurityBlock />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="family">
                <AccordionTrigger className="text-sm font-semibold">
                  Family &amp; Care for {child?.first_name ?? "your child"}
                </AccordionTrigger>
                <AccordionContent>
                <form onSubmit={(e) => { e.preventDefault(); saveHealthMutation.mutate(); }} className="space-y-4 pb-24">
                  {/* Intro / guidance */}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex gap-2.5">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs text-foreground/80 leading-relaxed">
                      <p className="font-medium text-primary mb-0.5">Keep these details current</p>
                      <p>Teachers rely on this information to keep <span className="font-medium">{child?.first_name ?? "your child"}</span> safe — especially in an emergency. Update anything that changes (allergies, phones, addresses) and tap <span className="font-medium">Save changes</span> at the bottom.</p>
                    </div>
                  </div>

                  {/* Health & Medical */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Heart className="h-4 w-4 text-destructive" /> Health & Medical
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Anything school must know to keep your child safe.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Allergies</Label>
                          <Textarea placeholder="e.g. Peanuts, shellfish, dust..." value={healthForm.allergies ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, allergies: e.target.value }))} rows={3} />
                          <p className="text-[11px] text-muted-foreground">List anything school must avoid serving or exposing.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Medical Conditions</Label>
                          <Textarea placeholder="e.g. Asthma, eczema..." value={healthForm.medical_conditions ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, medical_conditions: e.target.value }))} rows={3} />
                          <p className="text-[11px] text-muted-foreground">Ongoing conditions, medications or care plans.</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Dietary Notes</Label>
                          <Input placeholder="e.g. Halal only, vegetarian..." value={healthForm.dietary_notes ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, dietary_notes: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Blood Type</Label>
                          <Input placeholder="e.g. A+, B-, O+..." value={healthForm.blood_type ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, blood_type: e.target.value }))} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Emergency Contact */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-warning" /> Emergency Contact
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Someone <span className="font-medium">other than the parents</span> we can call if you cannot be reached.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Contact Name</Label>
                          <Input placeholder="e.g. Grandparent's name..." value={healthForm.emergency_contact_name ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, emergency_contact_name: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Contact Phone</Label>
                          <Input placeholder="+60 12-345 6789" value={healthForm.emergency_contact_phone ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, emergency_contact_phone: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Relation to Child</Label>
                        <Input placeholder="e.g. Grandmother, Aunt, Family friend" value={healthForm.emergency_contact_relation ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, emergency_contact_relation: e.target.value }))} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Parents / Guardians */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" /> Parents / Guardians
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Primary contacts. Used for daily communication, billing and pickup verification.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        {/* Father */}
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">F</span>
                            Father / Bapa
                          </p>
                          <div className="space-y-2.5">
                            <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input value={healthForm.father_name ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, father_name: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs">IC / Passport No.</Label><Input value={healthForm.father_ic ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, father_ic: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label><Input placeholder="+60 12-345 6789" value={healthForm.father_phone ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, father_phone: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs">Occupation</Label><Input value={healthForm.father_occupation ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, father_occupation: e.target.value }))} /></div>
                          </div>
                        </div>
                        {/* Mother */}
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent text-[10px] font-bold">M</span>
                            Mother / Ibu
                          </p>
                          <div className="space-y-2.5">
                            <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input value={healthForm.mother_name ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, mother_name: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs">IC / Passport No.</Label><Input value={healthForm.mother_ic ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, mother_ic: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label><Input placeholder="+60 12-345 6789" value={healthForm.mother_phone ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, mother_phone: e.target.value }))} /></div>
                            <div className="space-y-1.5"><Label className="text-xs">Occupation</Label><Input value={healthForm.mother_occupation ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, mother_occupation: e.target.value }))} /></div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Home Address */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4 text-primary" /> Home Address
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea placeholder="Unit / Street / City / Postcode / State" value={healthForm.home_address ?? ""} onChange={(e) => setHealthForm((f: any) => ({ ...f, home_address: e.target.value }))} rows={3} />
                    </CardContent>
                  </Card>

                  {/* Sticky save bar */}
                  <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 lg:left-64">
                    <div className="max-w-5xl mx-auto flex items-center justify-end gap-2">
                      <p className="text-xs text-muted-foreground hidden sm:block mr-auto">Changes save to your child's profile.</p>
                      <Button type="submit" disabled={saveHealthMutation.isPending} size="sm">
                        {saveHealthMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                        ) : (
                          <><Save className="h-4 w-4 mr-2" /> Save changes</>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="notifications">
                <AccordionTrigger className="text-sm font-semibold">
                  Notifications
                </AccordionTrigger>
                <AccordionContent>
                  <ParentNotificationsBlock />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </div>
      <UpdateDetailDialog
        updateId={openMomentId}
        open={!!openMomentId}
        onOpenChange={(v) => {
          if (!v) {
            setOpenMomentId(null);
            if (momentParam) {
              const next = new URLSearchParams(searchParams);
              next.delete("moment");
              setSearchParams(next, { replace: true });
            }
          }
        }}
      />
    </DashboardLayout>
  );
}

function ParentScheduleTab({ studentId }: { studentId?: string }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const dayOfWeek = new Date().getDay();
  const mappedDay = dayOfWeek;

  // Get child's class only
  const { data: studentInfo } = useQuery({
    queryKey: ["student-class-id", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("class_id")
        .eq("id", studentId!)
        .maybeSingle();
      return data;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000,
  });

  const classId = (studentInfo as any)?.class_id as string | undefined;

  // Prefer date-specific overrides
  const { data: dailySlots = [] } = useQuery({
    queryKey: ["parent-daily-slots", classId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name, event_description, event_agenda")
        .eq("class_id", classId!)
        .eq("slot_date", today)
        .order("start_time");
      return data ?? [];
    },
    enabled: !!classId,
    staleTime: 60 * 1000,
  });

  // Fall back to weekly recurring
  const { data: weeklySlots = [] } = useQuery({
    queryKey: ["parent-weekly-slots", classId, mappedDay],
    queryFn: async () => {
      if (mappedDay === 0 || mappedDay === 6) return [];
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, start_time, end_time, subject_name, event_name, event_description, event_agenda")
        .eq("class_id", classId!)
        .eq("day_of_week", mappedDay)
        .order("start_time");
      return data ?? [];
    },
    enabled: !!classId && mappedDay > 0 && mappedDay < 6,
    staleTime: 60 * 1000,
  });

  const slots = dailySlots.length > 0 ? dailySlots : weeklySlots;

  const { data: lessons = [] } = useQuery({
    queryKey: ["parent-schedule-lessons", classId, today],
    queryFn: async () => {
      if (!classId) return [];
      const { data } = await supabase
        .from("slot_lesson_plans")
        .select("*")
        .eq("class_id", classId)
        .eq("lesson_date", today);
      return data ?? [];
    },
    enabled: !!classId,
    staleTime: 60 * 1000,
  });

  if (!classId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          Your child hasn't been placed in a class yet. Their teacher will assign one shortly.
        </CardContent>
      </Card>
    );
  }

  if (mappedDay === 0 || mappedDay === 6) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          It's the weekend! No classes scheduled today. 🎉
        </CardContent>
      </Card>
    );
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No schedule available for today.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {slots.map((slot: any) => {
        const lesson = lessons.find((l: any) => l.timetable_slot_id === slot.id);
        const activity = lesson?.generated_activity as any;
        const isEvent = slot.subject_name === "Event / Activity";
        const agenda = (slot as any).event_agenda as any[] || [];

        if (isEvent) {
          return (
            <Card key={slot.id} className="border-warning/40 bg-warning/10 overflow-hidden">
              <CardContent className="p-3 sm:p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 text-warning" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                  </span>
                  <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">Event</Badge>
                </div>
                <h4 className="font-semibold text-foreground">{(slot as any).event_name || "Special Event"}</h4>
                {(slot as any).event_description && (
                  <p className="text-sm text-muted-foreground">{(slot as any).event_description}</p>
                )}
                {agenda.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-warning/30">
                    <span className="text-xs font-medium text-muted-foreground">Agenda:</span>
                    {agenda.map((item: any, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-foreground/80">
                        {item.time && <span className="font-mono text-muted-foreground min-w-[40px]">{item.time}</span>}
                        <span>{item.activity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        }

        return (
          <Card key={slot.id} className="border-border/50">
            <CardContent className="p-3 flex items-center gap-2 sm:gap-3">
              <div className="text-[11px] sm:text-xs font-mono text-muted-foreground min-w-[78px] sm:min-w-[90px] tabular-nums">
                {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
              </div>
              <Badge variant="secondary" className="text-[10px] sm:text-xs whitespace-nowrap">{slot.subject_name}</Badge>
              <div className="flex-1 min-w-0">
                {activity ? (
                  <span className="text-sm font-medium text-foreground truncate block">{activity.name || activity.name_ms}</span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Activity to be shared</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const METHODOLOGY_DESCRIPTIONS: Record<string, { title: string; description: string; emoji: string }> = {
  Montessori: { title: "Montessori", description: "Hands-on, self-directed learning where children explore at their own pace.", emoji: "🧱" },
  "Reggio Emilia": { title: "Reggio Emilia", description: "Collaborative, project-based learning emphasizing creativity and exploration.", emoji: "🎨" },
  Waldorf: { title: "Waldorf", description: "Holistic approach nurturing imagination through storytelling, art, and nature.", emoji: "🌿" },
  KP2026: { title: "KP2026 (KSPK)", description: "Malaysia's national early childhood curriculum — play-based across six domains.", emoji: "🇲🇾" },
};

/** What We're Learning card — shows current class lesson plans/themes */
function WhatWereLearningCard({ classId }: { classId?: string }) {
  const { data: plans } = useQuery({
    queryKey: ["parent-class-plans", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_plans")
        .select("id, title, theme, status")
        .eq("class_id", classId!)
        .in("status", ["published", "approved", "draft"])
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!classId,
  });

  if (!classId || !plans?.length) return null;

  const currentTheme = plans[0]?.theme;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">What We're Learning</span>
        </div>
        {currentTheme && (
          <p className="text-sm font-medium text-foreground mb-1.5">🎨 Current Theme: {currentTheme}</p>
        )}
        <div className="space-y-1">
          {plans.map((lp: any) => (
            <div key={lp.id} className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[10px] shrink-0">{lp.status}</Badge>
              <span className="text-muted-foreground truncate">{lp.title}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact learning profile summary shown inside Learning Journey tab */
function LearningProfileSummary({ studentId }: { studentId: string }) {
  const { data: student } = useQuery({
    queryKey: ["student-methodology", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("first_name, last_name, current_methodology")
        .eq("id", studentId)
        .single();
      return data;
    },
    enabled: !!studentId,
  });

  const methodology = (student as any)?.current_methodology || "KP2026";
  const info = METHODOLOGY_DESCRIPTIONS[methodology] || METHODOLOGY_DESCRIPTIONS.KP2026;

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/10">
      <CardContent className="p-3 flex items-center gap-3">
        <span className="text-2xl">{info.emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{student?.first_name}'s Approach</span>
            <Badge variant="outline" className="text-[10px]">{info.title}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{info.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
