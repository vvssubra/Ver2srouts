# Preschool OS - Full Codebase Reference

## Project Overview
**Preschool OS** is an AI-powered preschool franchise management system built with React + Vite + TypeScript + Tailwind CSS + Supabase (Lovable Cloud).

### Tech Stack
- Frontend: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- Backend: Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- State: TanStack React Query
- Charts: Recharts
- Routing: React Router DOM v6
- AI: Lovable AI Gateway (Google Gemini)
- Payments: Stripe Checkout

### Roles
- `super_admin` - Full system access
- `franchisee` - Branch-level management
- `teacher` - Classroom features
- `parent` - View child progress & pay fees

---

## Database Schema (Supabase Types)

### Tables
- `organizations` - Franchise organizations
- `branches` - Physical locations under organizations
- `branch_memberships` - Links users to branches
- `profiles` - User profile data (name, email, avatar)
- `user_roles` - Role assignments (app_role enum)
- `students` - Student records per branch
- `parent_students` - Links parent users to students
- `attendance` - Daily student attendance
- `student_observations` - Curriculum observation records
- `learning_areas` - Curriculum learning areas (KP2026)
- `curriculum_standards` - Hierarchical curriculum standards
- `competencies` - Competency frameworks
- `lesson_plans` - AI-generated lesson plans
- `shared_plans` - Shared lesson plans between users
- `staff_profiles` - HR data (salary, statutory rates, work schedule)
- `staff_designations` - Job titles
- `staff_attendance` - Clock in/out records
- `staff_documents` - Uploaded HR documents
- `staff_claims` - Expense claims (2-level approval)
- `leave_requests` - Leave applications (2-level approval)
- `leave_balances` - Annual leave entitlements
- `overtime_requests` - OT tracking
- `payroll_records` - Monthly payroll with EPF/SOCSO/EIS/PCB
- `performance_reviews` - Staff performance reviews
- `performance_kpis` - KPI metrics per review
- `fee_packages` - Tuition fee configurations
- `student_fees` - Fee assignments per student
- `invoices` - Monthly invoices
- `invoice_items` - Line items per invoice
- `payments` - Payment records
- `accounts` - Chart of accounts
- `transactions` - Financial transactions
- `budgets` - Monthly budget allocations
- `notifications` - In-app notifications

### Enums
- `app_role`: super_admin, franchisee, teacher, parent
- `attendance_status`: present, absent, late, excused
- `curriculum_level`: skill, standard, sub_standard
- `leave_status`: pending, approved, rejected, cancelled
- `leave_type`: annual, medical, maternity, paternity, unpaid, emergency, compassionate, replacement
- `proficiency_level`: TP1, TP2, TP3

### Key Functions (PostgreSQL)
- `has_role(_user_id, _role)` - Security definer role check
- `is_super_admin(_user_id)` - Admin check
- `is_member_of_branch(_user_id, _branch_id)` - Branch membership check
- `get_user_role(_user_id)` - Get user's role
- `generate_invoice_number()` - Auto-generate invoice numbers

---

## File Structure

