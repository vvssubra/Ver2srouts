import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { BranchProvider } from "@/hooks/use-branch-context";
import { toastError } from "@/lib/error-messages";
import IconUpdateModal from "@/components/IconUpdateModal";
import DynamicFavicon from "@/components/DynamicFavicon";
import PwaUpdateToast from "@/components/PwaUpdateToast";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Unsubscribe from "./pages/Unsubscribe";
import ChangePassword from "./pages/ChangePassword";
import Pending from "./pages/Pending";
import SelectRole from "./pages/SelectRole";
import Dashboard from "./pages/Dashboard";
import Curriculum from "./pages/Curriculum";
import CurriculumFramework from "./pages/CurriculumFramework";
import ThemeBank from "./pages/ThemeBank";
import MonthlyCurriculumPlanner from "./pages/MonthlyCurriculumPlanner";
import WeeklyCurriculumPlanner from "./pages/WeeklyCurriculumPlanner";
import DevelopmentDomains from "./pages/DevelopmentDomains";
// AgeOutcomes removed — consolidated into YearlyOutcomes
import ObjectiveBank from "./pages/ObjectiveBank";
import YearlyOutcomes from "./pages/YearlyOutcomes";
import ObjectiveCatalogue from "./pages/ObjectiveCatalogue";
import VocabularyMatrix from "./pages/VocabularyMatrix";
import SchoolMethodology from "./pages/SchoolMethodology";
import CurriculumLessonGenerator from "./pages/CurriculumLessonGenerator";
import CurriculumLessonList from "./pages/CurriculumLessonList";
import LessonPlanDetail from "./pages/LessonPlanDetail";
import LearningCenterPlanner from "./pages/LearningCenterPlanner";
import DailyUpdates from "./pages/DailyUpdates";
import ClassReadiness from "./pages/ClassReadiness";
import ObservationDashboard from "./pages/ObservationDashboard";
import ReadinessDashboard from "./pages/ReadinessDashboard";
import PtmPrep from "./pages/PtmPrep";
import PtmReportGenerator from "./pages/PtmReportGenerator";
import PtmMeetingDetail from "./pages/PtmMeetingDetail";
import PtmSlots from "./pages/PtmSlots";
import PtmWorkspace from "./pages/PtmWorkspace";
import ParentPTM from "./pages/ParentPTM";
import CurriculumCoverageDashboard from "./pages/CurriculumCoverageDashboard";
import TeacherPlanningQualityDashboard from "./pages/TeacherPlanningQualityDashboard";
import PtmCompletionDashboard from "./pages/PtmCompletionDashboard";
import AcademicLeaderReview from "./pages/AcademicLeaderReview";
import AllLessonPlans from "./pages/AllLessonPlans";

import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import Branches from "./pages/Branches";
import BranchDetail from "./pages/BranchDetail";
import Users from "./pages/Users";
import RoleMatrix from "./pages/RoleMatrix";
import TempPasswordAdmin from "./pages/TempPasswordAdmin";
import Claims from "./pages/Claims";
import LessonPlanner from "./pages/LessonPlanner";
import WorksheetLibrary from "./pages/WorksheetLibrary";
import Students from "./pages/Students";
import ClassroomWorkspace from "./pages/ClassroomWorkspace";
import StudentProgress from "./pages/StudentProgress";
import StudentDetail from "./pages/StudentDetail";
import ParentChildView from "./pages/ParentChildView";
import ParentHome from "./components/parent/ParentHome";
import ParentFirstRunOnboarding from "./pages/ParentFirstRunOnboarding";
// Analytics removed — consolidated into Academic Overview
import StaffAttendance from "./pages/StaffAttendance";
import LeaveManagement from "./pages/LeaveManagement";
import Payroll from "./pages/Payroll";
import StaffPerformance from "./pages/StaffPerformance";

