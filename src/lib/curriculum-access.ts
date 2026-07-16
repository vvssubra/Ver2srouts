/**
 * Curriculum Access Control (Sub-batch 6B-0A.3)
 *
 * Reuses the existing `access_groups.allowed_routes` / `managed_routes`
 * permission system rather than introducing a new schema. Each curriculum
 * "module key" maps to one or more routes that the existing access-group
 * editor (Users → Access Groups) can grant or revoke.
 *
 * Permission levels supported today:
 *   - no_access  → route not in `allowed_routes` and not in `managed_routes`
 *   - view       → route in `allowed_routes`
 *   - manage     → route in `managed_routes` (implies write/edit/approve
 *                  per existing canManage semantics in src/lib/auth.tsx)
 *
 * Finer-grained levels (draft / submit / approve / publish) are not yet
 * persisted distinctly — they are surfaced in the curriculum permission
 * model so the UI can plan for them, but today they collapse to
 * view (read) or manage (write/approve). This is intentional: do not
 * fork a parallel permission system; extend the existing one in a later
 * batch if/when separate write tiers are needed.
 *
 * Super Admin and Franchisee always bypass — matching ProtectedRoute
 * and DashboardLayout sidebar enforcement.
 */

export type CurriculumModuleKey =
  | "curriculum.command_center"
  | "curriculum.foundation"
  | "curriculum.framework"
  | "curriculum.theme_bank"
  | "curriculum.methodology"
  | "curriculum.objectives"
  | "curriculum.vocabulary"
  | "curriculum.yearly"
  | "curriculum.monthly"
  | "curriculum.weekly"
  | "curriculum.calendar_timetable"
  | "curriculum.lesson_builder"
  | "curriculum.learning_centers"
  | "curriculum.resources"
  | "curriculum.approvals"
  | "curriculum.quality"
  | "curriculum.delivery_tracking"
  | "curriculum.ai_recommendations";

export type CurriculumLevel =
  | "no_access"
  | "view"
  | "draft"
  | "edit"
  | "submit"
  | "approve"
  | "publish"
  | "manage";

export interface CurriculumModuleDef {
  key: CurriculumModuleKey;
  label: string;
  description: string;
  /** Routes whose presence in allowed_routes grants view access. */
  routes: string[];
  /** Optional placeholder flag: feature is not fully built yet. */
  placeholder?: boolean;
}

export const CURRICULUM_MODULES: CurriculumModuleDef[] = [
  {
    key: "curriculum.command_center",
    label: "Command Center",
    description: "The main curriculum workbench page.",
    routes: ["/curriculum/command-center"],
  },
  {
    key: "curriculum.foundation",
    label: "Foundation",
    description: "Development domains and master curriculum setup.",
    routes: ["/development-domains", "/curriculum"],
  },
  {
    key: "curriculum.framework",
    label: "Framework",
    description: "Curriculum framework configuration.",
    routes: ["/curriculum-framework"],
  },
  {
    key: "curriculum.theme_bank",
    label: "Theme Bank",
    description: "Reusable themes for yearly/monthly planning.",
    routes: ["/theme-bank"],
  },
  {
    key: "curriculum.methodology",
    label: "School Methodology",
    description: "Selected pedagogical frameworks and KSPK / KP2026 standards.",
    routes: ["/curriculum/school-methodology"],
  },
  {
    key: "curriculum.objectives",
    label: "Objectives",
    description: "Learning goals and term objectives.",
    routes: ["/yearly-outcomes", "/objective-bank", "/curriculum/objective-catalogue"],
  },
  {
    key: "curriculum.vocabulary",
    label: "Vocabulary",
    description: "Bilingual English / BM vocabulary matrix by age, theme, domain and objective.",
    routes: ["/curriculum/vocabulary-matrix"],
  },
  {
    key: "curriculum.yearly",
    label: "Yearly Plan",
    description: "Yearly planner and themes-per-year strategy.",
    routes: ["/yearly-planner"],
  },
  {
    key: "curriculum.monthly",
    label: "Monthly Plan",
    description: "Monthly curriculum planner.",
    routes: ["/curriculum/monthly"],
  },
  {
    key: "curriculum.weekly",
    label: "Weekly Plan",
    description: "Weekly focus and objective mapping.",
    routes: ["/curriculum/weekly"],
  },
  {
    key: "curriculum.calendar_timetable",
    label: "Calendar & Timetable",
    description: "School calendar and class timetable.",
    routes: ["/school-calendar", "/timetables"],
  },
  {
    key: "curriculum.lesson_builder",
    label: "Lesson Builder",
    description: "Daily lesson plan creation and editing.",
    routes: ["/lesson-planner"],
  },
  {
    key: "curriculum.learning_centers",
    label: "Learning Centers",
    description: "Learning-center rotations and plans.",
    routes: ["/curriculum/centers"],
  },
  {
    key: "curriculum.resources",
    label: "Resources",
    description: "Teaching resources and worksheet library.",
    routes: ["/worksheets"],
  },
  {
    key: "curriculum.approvals",
    label: "Approvals",
    description: "Lesson plan review and approval workflow.",
    routes: ["/curriculum/dashboard/all-plans", "/curriculum/dashboard/review"],
  },
  {
    key: "curriculum.quality",
    label: "Quality Dashboard",
    description: "Curriculum coverage, readiness and planning quality.",
    routes: [
      "/curriculum/dashboard/quality",
      "/curriculum/dashboard/coverage",
      "/curriculum/readiness",
      "/curriculum/readiness/dashboard",
    ],
  },
  {
    key: "curriculum.delivery_tracking",
    label: "Delivery Tracking",
    description: "Lesson delivery and exposure tracking (placeholder).",
    routes: [],
    placeholder: true,
  },
  {
    key: "curriculum.ai_recommendations",
    label: "AI Recommendations",
    description: "AI-powered planning suggestions (placeholder).",
    routes: [],
    placeholder: true,
  },
];