```
src/
├── App.tsx                    # Routes & providers
├── lib/auth.tsx               # Auth context, ProtectedRoute, role helpers
├── index.css                  # Design tokens (HSL variables)
├── components/
│   ├── DashboardLayout.tsx    # Sidebar + nav + notifications
│   ├── ActivityEditor.tsx     # Lesson plan activity editor
│   ├── AddObservationDialog.tsx
│   ├── EditAttendanceDialog.tsx
│   ├── NavLink.tsx
│   ├── PayslipPrintView.tsx
│   ├── PlanChat.tsx           # AI chat for lesson refinement
│   ├── PlanPrintView.tsx
│   ├── SavedPlans.tsx
│   ├── SharePlanDialog.tsx
│   ├── SharedWithMe.tsx
│   ├── SortableActivityCard.tsx
│   ├── StaffDocumentUpload.tsx
│   ├── StaffOnboardingWizard.tsx
│   ├── StaffProfileForm.tsx
│   ├── WeeklyTimetable.tsx
│   └── ui/                    # shadcn/ui components
├── pages/
│   ├── Auth.tsx               # Login/signup
│   ├── Dashboard.tsx          # Role-based dashboard with stats
│   ├── Organizations.tsx      # Org CRUD (super_admin)
│   ├── OrganizationDetail.tsx
│   ├── Branches.tsx           # Branch CRUD (super_admin)
│   ├── BranchDetail.tsx
│   ├── Users.tsx              # User management, role/branch assignment
│   ├── Students.tsx           # Student CRUD, parent linking
│   ├── Attendance.tsx         # Student attendance marking + history
│   ├── Observations.tsx       # Curriculum observations
│   ├── StudentProgress.tsx    # Individual student progress
│   ├── Curriculum.tsx         # Curriculum standards CRUD
│   ├── CurriculumBrowser.tsx  # Read-only curriculum browser
│   ├── LessonPlanner.tsx      # AI lesson plan generator
│   ├── ParentChildView.tsx    # Parent portal (progress + billing)
│   ├── StaffManagement.tsx    # Staff directory
│   ├── StaffDetail.tsx        # Individual staff detail
│   ├── StaffAttendance.tsx    # Staff clock in/out
│   ├── LeaveManagement.tsx    # Leave requests (2-level approval)
│   ├── Claims.tsx             # Expense claims (2-level approval)
│   ├── OvertimeRequests.tsx   # OT tracking
│   ├── Payroll.tsx            # Malaysian statutory payroll calculator
│   ├── MyPayslips.tsx         # Staff view own payslips
│   ├── StaffPerformance.tsx   # Performance reviews + KPIs
│   ├── Billing.tsx            # Fee packages, invoices, payments
│   ├── ChartOfAccounts.tsx    # Accounting chart of accounts
│   ├── AccountingTransactions.tsx
│   ├── AccountingBudget.tsx
│   ├── AccountingReports.tsx
│   ├── Analytics.tsx          # Data analytics
│   ├── Settings.tsx           # Profile + HR settings
│   └── NotFound.tsx
└── integrations/supabase/
    ├── client.ts              # Auto-generated Supabase client
    └── types.ts               # Auto-generated TypeScript types

supabase/functions/
├── create-checkout/           # Stripe checkout for parent payments
├── stripe-webhook/            # Stripe webhook handler
├── generate-lesson-plan/      # AI lesson plan generation
├── refine-lesson-plan/        # AI plan refinement
├── suggest-observation-tags/  # AI observation tagging
├── generate-recurring-invoices/ # Auto-generate monthly invoices
└── detect-overdue-invoices/   # Mark overdue invoices
```

---

## Core Files

### src/App.tsx
```tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
// ... all page imports ...

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/curriculum" element={<ProtectedRoute><Curriculum /></ProtectedRoute>} />
            <Route path="/organizations" element={<ProtectedRoute allowedRoles={["super_admin"]}><Organizations /></ProtectedRoute>} />
            <Route path="/organizations/:id" element={<ProtectedRoute allowedRoles={["super_admin"]}><OrganizationDetail /></ProtectedRoute>} />
            <Route path="/branches" element={<ProtectedRoute allowedRoles={["super_admin"]}><Branches /></ProtectedRoute>} />
            <Route path="/branches/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><BranchDetail /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={["super_admin"]}><Users /></ProtectedRoute>} />
            <Route path="/claims" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><Claims /></ProtectedRoute>} />
            <Route path="/lesson-planner" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><LessonPlanner /></ProtectedRoute>} />
            <Route path="/curriculum-browser" element={<ProtectedRoute><CurriculumBrowser /></ProtectedRoute>} />
            <Route path="/students" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><Students /></ProtectedRoute>} />
            <Route path="/students/:id/progress" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><StudentProgress /></ProtectedRoute>} />
            <Route path="/observations" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><Observations /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><Analytics /></ProtectedRoute>} />
            <Route path="/child" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChildView /></ProtectedRoute>} />
            <Route path="/attendance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><Attendance /></ProtectedRoute>} />
            <Route path="/staff-attendance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><StaffAttendance /></ProtectedRoute>} />
            <Route path="/leave" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><LeaveManagement /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><Payroll /></ProtectedRoute>} />
            <Route path="/my-payslips" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><MyPayslips /></ProtectedRoute>} />
            <Route path="/staff-performance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><StaffPerformance /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><Billing /></ProtectedRoute>} />
            <Route path="/staff-management" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><StaffManagement /></ProtectedRoute>} />
            <Route path="/staff-management/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><StaffDetail /></ProtectedRoute>} />
            <Route path="/overtime" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "teacher"]}><OvertimeRequests /></ProtectedRoute>} />
            <Route path="/accounting/accounts" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><ChartOfAccounts /></ProtectedRoute>} />
            <Route path="/accounting/transactions" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><AccountingTransactions /></ProtectedRoute>} />
            <Route path="/accounting/budget" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><AccountingBudget /></ProtectedRoute>} />
            <Route path="/accounting/reports" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><AccountingReports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
```