// Fee management consolidated into /finance/pricing
import CashflowProjections from "./pages/CashflowProjections";
import Settings from "./pages/Settings";
import EmailAdmin from "./pages/EmailAdmin";
import ParentOnboardingAdmin from "./pages/ParentOnboardingAdmin";
import SchoolDocumentsAdmin from "./pages/SchoolDocumentsAdmin";
import ParentSchoolDocuments from "./pages/ParentSchoolDocuments";
import MyPayslips from "./pages/MyPayslips";
import StaffManagement from "./pages/StaffManagement";
import StaffDetail from "./pages/StaffDetail";
import OrgChart from "./pages/OrgChart";
import OvertimeRequests from "./pages/OvertimeRequests";
import PayrollAdjustments from "./pages/PayrollAdjustments";
import AccountingTransactions from "./pages/AccountingTransactions";
import AccountingBudget from "./pages/AccountingBudget";
import AccountingReports from "./pages/AccountingReports";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import BranchFinancials from "./pages/BranchFinancials";
import RoyaltyDashboard from "./pages/RoyaltyDashboard";
import CrmDashboard from "./pages/CrmDashboard";
import QaDashboard from "./pages/QaDashboard";
import QaFieldAudit from "./pages/QaFieldAudit";
import QaCompliance from "./pages/QaCompliance";
import ParentMessages from "./pages/ParentMessages";
import ParentFees from "./pages/ParentFees";
import ParentChat from "./pages/ParentChat";
import StaffInbox from "./pages/StaffInbox";
import Announcements from "./pages/Announcements";
import DataMigrationHub from "./pages/DataMigrationHub";
import Newsletters from "./pages/Newsletters";
import StaffAnnouncements from "./pages/StaffAnnouncements";
import HelpCenter from "./pages/HelpCenter";
import EForms from "./pages/EForms";
import EFormBuilder from "./pages/EFormBuilder";
import EFormPublic from "./pages/EFormPublic";
import TimetableManagement from "./pages/TimetableManagement";
import TimetableTemplateConfig from "./pages/TimetableTemplateConfig";
import TimetablePrint from "./pages/TimetablePrint";
import EnrollmentAssessments from "./pages/EnrollmentAssessments";
import YearlyPlanner from "./pages/YearlyPlanner";
import SchoolCalendar from "./pages/SchoolCalendar";
import PlanningHub from "./pages/PlanningHub";
import CurriculumCommandCenter from "./pages/CurriculumCommandCenter";
import LearningMedia from "./pages/LearningMedia";
import HRCalendar from "./pages/HRCalendar";
import HRSettings from "./pages/HRSettings";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import InstallAnalytics from "./pages/InstallAnalytics";
import InvoiceList from "./pages/finance/InvoiceList";
import InvoiceDetail from "./pages/finance/InvoiceDetail";
import CreateInvoice from "./pages/finance/CreateInvoice";
import TransactionHistory from "./pages/finance/TransactionHistory";
import AccountList from "./pages/finance/AccountList";
import AccountStatement from "./pages/finance/AccountStatement";
import PaymentDetail from "./pages/finance/PaymentDetail";
import UnallocatedPayments from "./pages/finance/UnallocatedPayments";
import DisputeManagement from "./pages/finance/DisputeManagement";
import GatewayEventsLog from "./pages/finance/GatewayEventsLog";
import ReconciliationDashboard from "./pages/finance/ReconciliationDashboard";
import ApprovalRules from "./pages/finance/ApprovalRules";
import ApprovalInbox from "./pages/finance/ApprovalInbox";
import ApprovalDetail from "./pages/finance/ApprovalDetail";
import ArAging from "./pages/finance/ArAging";
import CollectionsWorkbench from "./pages/finance/CollectionsWorkbench";
import PayerAccounts from "./pages/finance/PayerAccounts";
import PayerProfile from "./pages/finance/PayerProfile";
import BillingSettings from "./pages/finance/BillingSettings";
import FinanceKPIDashboard from "./pages/finance/FinanceKPIDashboard";
import FinanceReports from "./pages/finance/FinanceReports";
import FinanceRefunds from "./pages/finance/FinanceRefunds";
import PricingRules from "./pages/finance/PricingRules";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache reads for 60s — eliminates the storm of duplicate Supabase
      // requests fired every time a user navigates between pages or
      // re-focuses the tab. Huge perceived-speed win for parents/teachers
      // on mobile networks. Pages that need fresher data can still pass
      // their own staleTime / refetchInterval per-query.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Only show global error if the mutation doesn't have its own onError handler
      if (!mutation.options.onError) {
        toastError(error);
      }
    },
  }),
});

