/**
 * Canonical registry of all routes that can be granted via Access Groups
 * (a.k.a. "Roles" in the Role Matrix UI). Mirrors the sidebar grouping
 * in DashboardLayout so admins toggle features using the same labels
 * staff navigate by.
 *
 * Kept in one place so the matrix UI, sidebar filter, and any future
 * route enforcement always agree on what a "module" is and which pages
 * it contains.
 */

export type ModuleItem = {
  path: string;
  label: string;
  /** Routes that are auto-granted when this item is selected (children). */
  children?: string[];
};

export type ModuleGroup = {
  label: string;
  /** Stable id used as column key in the matrix. */
  key: string;
  items: ModuleItem[];
};

/**
 * Parent → child route mapping. When a parent is granted via the matrix,
 * its children are granted with it so admins don't have to remember the
 * deep-link tree.
 */
export const SUB_MODULE_MAP: Record<string, string[]> = {
  "/finance/kpi-dashboard": ["/finance/ar-aging", "/finance/reports"],
  "/finance/collections": ["/finance/unallocated"],
  "/finance/billing-settings": [
    "/finance/approval-rules",
    "/finance/gateway-events",
    "/finance/reconciliation",
  ],
  "/accounting/reports": ["/cashflow"],
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    items: [{ path: "/dashboard", label: "Dashboard" }],
  },
  {
    key: "administration",
    label: "Administration",
    items: [
      { path: "/organizations", label: "Organizations" },
      { path: "/branches", label: "Branches" },
      { path: "/users", label: "Users & Access Groups" },
      { path: "/eforms", label: "Registration Forms" },
      { path: "/data-migration", label: "Data Migration" },
      { path: "/admin/email", label: "Email" },
      { path: "/admin/parent-onboarding", label: "Parent Onboarding" },
      { path: "/admin/school-documents", label: "School Documents" },
      { path: "/settings/email-templates", label: "Email Templates" },
    ],
  },
  {
    key: "admissions",
    label: "Admissions",
    items: [
      { path: "/crm", label: "Admissions Pipeline" },
      { path: "/assessments", label: "Admissions Library" },
    ],
  },
  {
    key: "students",
    label: "Students",
    items: [
      { path: "/students", label: "Student Directory" },
      { path: "/classrooms", label: "Classrooms & Attendance" },
      { path: "/daily-updates", label: "Learning Journal" },
      { path: "/student-journey", label: "Student Timeline" },
      { path: "/observations", label: "Observations" },
      { path: "/attendance", label: "Attendance" },
      { path: "/learning-stories", label: "Learning Stories" },
      { path: "/learning-media", label: "Learning Media" },
    ],
  },
  {
    key: "planning",
    label: "My Planning",
    items: [
      { path: "/timetables", label: "My Timetable" },
      { path: "/curriculum/monthly", label: "Monthly Planner" },
      { path: "/curriculum/weekly", label: "Weekly Focus" },
      { path: "/lesson-planner", label: "Lesson Plans" },
      { path: "/curriculum/centers", label: "Learning Centers" },
    ],
  },
  {
    key: "comms",
    label: "Parent Communication",
    items: [
      { path: "/curriculum/ptm", label: "Parent Meetings (PTM)" },
      { path: "/curriculum/ptm/slots", label: "PTM Slots" },
      { path: "/curriculum/ptm/prep", label: "PTM Prep" },
      { path: "/staff-inbox", label: "Parent Inbox" },
    ],
  },
  {
    key: "communication_hub",
    label: "Communication Hub",
    items: [
      { path: "/announcements", label: "Announcements" },
      { path: "/newsletters", label: "Newsletter" },
    ],
  },
  {
    key: "curriculum",
    label: "Curriculum Setup",
    items: [
      { path: "/curriculum/command-center", label: "Curriculum Command Center" },
      { path: "/curriculum-framework", label: "Curriculum Framework" },
      { path: "/curriculum", label: "Curriculum (legacy)" },
      { path: "/theme-bank", label: "Theme Bank" },
      { path: "/yearly-outcomes", label: "Learning Goals" },
      { path: "/objective-bank", label: "Term Objectives" },
      { path: "/yearly-planner", label: "Yearly Planner" },
      { path: "/school-calendar", label: "School Calendar" },
      { path: "/worksheets", label: "Teaching Resources" },
      { path: "/development-domains", label: "Development Domains" },
    ],
  },
  {
    key: "insights",
    label: "Insights & Dashboards",
    items: [
      { path: "/planning-hub", label: "Planning Hub" },
      { path: "/curriculum/readiness", label: "Class Readiness Report" },
      { path: "/curriculum/readiness/dashboard", label: "Readiness Dashboard" },
      { path: "/curriculum/dashboard/review", label: "Academic Overview" },
      { path: "/curriculum/dashboard/all-plans", label: "Lesson Plan Review" },
      { path: "/curriculum/dashboard/coverage", label: "Curriculum Coverage" },
      { path: "/curriculum/dashboard/quality", label: "Planning Quality" },
      { path: "/curriculum/dashboard/ptm", label: "PTM Dashboard" },
      { path: "/analytics", label: "Analytics" },
      { path: "/install/analytics", label: "Install Analytics" },
      { path: "/notifications", label: "Notifications" },
    ],
  },
  {
    key: "hr",
    label: "Human Resource",
    items: [
      { path: "/hr-settings", label: "HR Settings" },
      { path: "/hr-calendar", label: "HR Calendar" },
      { path: "/staff-management", label: "Staff Management" },
      { path: "/staff-attendance", label: "Staff Attendance" },
      { path: "/overtime", label: "OT Requests" },
      { path: "/claims", label: "Reimbursements" },
      { path: "/leave", label: "Leave Management" },
      { path: "/payroll", label: "Payroll" },
      { path: "/my-payslips", label: "My Payslips" },
      { path: "/staff-performance", label: "Performance" },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    items: [
      { path: "/accounting/accounts", label: "Chart of Accounts" },
      { path: "/accounting/transactions", label: "Transactions" },
      { path: "/accounting/budget", label: "Budget" },
      { path: "/accounting/reports", label: "Reports", children: ["/cashflow"] },
      { path: "/branch-financials", label: "Branch Financials" },
    ],
  },
  {
    key: "billing",
    label: "Billing & Receivables",
    items: [
      { path: "/finance/kpi-dashboard", label: "Finance KPIs" },
      { path: "/finance/invoices", label: "Invoices" },
      { path: "/finance/refunds", label: "Refunds & Credits" },
      { path: "/finance/accounts", label: "Customer Accounts (Students)" },
      { path: "/finance/payers", label: "Family Accounts (Payers)" },
      { path: "/finance/collections", label: "Collections" },
      { path: "/finance/disputes", label: "Disputes & Locked Funds" },
      { path: "/finance/transactions", label: "Transaction Ledger" },
      { path: "/finance/pricing", label: "Pricing & Rules" },
      { path: "/fee-packages", label: "Fee Packages" },
      { path: "/finance/approvals", label: "Approval Inbox" },
      { path: "/finance/billing-settings", label: "Billing Settings" },
    ],
  },
  {
    key: "qa",
    label: "QA & Compliance",
    items: [
      { path: "/qa-dashboard", label: "QA Dashboard" },
      { path: "/qa-audit", label: "Field Audit" },
      { path: "/qa-compliance", label: "Compliance" },
      { path: "/royalty-dashboard", label: "Branch Royalties" },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [
      { path: "/settings", label: "Settings" },
      { path: "/help", label: "Help Center" },
    ],
  },
];

/** Flat lookup of every grantable item. */
export const ALL_ITEMS: ModuleItem[] = MODULE_GROUPS.flatMap((g) => g.items);

/**
 * Routes that are view-only by design (no branch-wide write actions).
 * They never appear in the Manage column.
 */
export const NON_MANAGEABLE = new Set<string>([
  "/dashboard",
  "/settings",
  "/help",
  "/notifications",
  "/install/analytics",
  "/my-payslips",
]);

/** Expand a route + any auto-granted children defined in SUB_MODULE_MAP. */
export function expandRouteWithChildren(path: string): string[] {
  const kids = SUB_MODULE_MAP[path] ?? [];
  return [path, ...kids];
}

/** All paths within a module group (including SUB_MODULE_MAP children). */
export function pathsForGroup(group: ModuleGroup): string[] {
  const out = new Set<string>();
  for (const item of group.items) {
    for (const p of expandRouteWithChildren(item.path)) out.add(p);
    for (const c of item.children ?? []) out.add(c);
  }
  return [...out];
}

/** Manageable paths within a module group (excludes NON_MANAGEABLE). */
export function manageablePathsForGroup(group: ModuleGroup): string[] {
  return pathsForGroup(group).filter((p) => !NON_MANAGEABLE.has(p));
}

/**
 * Starter role templates seeded on first use. Each maps to an
 * access_groups row (one per branch the super admin chooses).
 */
export const STARTER_ROLE_PRESETS: {
  name: string;
  description: string;
  allowedRoutes: string[];
  managedRoutes: string[];
}[] = [
  {
    name: "Marketing",
    description: "Admissions pipeline, tours, parent communications.",
    allowedRoutes: [
      "/dashboard",
      "/crm",
      "/eforms",
      "/assessments",
      "/announcements",
      "/newsletters",
      "/staff-inbox",
      "/daily-updates",
      "/notifications",
      "/settings",
    ],
    managedRoutes: ["/crm", "/eforms", "/announcements", "/newsletters"],
  },
  {
    name: "HR Officer",
    description: "Staff management, attendance, leave, OT, claims, payroll.",
    allowedRoutes: [
      "/dashboard",
      "/hr-settings",
      "/hr-calendar",
      "/staff-management",
      "/staff-attendance",
      "/overtime",
      "/claims",
      "/leave",
      "/payroll",
      "/my-payslips",
      "/staff-performance",
      "/announcements?audience=staff",
      "/newsletters?audience=staff",
      "/notifications",
      "/settings",
    ],
    managedRoutes: [
      "/staff-management",
      "/staff-attendance",
      "/overtime",
      "/claims",
      "/leave",
      "/payroll",
      "/hr-settings",
      "/hr-calendar",
      "/staff-performance",
    ],
  },
  {
    name: "School Admin",
    description: "Day-to-day school operations across students, comms, HR and finance read-only.",
    allowedRoutes: [
      "/dashboard",
      "/students",
      "/classrooms",
      "/daily-updates",
      "/attendance",
      "/announcements",
      "/newsletters",
      "/staff-inbox",
      "/crm",
      "/assessments",
      "/eforms",
      "/curriculum/ptm",
      "/curriculum/ptm/slots",
      "/staff-management",
      "/staff-attendance",
      "/leave",
      "/claims",
      "/overtime",
      "/finance/invoices",
      "/finance/collections",
      "/finance/unallocated",
      "/finance/accounts",
      "/finance/payers",
      "/notifications",
      "/settings",
      "/help",
    ],
    managedRoutes: [
      "/students",
      "/classrooms",
      "/daily-updates",
      "/announcements",
      "/newsletters",
      "/staff-inbox",
      "/crm",
      "/eforms",
      "/curriculum/ptm",
      "/curriculum/ptm/slots",
      "/staff-attendance",
    ],
  },
  {
    name: "Accountant",
    description: "Full billing, accounting and financial reporting.",
    allowedRoutes: [
      "/dashboard",
      "/accounting/accounts",
      "/accounting/transactions",
      "/accounting/budget",
      "/accounting/reports",
      "/cashflow",
      "/branch-financials",
      "/finance/kpi-dashboard",
      "/finance/ar-aging",
      "/finance/reports",
      "/finance/invoices",
      "/finance/refunds",
      "/finance/accounts",
      "/finance/payers",
      "/finance/collections",
      "/finance/unallocated",
      "/finance/disputes",
      "/finance/transactions",
      "/finance/pricing",
      "/fee-packages",
      "/finance/approvals",
      "/finance/billing-settings",
      "/notifications",
      "/settings",
    ],
    managedRoutes: [
      "/accounting/accounts",
      "/accounting/transactions",
      "/accounting/budget",
      "/accounting/reports",
      "/branch-financials",
      "/finance/invoices",
      "/finance/refunds",
      "/finance/collections",
      "/finance/pricing",
      "/fee-packages",
      "/finance/approvals",
      "/finance/billing-settings",
    ],
  },
  {
    name: "Front Desk",
    description: "Reception: tours, registration forms, parent updates.",
    allowedRoutes: [
      "/dashboard",
      "/crm",
      "/eforms",
      "/daily-updates",
      "/staff-inbox",
      "/announcements",
      "/students",
      "/attendance",
      "/notifications",
      "/settings",
    ],
    managedRoutes: ["/crm", "/eforms", "/staff-inbox"],
  },
];