function matchesAny(routes: string[], path: string): boolean {
  return routes.some((r) => {
    if (r.includes("?") || path.includes("?")) return r === path;
    return path.startsWith(r);
  });
}

/**
 * Returns true when the user can VIEW the given curriculum module.
 * - Super Admin / Franchisee always pass.
 * - When the user has no access-group routes configured, default behavior
 *   is preserved (access granted) to avoid regressions for existing roles.
 * - Placeholder modules return false (no route to grant yet) unless the
 *   caller is bypassed.
 */
export function canViewCurriculumModule(opts: {
  role: string | null | undefined;
  allowedRoutes: string[];
  moduleKey: CurriculumModuleKey;
}): boolean {
  const { role, allowedRoutes, moduleKey } = opts;
  if (role === "super_admin" || role === "franchisee") return true;
  const mod = CURRICULUM_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return false;
  if (mod.placeholder) return false;
  if (!allowedRoutes || allowedRoutes.length === 0) return true; // default preserved
  return mod.routes.some((r) => matchesAny(allowedRoutes, r));
}

/**
 * Returns true when the user can MANAGE (edit/approve) the given module.
 * Mirrors `canManage` semantics from src/lib/auth.tsx.
 */
export function canManageCurriculumModule(opts: {
  role: string | null | undefined;
  managedRoutes: string[];
  moduleKey: CurriculumModuleKey;
}): boolean {
  const { role, managedRoutes, moduleKey } = opts;
  if (role === "super_admin" || role === "franchisee") return true;
  const mod = CURRICULUM_MODULES.find((m) => m.key === moduleKey);
  if (!mod || mod.placeholder) return false;
  return mod.routes.some((r) => matchesAny(managedRoutes ?? [], r));
}

/** Mapping from Command Center tab id to its required module key. */
export const COMMAND_CENTER_TAB_MODULE: Record<string, CurriculumModuleKey> = {
  overview: "curriculum.command_center",
  setup: "curriculum.foundation",
  yearly: "curriculum.yearly",
  monthly: "curriculum.monthly",
  weekly: "curriculum.weekly",
  calendar: "curriculum.calendar_timetable",
  lessons: "curriculum.lesson_builder",
  centers: "curriculum.learning_centers",
  resources: "curriculum.resources",
  approvals: "curriculum.approvals",
  quality: "curriculum.quality",
};

/**
 * Sub-batch 6B-0A.4 — the consolidated 6-section Command Center groups
 * several legacy tabs under one production-ready home. A grouped tab is
 * visible if the user can view ANY of the underlying modules.
 */
export const COMMAND_CENTER_GROUPED_TABS: Array<{
  id: string;
  label: string;
  modules: CurriculumModuleKey[];
}> = [
  { id: "overview", label: "Overview", modules: ["curriculum.command_center"] },
  { id: "foundation", label: "Foundation", modules: ["curriculum.foundation", "curriculum.framework", "curriculum.theme_bank", "curriculum.objectives", "curriculum.vocabulary"] },
  { id: "planning", label: "Planning Cycle", modules: ["curriculum.yearly", "curriculum.monthly", "curriculum.weekly"] },
  { id: "calendar", label: "Calendar & Timetable", modules: ["curriculum.calendar_timetable"] },
  { id: "lessons", label: "Lesson & Resources", modules: ["curriculum.lesson_builder", "curriculum.learning_centers", "curriculum.resources"] },
  { id: "quality", label: "Approvals & Quality", modules: ["curriculum.approvals", "curriculum.quality"] },
];