function TimelineLegacyRedirect() {
  const { studentId } = useParams<{ studentId: string }>();
  return <Navigate to={`/students/${studentId}?tab=timeline`} replace />;
}

/**
 * Root redirect: parents who installed the Parent PWA (or whose last active
 * role was parent) land on /child; everyone else goes to /dashboard.
 * Prevents parents opening the bare domain from being routed into the
 * staff dashboard gate and getting stuck on the splash.
 */
function RootRedirect() {
  let isParent = false;
  try {
    if (localStorage.getItem("sprouts:parent_pwa") === "1") {
      isParent = true;
    } else {
      // Last chosen active role for any signed-in user
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("active-role:") && localStorage.getItem(k) === "parent") {
          isParent = true;
          break;
        }
      }
    }
  } catch {}
  return <Navigate to={isParent ? "/child" : "/dashboard"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
          <IconUpdateModal />
          <DynamicFavicon />
          <PwaUpdateToast />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/index" element={<RootRedirect />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
            <Route path="/pending" element={<Pending />} />
            <Route path="/select-role" element={<SelectRole />} />
            <Route path="/parent-onboarding" element={<ProtectedRoute allowedRoles={["parent"]}><ParentFirstRunOnboarding /></ProtectedRoute>} />
            <Route path="/install" element={<Navigate to="/install/parents" replace />} />
            <Route path="/install/parents" element={<Install variant="parents" />} />
            <Route path="/install/teachers" element={<Install variant="teachers" />} />
            <Route path="/install/analytics" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><InstallAnalytics /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/curriculum" element={<ProtectedRoute><Curriculum /></ProtectedRoute>} />
            <Route path="/organizations" element={<ProtectedRoute allowedRoles={["super_admin"]}><Organizations /></ProtectedRoute>} />
            <Route path="/organizations/:id" element={<ProtectedRoute allowedRoles={["super_admin"]}><OrganizationDetail /></ProtectedRoute>} />
            <Route path="/branches" element={<ProtectedRoute allowedRoles={["super_admin"]}><Branches /></ProtectedRoute>} />
            <Route path="/branches/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><BranchDetail /></ProtectedRoute>} />
            <Route path="/users" element={<Navigate to="/staff-management?tab=administrators" replace />} />
            <Route path="/admin/role-matrix" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee"]}><RoleMatrix /></ProtectedRoute>} />
            <Route path="/admin/temp-password" element={<ProtectedRoute allowedRoles={["super_admin"]}><TempPasswordAdmin /></ProtectedRoute>} />
            <Route path="/claims" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><Claims /></ProtectedRoute>} />
            <Route path="/lesson-planner" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><LessonPlanner /></ProtectedRoute>} />
            <Route path="/curriculum-browser" element={<Navigate to="/curriculum" replace />} />
            <Route path="/worksheets" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><WorksheetLibrary /></ProtectedRoute>} />
            <Route path="/students" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><Students /></ProtectedRoute>} />
            <Route path="/classrooms" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><ClassroomWorkspace /></ProtectedRoute>} />
            <Route path="/students/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StudentDetail /></ProtectedRoute>} />
            {/*
             * Legacy "full progress" page — kept available for the deeper KSPK
             * standards grid + AI Watchdog + printable report, but the profile
             * "Progress" hub is the new default surface.
             */}
            <Route path="/students/:id/progress" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StudentProgress /></ProtectedRoute>} />
            <Route path="/daily-updates" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><DailyUpdates /></ProtectedRoute>} />
            <Route path="/observations" element={<Navigate to="/daily-updates" replace />} />
            <Route path="/analytics" element={<Navigate to="/curriculum/dashboard/review" replace />} />
           <Route path="/child" element={<ProtectedRoute allowedRoles={["parent"]}><ParentHome /></ProtectedRoute>} />
            <Route path="/journey" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChildView mode="journey" /></ProtectedRoute>} />
            <Route path="/check-in" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChildView mode="today" /></ProtectedRoute>} />
            <Route path="/progress" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChildView mode="progress" /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChildView mode="account" /></ProtectedRoute>} />
            <Route path="/parent-fees" element={<ProtectedRoute allowedRoles={["parent"]}><ParentFees /></ProtectedRoute>} />
            <Route path="/parent-messages" element={<ProtectedRoute allowedRoles={["parent"]}><ParentMessages /></ProtectedRoute>} />
            <Route path="/learning-stories" element={<Navigate to="/child" replace />} />
            <Route path="/child/portfolio" element={<Navigate to="/child" replace />} />
            <Route path="/child/albums" element={<Navigate to="/child" replace />} />
            <Route path="/parent-chat" element={<ProtectedRoute allowedRoles={["parent"]}><ParentChat /></ProtectedRoute>} />
            <Route path="/staff-inbox" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StaffInbox /></ProtectedRoute>} />
            <Route path="/attendance" element={<Navigate to="/classrooms" replace />} />
            <Route path="/staff-attendance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StaffAttendance /></ProtectedRoute>} />
            <Route path="/leave" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><LeaveManagement /></ProtectedRoute>} />
            <Route path="/leave-management" element={<Navigate to="/leave" replace />} />
            <Route path="/payroll" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><Payroll /></ProtectedRoute>} />
            <Route path="/my-payslips" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><MyPayslips /></ProtectedRoute>} />
            <Route path="/staff-performance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StaffPerformance /></ProtectedRoute>} />
            <Route path="/billing" element={<Navigate to="/finance/invoices" replace />} />
            <Route path="/fee-packages" element={<Navigate to="/finance/pricing" replace />} />
            <Route path="/cashflow" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><CashflowProjections /></ProtectedRoute>} />
            <Route path="/staff-management" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><StaffManagement /></ProtectedRoute>} />
            <Route path="/staff-management/org-chart" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><OrgChart /></ProtectedRoute>} />
            <Route path="/staff-management/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><StaffDetail /></ProtectedRoute>} />
            <Route path="/overtime" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><OvertimeRequests /></ProtectedRoute>} />
            <Route path="/payroll/adjustments" element={<ProtectedRoute allowedRoles={["super_admin", "admin"]}><PayrollAdjustments /></ProtectedRoute>} />
            <Route path="/accounting/accounts" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ChartOfAccounts /></ProtectedRoute>} />
            <Route path="/accounting/transactions" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AccountingTransactions /></ProtectedRoute>} />
            <Route path="/accounting/budget" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AccountingBudget /></ProtectedRoute>} />
            <Route path="/accounting/reports" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AccountingReports /></ProtectedRoute>} />
            <Route path="/branch-financials" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><BranchFinancials /></ProtectedRoute>} />
            <Route path="/royalty-dashboard" element={<ProtectedRoute allowedRoles={["super_admin"]}><RoyaltyDashboard /></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "staff"]}><CrmDashboard /></ProtectedRoute>} />
            <Route path="/qa-dashboard" element={<ProtectedRoute allowedRoles={["super_admin"]}><QaDashboard /></ProtectedRoute>} />
            <Route path="/qa-audit" element={<ProtectedRoute allowedRoles={["super_admin"]}><QaFieldAudit /></ProtectedRoute>} />
            <Route path="/qa-compliance" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><QaCompliance /></ProtectedRoute>} />
            <Route path="/announcements" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><Announcements /></ProtectedRoute>} />
            <Route path="/data-migration" element={<ProtectedRoute allowedRoles={["super_admin"]}><DataMigrationHub /></ProtectedRoute>} />
            <Route path="/newsletters" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><Newsletters /></ProtectedRoute>} />
            <Route path="/staff-announcements" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><StaffAnnouncements /></ProtectedRoute>} />
            <Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin/email" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><EmailAdmin /></ProtectedRoute>} />
            <Route path="/admin/parent-onboarding" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ParentOnboardingAdmin /></ProtectedRoute>} />
            <Route path="/admin/school-documents" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><SchoolDocumentsAdmin /></ProtectedRoute>} />
            <Route path="/school-documents" element={<ProtectedRoute allowedRoles={["parent"]}><ParentSchoolDocuments /></ProtectedRoute>} />
            <Route path="/settings/email" element={<Navigate to="/admin/email" replace />} />
            <Route path="/settings/email-templates" element={<Navigate to="/admin/email?tab=templates" replace />} />
            <Route path="/eforms" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "staff"]}><EForms /></ProtectedRoute>} />
            <Route path="/eforms/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><EFormBuilder /></ProtectedRoute>} />
            <Route path="/form/:token" element={<EFormPublic />} />
            <Route path="/timetables" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><TimetableManagement /></ProtectedRoute>} />
            <Route path="/timetables/template" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><TimetableTemplateConfig /></ProtectedRoute>} />
            <Route path="/timetables/print/:classId" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><TimetablePrint /></ProtectedRoute>} />
            <Route path="/assessments" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><EnrollmentAssessments /></ProtectedRoute>} />
            <Route path="/planning-hub" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><PlanningHub /></ProtectedRoute>} />
            <Route path="/curriculum/command-center" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><CurriculumCommandCenter /></ProtectedRoute>} />
            <Route path="/learning-media" element={<Navigate to="/daily-updates?tab=albums" replace />} />
            <Route path="/yearly-planner" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><YearlyPlanner /></ProtectedRoute>} />
            <Route path="/school-calendar" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><SchoolCalendar /></ProtectedRoute>} />
            <Route path="/curriculum-framework" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><CurriculumFramework /></ProtectedRoute>} />
            <Route path="/theme-bank" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><ThemeBank /></ProtectedRoute>} />
            <Route path="/curriculum/monthly" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><MonthlyCurriculumPlanner /></ProtectedRoute>} />
            <Route path="/curriculum/weekly" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><WeeklyCurriculumPlanner /></ProtectedRoute>} />
            <Route path="/development-domains" element={<Navigate to="/curriculum-framework?tab=domains" replace />} />
            <Route path="/age-outcomes" element={<Navigate to="/yearly-outcomes" replace />} />
            <Route path="/yearly-outcomes" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><YearlyOutcomes /></ProtectedRoute>} />
            <Route path="/objective-bank" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><ObjectiveBank /></ProtectedRoute>} />
            <Route path="/curriculum/objective-catalogue" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ObjectiveCatalogue /></ProtectedRoute>} />
            <Route path="/curriculum/vocabulary-matrix" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><VocabularyMatrix /></ProtectedRoute>} />
            <Route path="/curriculum/school-methodology" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><SchoolMethodology /></ProtectedRoute>} />
            <Route path="/curriculum/lessons" element={<Navigate to="/lesson-planner" replace />} />
            <Route path="/curriculum/lessons/generate" element={<Navigate to="/lesson-planner" replace />} />
            <Route path="/curriculum/lessons/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><LessonPlanDetail /></ProtectedRoute>} />
            <Route path="/curriculum/centers" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><LearningCenterPlanner /></ProtectedRoute>} />
            <Route path="/curriculum/observations/record" element={<Navigate to="/daily-updates" replace />} />
            <Route path="/curriculum/journey" element={<Navigate to="/daily-updates" replace />} />
            <Route path="/curriculum/journey/review" element={<Navigate to="/daily-updates?filter=drafts" replace />} />
            <Route path="/curriculum/readiness" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><ClassReadiness /></ProtectedRoute>} />
            <Route path="/curriculum/observations/dashboard" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ObservationDashboard /></ProtectedRoute>} />
            <Route path="/curriculum/readiness/dashboard" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ReadinessDashboard /></ProtectedRoute>} />
            <Route path="/curriculum/journey/timeline" element={<Navigate to="/students" replace />} />
            <Route path="/curriculum/journey/timeline/:studentId" element={<TimelineLegacyRedirect />} />
            <Route path="/curriculum/ptm" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><PtmWorkspace /></ProtectedRoute>} />
            <Route path="/curriculum/ptm/prep" element={<Navigate to="/curriculum/ptm" replace />} />
            <Route path="/curriculum/ptm/generate/:studentId" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher"]}><PtmReportGenerator /></ProtectedRoute>} />
            <Route path="/curriculum/ptm/meetings" element={<Navigate to="/curriculum/ptm?tab=meetings" replace />} />
            <Route path="/curriculum/ptm/meetings/:id" element={<Navigate to="/curriculum/ptm?tab=meetings" replace />} />
            <Route path="/curriculum/ptm/slots" element={<Navigate to="/curriculum/ptm?tab=bookings" replace />} />
            <Route path="/curriculum/ptm/bookings" element={<Navigate to="/curriculum/ptm?tab=bookings" replace />} />
            <Route path="/parent-ptm" element={<ProtectedRoute allowedRoles={["parent"]}><ParentPTM /></ProtectedRoute>} />
            <Route path="/curriculum/dashboard/coverage" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><CurriculumCoverageDashboard /></ProtectedRoute>} />
            <Route path="/curriculum/dashboard/quality" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><TeacherPlanningQualityDashboard /></ProtectedRoute>} />
            <Route path="/curriculum/dashboard/ptm" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><PtmCompletionDashboard /></ProtectedRoute>} />
            <Route path="/curriculum/dashboard/review" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AcademicLeaderReview /></ProtectedRoute>} />
            <Route path="/hr-calendar" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin", "teacher", "staff"]}><HRCalendar /></ProtectedRoute>} />
            <Route path="/hr-settings" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><HRSettings /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/finance/invoices" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><InvoiceList /></ProtectedRoute>} />
            <Route path="/finance/invoices/new" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><CreateInvoice /></ProtectedRoute>} />
            <Route path="/finance/invoices/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><InvoiceDetail /></ProtectedRoute>} />
            <Route path="/finance/transactions" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><TransactionHistory /></ProtectedRoute>} />
            <Route path="/finance/accounts" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AccountList /></ProtectedRoute>} />
            <Route path="/finance/accounts/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AccountStatement /></ProtectedRoute>} />
            <Route path="/finance/payments/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><PaymentDetail /></ProtectedRoute>} />
            <Route path="/finance/unallocated" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><UnallocatedPayments /></ProtectedRoute>} />
            <Route path="/finance/disputes" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><DisputeManagement /></ProtectedRoute>} />
            <Route path="/finance/gateway-events" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><GatewayEventsLog /></ProtectedRoute>} />
            <Route path="/finance/reconciliation" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ReconciliationDashboard /></ProtectedRoute>} />
            <Route path="/finance/approval-rules" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ApprovalRules /></ProtectedRoute>} />
            <Route path="/finance/approvals" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ApprovalInbox /></ProtectedRoute>} />
            <Route path="/finance/approvals/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ApprovalDetail /></ProtectedRoute>} />
            <Route path="/finance/ar-aging" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><ArAging /></ProtectedRoute>} />
            <Route path="/finance/collections" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><CollectionsWorkbench /></ProtectedRoute>} />
            <Route path="/finance/payers" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><PayerAccounts /></ProtectedRoute>} />
            <Route path="/finance/payers/:id" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><PayerProfile /></ProtectedRoute>} />
            <Route path="/finance/billing-settings" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><BillingSettings /></ProtectedRoute>} />
            <Route path="/finance/kpi-dashboard" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><FinanceKPIDashboard /></ProtectedRoute>} />
            <Route path="/finance/reports" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><FinanceReports /></ProtectedRoute>} />
            <Route path="/finance/refunds" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><FinanceRefunds /></ProtectedRoute>} />
            <Route path="/finance/pricing" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><PricingRules /></ProtectedRoute>} />
            <Route path="/curriculum/dashboard/all-plans" element={<ProtectedRoute allowedRoles={["super_admin", "franchisee", "admin"]}><AllLessonPlans /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