### src/lib/auth.tsx
```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

type AppRole = "super_admin" | "franchisee" | "teacher" | "parent";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, role: null, loading: true, signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).limit(1).single();
    return (data?.role as AppRole) ?? null;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const userRole = await fetchRole(session.user.id);
          setRole(userRole);
        } else { setRole(null); }
        setLoading(false);
      }
    );
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userRole = await fetchRole(session.user.id);
        setRole(userRole);
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null); setUser(null); setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles?: AppRole[] }) {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate("/auth");
    if (!loading && session && role && allowedRoles && !allowedRoles.includes(role)) navigate("/dashboard");
  }, [loading, session, role, navigate, allowedRoles]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!session) return null;
  return <>{children}</>;
}

export function getRoleLabel(role: AppRole | null): string {
  switch (role) {
    case "super_admin": return "Super Admin";
    case "franchisee": return "Franchisee";
    case "teacher": return "Teacher";
    case "parent": return "Parent";
    default: return "Unknown";
  }
}
```

### src/index.css (Design Tokens)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap');

@layer base {
  :root {
    --background: 210 20% 98%;
    --foreground: 220 25% 10%;
    --card: 0 0% 100%;
    --card-foreground: 220 25% 10%;
    --primary: 250 75% 55%;
    --primary-foreground: 0 0% 100%;
    --secondary: 210 30% 95%;
    --muted: 210 20% 96%;
    --muted-foreground: 215 15% 50%;
    --accent: 170 65% 45%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 72% 55%;
    --border: 215 20% 90%;
    --ring: 250 75% 55%;
    --radius: 0.75rem;
    /* Role colors */
    --role-super-admin: 250 75% 55%;
    --role-franchisee: 170 65% 45%;
    --role-teacher: 35 90% 55%;
    --role-parent: 330 70% 55%;
    /* Sidebar */
    --sidebar-background: 220 25% 10%;
    --sidebar-foreground: 210 20% 90%;
    --sidebar-primary: 250 75% 65%;
  }
  body {
    @apply bg-background text-foreground;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
}
```

---

## Key Pages (Summary)

### Dashboard (src/pages/Dashboard.tsx)
- Role-based stat cards (organizations, branches, students, attendance)
- Auto-redirect parent users to `/child`
- Staff onboarding wizard check
- Queries: branches count, students count, staff count, curriculum count, lesson plans, observations, attendance today

### Parent Portal (src/pages/ParentChildView.tsx)
- Child selector (multi-child support)
- Tabs: Overview (learning area progress), Detailed Progress, Recent Observations, Fees & Invoices
- Stripe checkout integration via `create-checkout` edge function
- Proficiency levels: TP1, TP2, TP3

### Students (src/pages/Students.tsx)
- Student CRUD per branch
- Parent linking by email (validates parent role)
- Parent unlinking
- Active/inactive toggle
- Navigate to student progress

### Attendance (src/pages/Attendance.tsx)
- Mark tab: Date picker, status buttons (present/absent/late/excused), notes, save
- History tab: Monthly summary table + daily grid
- Print report functionality
- Upsert on `student_id,date` conflict

### Payroll (src/pages/Payroll.tsx)
- Malaysian statutory calculator: EPF (11%/13%), SOCSO (0.5%/1.75%), EIS (0.2%), PCB
- Auto-fetch staff profile salary, OT hours, approved claims
- Leave integration (unpaid deductions)
- Custom statutory rates per staff
- Confirm → Mark Paid workflow with notifications
- Annual summary with bar chart
- Payslip print view

### Leave Management (src/pages/LeaveManagement.tsx)
- 2-level approval workflow (L1: Branch Manager/Franchisee, L2: Super Admin)
- 8 leave types per Employment Act 1955
- Document upload (required for medical/compassionate)
- Leave balance tracking
- Notifications on submit/approve/reject

### Billing (src/pages/Billing.tsx)
- Fee packages CRUD
- Invoice generation from student's assigned fees
- Manual payment recording
- Recurring invoice generation (edge function)
- Invoice status: draft → issued → partial/paid/overdue

### Curriculum (src/pages/Curriculum.tsx)
- Hierarchical: Learning Areas → Skills → Standards → Sub-Standards
- CRUD for super_admin
- Search/filter
- Tree view with collapsible nodes

### Lesson Planner (src/pages/LessonPlanner.tsx)
- AI-powered plan generation (Gemini via Lovable AI Gateway)
- Curriculum-aligned with learning areas and standards
- Drag-and-drop activity reordering
- Inline editing of activities, title, overview
- Save, share, print functionality
- AI chat for plan refinement
- Weekly timetable view
- Assessment checklist

### Claims (src/pages/Claims.tsx)
- 2-level approval (same as leave)
- Receipt upload
- Claim types: transport, meal, medical, training, other
- Integration with payroll (claims added to net salary)

### HR Features
- **Staff Attendance**: Clock in/out, work hours calculation, late detection
- **Overtime Requests**: Auto-detected or manual, approval workflow
- **Staff Performance**: KPI-based reviews, rating system
- **Staff Management**: Directory, onboarding status, staff detail view
- **Staff Documents**: Upload/manage HR documents
- **Staff Onboarding**: Multi-step wizard for new staff

### Accounting
- **Chart of Accounts**: Asset, liability, equity, revenue, expense accounts
- **Transactions**: Record income/expenses with receipt upload
- **Budget**: Monthly budget allocation per account
- **Reports**: Financial summaries

---

## Edge Functions

### create-checkout (Stripe)
```typescript
// Validates parent ownership of invoice
// Creates Stripe Checkout session in MYR
// Returns checkout URL
// success_url: /child?payment=success
// cancel_url: /child?payment=cancelled
```

### generate-lesson-plan (AI)
```typescript
// Uses Lovable AI Gateway (google/gemini-3-flash-preview)
// Fetches curriculum standards from DB for RAG context
// Generates JSON lesson plan with days, activities, assessment
// Supports age groups: 4+, 5+, 6+
// Duration: 1 day, 3 days, 1 week, 2 weeks
```

### Other Functions
- `refine-lesson-plan` - AI chat-based plan refinement
- `suggest-observation-tags` - AI tagging for observations
- `generate-recurring-invoices` - Monthly invoice auto-generation
- `detect-overdue-invoices` - Mark past-due invoices
- `stripe-webhook` - Handle Stripe payment events

---

## Navigation Structure

### Super Admin
Dashboard, Organizations, Branches, Users, Curriculum, Browse Curriculum, Lesson Planner, Students, Observations, Analytics, **HR** (Staff Management, Staff Attendance, Overtime, Leave, Claims, Payroll, My Payslips, Performance), **Accounting** (Chart of Accounts, Transactions, Budget, Reports), Billing, Settings

### Franchisee
Dashboard, My Branch, Students, Staff, Attendance, **HR** (all), **Accounting** (all), Billing, Lesson Planner, Curriculum, Analytics, Settings

### Teacher
Dashboard, Lesson Planner, Students, Observations, Attendance, **HR** (Staff Attendance, Overtime, Leave, Claims, My Payslips), Analytics, Curriculum, Settings

### Parent
Dashboard → auto-redirect to My Child, Learning Stories, Messages, Curriculum, Settings

---

## Key Patterns

1. **Branch-scoped data**: Most data queries filter by `branch_id` from user's `branch_memberships`
2. **Role-based access**: `ProtectedRoute` with `allowedRoles` prop
3. **2-level approvals**: Leave & claims use L1 (franchisee) → L2 (super_admin) workflow
4. **Notifications**: In-app notifications for approvals, payroll, etc.
5. **Malaysian compliance**: EPF, SOCSO, EIS, PCB statutory calculations
6. **Bilingual UI**: Malay + English throughout (KP2026 curriculum)
7. **Print views**: Payslips, attendance reports, lesson plans
8. **AI integration**: Lesson planning, observation tagging, plan refinement
