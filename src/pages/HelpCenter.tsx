import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth, getRoleLabel } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  BookOpen,
  HelpCircle,
  GraduationCap,
  Users,
  ClipboardList,
  DollarSign,
  MessageSquare,
  BarChart3,
  Settings,
  Shield,
  Briefcase,
  FileText,
  CheckCircle2,
  ArrowRight,
  Lightbulb,
  Play,
  Rocket,
  Star,
} from "lucide-react";

type AppRole = "super_admin" | "franchisee" | "admin" | "teacher" | "parent";

interface GuideStep {
  title: string;
  description: string;
  tip?: string;
}

interface WalkthroughSection {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  roles: AppRole[];
  steps: GuideStep[];
}

interface FAQItem {
  question: string;
  answer: string;
  roles: AppRole[];
  category: string;
}

const walkthroughSections: WalkthroughSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    description: "Your first steps after logging in — set up your profile and explore the dashboard.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    steps: [
      {
        title: "Complete Your Profile",
        description: "Navigate to Settings and fill in your personal details — name, phone number, and profile photo. This helps your team identify you across the platform.",
        tip: "Staff members will also see the onboarding wizard on their first login to guide them through essential setup.",
      },
      {
        title: "Explore the Dashboard",
        description: "The Dashboard is your home base. It shows key metrics at a glance — student count, attendance rates, and quick links to your most-used features.",
      },
      {
        title: "Navigate Using the Sidebar",
        description: "The left sidebar organizes all features into groups like Academic, Communication, HR, and Billing. Click any group to expand it, then click a feature to open it.",
        tip: "On mobile, tap the menu icon (☰) to open the sidebar.",
      },
    ],
  },
  {
    id: "student-management",
    title: "Student Management",
    icon: GraduationCap,
    description: "Enroll students, manage profiles, track attendance, and monitor progress.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    steps: [
      {
        title: "Add a New Student",
        description: "Go to Students → click 'Add Student'. Fill in the child's name, date of birth, class assignment, and parent contact details. The student will appear in attendance and observation lists immediately.",
      },
      {
        title: "Take Daily Attendance",
        description: "Go to Attendance → select today's date and class. Mark each student as Present, Absent, Late, or Excused. You can also record health status, temperature, mood, and body marks during check-in.",
        tip: "Attendance records are visible to parents in real-time through their portal.",
      },
      {
        title: "Record Observations",
        description: "Go to Observations → click 'New Observation'. Select a student, write your observation notes, attach photos, and tag relevant learning areas. AI will suggest tags automatically.",
        tip: "Observations feed into each student's progress radar chart and learning stories.",
      },
      {
        title: "View Student Progress",
        description: "Click on any student → Progress tab. You'll see a radar chart of competency development, observation history, and can generate PTM (Parent-Teacher Meeting) reports.",
      },
    ],
  },
  {
    id: "curriculum-planning",
    title: "Curriculum & Lesson Planning",
    icon: BookOpen,
    description: "Browse the national curriculum, plan lessons with AI assistance, and manage worksheets.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    steps: [
      {
        title: "Browse the Curriculum",
        description: "Go to Curriculum Browser to explore learning areas and standards organized by the national preschool curriculum (KSPK). Each standard shows its code, description, and age level.",
      },
      {
        title: "Create a Lesson Plan",
        description: "Go to Lesson Planner → click 'New Plan'. Choose your theme, age group, duration, and learning areas. The AI will generate a complete lesson plan with activities, materials, and assessment criteria.",
        tip: "You can refine the AI-generated plan by chatting with the AI assistant — ask it to adjust activities, add more detail, or change the approach.",
      },
      {
        title: "Use the Worksheet Library",
        description: "Go to Worksheets to browse and download printable worksheets organized by subject and age group. Teachers with library manager access can upload new worksheets.",
      },
    ],
  },
  {
    id: "communication",
    title: "Communication",
    icon: MessageSquare,
    description: "Stay connected with parents through chat, announcements, and newsletters.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    steps: [
      {
        title: "Reply to Parent Messages",
        description: "Go to Parent Inbox to see all conversations. Click a conversation to read messages and reply. The AI automatically classifies message intent and sentiment to help you prioritize.",
        tip: "Branch Managers and Admins can see all conversations for their branch. Teachers only see conversations assigned to them.",
      },
      {
        title: "Send Announcements",
        description: "Go to Announcements → click 'New Announcement'. Write your message, choose the target audience (all parents, specific class, or individual parents), and publish. Parents receive a notification immediately.",
      },
      {
        title: "Create a Newsletter",
        description: "Go to Newsletters → click 'New Newsletter'. Use the block editor to build rich content — add headings, text, images, buttons, and dividers. Drag blocks to reorder them. Preview the email layout, then send to parents, staff, or both.",
        tip: "Upload your school logo in Settings → Email to have it appear in all newsletter headers.",
      },
    ],
  },
  {
    id: "hr-management",
    title: "Human Resource Management",
    icon: Briefcase,
    description: "Manage staff profiles, attendance, leave, payroll, and performance.",
    roles: ["super_admin", "franchisee", "admin"],
    steps: [
      {
        title: "Manage Staff",
        description: "Go to Staff Management to view all staff members. Click on any staff member to see their profile, documents, attendance history, and leave balances.",
      },
      {
        title: "Track Staff Attendance",
        description: "Go to Staff Attendance to record daily clock-in/out times. The system automatically detects overtime when staff work beyond their scheduled hours.",
      },
      {
        title: "Process Leave Requests",
        description: "Go to Leave Management to view pending leave requests. You can approve or reject requests, and the system automatically updates leave balances. Staff can also submit leave requests with supporting documents.",
        tip: "Leave requests support a 2-level approval workflow for larger organizations.",
      },
      {
        title: "Run Payroll",
        description: "Go to Payroll to generate monthly payslips. The system calculates base salary, overtime, deductions (EPF, SOCSO, EIS), and generates printable payslips that staff can view in My Payslips.",
      },
      {
        title: "Review Performance",
        description: "Go to Performance to track staff KPIs, conduct performance reviews, and set improvement goals.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Fees",
    icon: DollarSign,
    description: "Create invoices, manage fee packages, and track payments.",
    roles: ["super_admin", "franchisee", "admin"],
    steps: [
      {
        title: "Set Up Fee Packages",
        description: "Go to Fee Packages to create monthly, one-time, or recurring fee items (tuition, meals, transport, uniforms). Group related fees into packages for easy invoice generation.",
      },
      {
        title: "Generate Invoices",
        description: "Go to Billing → click 'New Invoice'. Select the student, billing period, and fee packages. The system calculates totals, discounts, and taxes automatically. You can also set up recurring invoice generation.",
      },
      {
        title: "Record Payments",
        description: "Click on any invoice to record a payment — cash, bank transfer, or online. The invoice status updates automatically (draft → issued → paid/overdue).",
        tip: "Parents can view their invoices and payment history in their Fees & Invoices section.",
      },
      {
        title: "View Cashflow Projections",
        description: "Go to Cashflow & Projections to see expected revenue based on outstanding invoices and recurring fees. This helps with financial planning.",
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    icon: FileText,
    description: "Manage your chart of accounts, record transactions, set budgets, and generate reports.",
    roles: ["super_admin", "franchisee", "admin"],
    steps: [
      {
        title: "Set Up Chart of Accounts",
        description: "Go to Chart of Accounts to create income, expense, asset, and liability accounts. The system comes with default accounts that you can customize.",
      },
      {
        title: "Record Transactions",
        description: "Go to Transactions to log income and expenses against your accounts. Attach receipts and categorize each entry for accurate reporting.",
      },
      {
        title: "Set Monthly Budgets",
        description: "Go to Budget to set spending limits for each account category. Compare actual spending against budgets with visual indicators.",
      },
      {
        title: "Generate Reports",
        description: "Go to Reports for financial summaries — income statements, expense breakdowns, and budget variance reports.",
      },
    ],
  },
  {
    id: "parent-portal",
    title: "Parent Portal Guide",
    icon: Star,
    description: "Everything you need as a parent — daily moments, progress evidence, attendance, meetings, chat, school updates and fees.",
    roles: ["parent"],
    steps: [
      {
        title: "Link your child (one-time)",
        description: "On first login, enter the 6-digit access code the school shared with you. Each child has their own code. To add another child later, open Account & Profile → Add another child.",
        tip: "If your code does not work, ask the school office to re-generate it from the student profile.",
      },
      {
        title: "Hero carousel — Child & Fees",
        description: "At the top of Journey you'll see a swipeable hero card. Slide 1 shows your child, class and skills assessed so far. Slide 2 shows your fees overview. When you have an overdue or outstanding balance, the Fees slide appears first automatically.",
      },
      {
        title: "Journey — Today's moments",
        description: "Journey is your daily feed of photos, videos and learning stories shared by teachers. Tap ❤ to react and 💬 to comment — the teacher, admins and other linked parents get notified. Filter by subject, domain or tap Milestones to see only celebrated achievements.",
      },
      {
        title: "Daily Check-In",
        description: "See today's attendance, mood, meals, naps, temperature and who is picking your child up. Use Request Pickup Change if someone different will collect your child.",
      },
      {
        title: "Progress — Evidence-based reports",
        description: "Open Progress to see a radar of your child's development across all learning areas. Tap any skill standard to expand it — you'll see the latest teacher notes, photos, videos and worksheets used to make the assessment, with proficiency badges 🌱 Building, 🌿 Growing, 🌳 Confident.",
        tip: "We show the 3 most recent observations per skill. Tap 'Show older' to view the full history.",
      },
      {
        title: "PTM (Parent-Teacher Meetings)",
        description: "Book and view PTM slots, and read the printable PTM report the teacher prepared for your child. Reports include domain summaries, photos and recommended next steps at home.",
      },
      {
        title: "Chat with School",
        description: "Direct chat with your child's teacher and school admin. Attach photos or files. You'll get a push notification on reply and the unread count shows on the sidebar.",
      },
      {
        title: "School Updates & Newsletters",
        description: "Branch announcements and newsletters live under School Updates. Items you've already opened are marked as read so you can focus on the new ones.",
      },
      {
        title: "Fees & Invoices",
        description: "Fees & Invoices shows your balance, overdue count and next due date. Open any invoice to pay online via FPX (BillPlz) or to download the receipt for paid invoices.",
        tip: "If your hero card shows red 'Action needed', tap Pay now to go straight to your overdue invoice.",
      },
      {
        title: "Account & Profile",
        description: "Keep emergency contacts, allergies, medical and dietary notes up to date — teachers rely on these to keep your child safe. You can also change password, switch language and install the mobile app from here.",
      },
    ],
  },
  {
    id: "admin-setup",
    title: "Administration & Setup",
    icon: Settings,
    description: "Configure organizations, branches, users, and system settings.",
    roles: ["super_admin"],
    steps: [
      {
        title: "Create Organizations & Branches",
        description: "Go to Organizations to create branch groups, then add branches under each organization. Each branch operates independently with its own students, staff, and billing.",
      },
      {
        title: "Manage Users & Roles",
        description: "Go to Users to view all accounts. Assign roles (Super Admin, Branch Manager, Admin, Teacher, Parent) and link users to their branches. Use Roles & Permissions to fine-tune which features each Admin can access.",
        tip: "Branch Managers have full branch access. Admins get the same capabilities but their sidebar is filtered by their assigned Role — perfect for office staff who only need specific features.",
      },
      {
        title: "Configure Roles & Permissions",
        description: "Open Administration → Roles & Permissions to create roles like 'Finance Team' or 'Front Desk'. Toggle which modules each role can view or manage, then add staff to the appropriate role.",
      },
      {
        title: "Set Up Email Branding",
        description: "Go to Settings → Email Settings to configure your school's sender name, brand color, logo, and footer text. These appear on all automated emails, invoices, and newsletters.",
      },
    ],
  },
  {
    id: "qa-compliance",
    title: "Quality & Compliance",
    icon: Shield,
    description: "Conduct audits, track compliance, and maintain quality standards.",
    roles: ["super_admin"],
    steps: [
      {
        title: "Create Audit Templates",
        description: "Go to QA Dashboard to create standardized audit checklists with categories (safety, hygiene, curriculum, etc.). Mark critical items that must pass.",
      },
      {
        title: "Conduct Field Audits",
        description: "Go to Field Audit to start an audit at any branch. Walk through each checklist item, add notes and photo evidence, and submit scores.",
      },
      {
        title: "Track Compliance",
        description: "Go to Compliance View to see audit results across all branches. Monitor corrective actions and verify resolution with proof uploads.",
      },
    ],
  },
  {
    id: "crm",
    title: "CRM & Enrollment",
    icon: Users,
    description: "Track leads, manage inquiries, and convert prospects into enrolled students.",
    roles: ["super_admin", "franchisee", "admin"],
    steps: [
      {
        title: "Add New Leads",
        description: "Go to CRM & Enrollment → click 'Add Lead'. Record the parent's name, child's details, and contact information. Set the status to track their journey.",
      },
      {
        title: "Move Leads Through the Pipeline",
        description: "Update lead status as they progress: New → Contacted → Tour Scheduled → Waitlisted → Enrolled. Add notes at each stage to track conversations.",
      },
      {
        title: "Convert to Student",
        description: "Once a lead is enrolled, create their student profile in the Students section and send a parent invitation email to onboard the parent.",
      },
    ],
  },
];

const faqItems: FAQItem[] = [
  // General
  {
    question: "How do I change my password?",
    answer: "Go to Settings and look for the password section. Enter your current password and your new password to update it. If you've forgotten your password, use the 'Forgot Password' link on the login page.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "General",
  },
  {
    question: "How do I update my profile information?",
    answer: "Go to Settings to update your name, phone number, and other personal details. Staff members can also update their emergency contact and banking information.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "General",
  },
  {
    question: "I can't see certain features in my sidebar. Why?",
    answer: "Your sidebar shows only the features assigned to your role and role. If you need access to additional features, contact your Branch Manager to update your Role permissions.",
    roles: ["admin", "teacher"],
    category: "General",
  },
  {
    question: "How do notifications work?",
    answer: "You receive in-app notifications for important events — new messages, leave approvals, payment confirmations, and announcements. Click the bell icon in the top bar to view them. You can also enable push notifications in your browser for real-time alerts.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "General",
  },
  // Students & Attendance
  {
    question: "How do I mark attendance for a whole class at once?",
    answer: "Go to Attendance, select the class and date. All students in the class are listed — you can quickly mark each one. Use the health check-in fields to record temperature, mood, and any health notes during arrival.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Students",
  },
  {
    question: "Can I edit attendance after it's been submitted?",
    answer: "Yes. Go to Attendance, find the student's record for that day, and click Edit. You can update the status and add notes. Changes are logged for audit purposes.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Students",
  },
  {
    question: "How do I link a parent to a student?",
    answer: "Go to the student's detail page and use the Parent section to send an invitation email. The parent will receive a link to create their account and will be automatically linked to the student.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Students",
  },
  {
    question: "What are observations and how do they help?",
    answer: "Observations are teacher notes about a student's learning and development. They can include text descriptions and photos. Observations are linked to curriculum competencies and build up a student's progress profile over time. Parents can see them as part of Learning Stories.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Students",
  },
  // Billing & Fees
  {
    question: "How do I generate invoices for all students at once?",
    answer: "Go to Billing and use the batch invoice generation feature. Select the billing month, and the system will create invoices for all active students based on their assigned fee packages.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Billing",
  },
  {
    question: "How do I handle refunds or credits?",
    answer: "Go to Billing → Refunds & Credits tab. Create a credit note specifying the student, amount, and reason. Once approved, it will offset against future invoices or can be processed as a refund.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Billing",
  },
  {
    question: "Can parents view their invoices online?",
    answer: "Yes! Parents can see all invoices and payment history in their Fees & Invoices section. They'll also receive email notifications when new invoices are issued.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Billing",
  },
  // HR
  {
    question: "How does the leave approval process work?",
    answer: "Staff submit leave requests with the type, dates, and reason. The request goes to the Branch Manager (Level 1) for approval. Some organizations have a 2-level approval process. Staff are notified of the decision, and leave balances update automatically.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "HR",
  },
  {
    question: "How do I view my payslips?",
    answer: "Go to My Payslips to see all your generated payslips. You can view the breakdown of earnings and deductions, and print/download each payslip.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "HR",
  },
  {
    question: "How do I submit a claim?",
    answer: "Go to Claims → click 'New Claim'. Enter the claim type, amount, date, and description. Attach a receipt photo. The claim will be reviewed by your Branch Manager.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "HR",
  },
  // Communication
  {
    question: "How do parents receive newsletters?",
    answer: "When you send a newsletter, it's delivered as a branded HTML email to all recipients in the selected audience (parents, staff, or both). The email includes your school logo and branding.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Communication",
  },
  {
    question: "Can I schedule announcements?",
    answer: "Currently, announcements are published immediately when you click Send. You can save drafts and publish them when ready.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Communication",
  },
  {
    question: "How do message notifications work between parents and staff?",
    answer: "Every new message — whether from a parent or staff — triggers a real-time notification for the recipient. Staff see unread message counts as red badges on the Parent Inbox sidebar item and on individual conversations. Parents see the same badges on Chat with School. The notification bell in the top bar also shows new message alerts. Badges update instantly via real-time subscriptions.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "Communication",
  },
  {
    question: "Why do I see unread message badges on the sidebar?",
    answer: "Red badge numbers on sidebar items show unread messages waiting for your response. Click the item to view and respond. Once you open a conversation, messages are marked as read and the badge count decreases.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "Communication",
  },
  // Parent-specific
  {
    question: "How do I see my child's daily attendance?",
    answer: "Open Daily Check-In from the sidebar. You'll see whether your child was marked present, absent, late or excused, plus mood, meals, naps, temperature and pickup details for the day.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I contact my child's teacher?",
    answer: "Go to Chat with School to start or continue a conversation with the school. Your messages are routed to the relevant teacher or admin.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I pay fees online?",
    answer: "Open Fees & Invoices, tap an unpaid invoice and choose Pay now. Payment is processed securely via FPX online banking (BillPlz). Receipts appear automatically once payment is confirmed.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I link my child to my account?",
    answer: "Ask the school for a 6-digit access code (one per child). Enter it on the Connect Your Child screen on first login, or from Account & Profile → Add another child. Approval is automatic.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "What do 🌱 Building, 🌿 Growing and 🌳 Confident mean?",
    answer: "Those are the three proficiency levels teachers use when assessing a skill. 🌱 Building (TP1) = your child is starting to explore the skill. 🌿 Growing (TP2) = practising with support. 🌳 Confident (TP3) = uses the skill independently.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "Where can I see the photos / videos the teacher used to assess my child?",
    answer: "Open Progress, expand any skill standard — each observation shows the teacher's note, proficiency badge and the actual photos, videos and worksheets used as evidence. Up to 3 recent observations are shown per skill; tap Show older for more.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do likes and comments work on Moments?",
    answer: "Tap ❤ to react or 💬 to add a comment on any moment. The teacher who shared it, the class teachers, branch admins and other linked parents get notified. Tap a notification to jump straight back to that moment.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "My fees show as overdue — what should I do?",
    answer: "Open Fees & Invoices and pay the overdue invoice via FPX. If you've already paid offline (bank transfer or cash at the centre), reach out via Chat with School with the payment proof and the school will reconcile it on their end.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I install the Sprouts mobile app?",
    answer: "Tap Get the mobile app at the top of Journey, or open Account & Profile → Install app. On Android use 'Add to Home screen' in Chrome. On iPhone open in Safari → Share → Add to Home Screen.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I book or join a Parent-Teacher Meeting?",
    answer: "Open PTM (Meetings) from the sidebar. Available slots are listed by date — pick one and book. Your meeting report (with photos, domain summaries and recommended next steps) appears under the same screen after the PTM.",
    roles: ["parent"],
    category: "Parent",
  },
  {
    question: "How do I change my password or update emergency contacts?",
    answer: "Open Account & Profile. From there you can edit emergency contacts, allergies, dietary and medical notes, change your password and switch language. Don't forget to tap Save changes at the bottom.",
    roles: ["parent"],
    category: "Parent",
  },
  // Admin & Access
  {
    question: "What's the difference between Branch Manager, Admin, and Teacher roles?",
    answer: "Branch Manager has full access to all branch features. Admin has the same capabilities but their access is controlled by Roles — the Branch Manager decides which modules each Admin can see. Teachers have access to academic features (students, attendance, observations, lesson planning) and basic HR features.",
    roles: ["super_admin", "franchisee", "admin"],
    category: "Administration",
  },
  {
    question: "How do I restrict an Admin's access to specific features?",
    answer: "Go to Users → Roles tab. Create a group (e.g. 'Finance Team'), select the modules they should access, then add the Admin user to that group. They'll only see the selected features in their sidebar.",
    roles: ["super_admin", "franchisee"],
    category: "Administration",
  },
  {
    question: "How do I add a new branch?",
    answer: "Go to Branches → click 'Add Branch'. Enter the branch name, address, phone, email, and assign it to an organization. Then add staff members as branch members.",
    roles: ["super_admin"],
    category: "Administration",
  },
  // Latest Features
  {
    question: "Can the AI lesson planner see what students have already learned?",
    answer: "Yes. When generating a lesson plan for a class, the AI automatically pulls three types of historical data: (1) Coverage logs from the last 4 weeks to avoid repeating topics, (2) Student gap analysis to target areas needing remediation, and (3) Observation proficiency summaries (TP1/TP2/TP3) from the last 30 days to adapt lesson difficulty. This means every new lesson plan builds on what the class has already covered.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Academic",
  },
  {
    question: "Can I record observations for previous dates?",
    answer: "Yes. When creating an observation, use the date picker to select any past date. The Subject dropdown will automatically show the timetable subjects for that specific date, so you can accurately link the observation to the correct lesson slot — even if you're recording it days later.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Students",
  },
  {
    question: "How do real-time notification badges work?",
    answer: "Unread message counts appear as red badges on sidebar items (Parent Inbox for staff, Chat with School for parents) and update instantly when new messages arrive. The notification bell in the header also shows alerts for messages, announcements, billing, and other events. Both parents and staff see the same badge system.",
    roles: ["super_admin", "franchisee", "admin", "teacher", "parent"],
    category: "Communication",
  },
  {
    question: "What teaching methodologies does Sprouts support?",
    answer: "Sprouts supports multiple pedagogical frameworks including KSPK (default), Montessori, Reggio Emilia, Waldorf, and custom frameworks. When generating lesson plans, the AI adapts all activities to follow the selected methodology's principles. Branch managers can configure the preferred methodology in curriculum settings.",
    roles: ["super_admin", "franchisee", "admin", "teacher"],
    category: "Academic",
  },
];

const categoryIcons: Record<string, React.ElementType> = {
  General: HelpCircle,
  Students: GraduationCap,
  Billing: DollarSign,
  HR: Briefcase,
  Communication: MessageSquare,
  Parent: Star,
  Administration: Shield,
  Academic: BookOpen,
};

export default function HelpCenter() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [activeStep, setActiveStep] = useState<Record<string, number>>({});

  const userRole = role as AppRole | null;

  // Filter content by role
  const filteredSections = walkthroughSections.filter(
    (s) => !userRole || s.roles.includes(userRole)
  );

  const filteredFaqs = faqItems.filter(
    (f) => !userRole || f.roles.includes(userRole)
  );

  // Search filtering
  const searchLower = search.toLowerCase();
  const searchedSections = search
    ? filteredSections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchLower) ||
          s.description.toLowerCase().includes(searchLower) ||
          s.steps.some(
            (st) =>
              st.title.toLowerCase().includes(searchLower) ||
              st.description.toLowerCase().includes(searchLower)
          )
      )
    : filteredSections;

  const searchedFaqs = search
    ? filteredFaqs.filter(
        (f) =>
          f.question.toLowerCase().includes(searchLower) ||
          f.answer.toLowerCase().includes(searchLower)
      )
    : filteredFaqs;

  const faqCategories = [...new Set(searchedFaqs.map((f) => f.category))];

  const getStepIndex = (sectionId: string) => activeStep[sectionId] ?? 0;

  const setStepIndex = (sectionId: string, index: number) => {
    setActiveStep((prev) => ({ ...prev, [sectionId]: index }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
          <p className="text-muted-foreground text-lg">
            Guides, walkthroughs, and answers to common questions
          </p>
          {userRole && (
            <Badge variant="secondary" className="text-xs">
              Showing guides for: {getRoleLabel(userRole)}
            </Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-lg mx-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search guides and FAQs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="walkthrough" className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="walkthrough">
              <Play className="mr-1.5 h-4 w-4" />
              Walkthrough Guide
            </TabsTrigger>
            <TabsTrigger value="faq">
              <HelpCircle className="mr-1.5 h-4 w-4" />
              FAQ
            </TabsTrigger>
          </TabsList>

          {/* ── WALKTHROUGH TAB ── */}
          <TabsContent value="walkthrough" className="space-y-6">
            {searchedSections.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>No guides found matching your search.</p>
                </CardContent>
              </Card>
            ) : (
              searchedSections.map((section) => {
                const currentStep = getStepIndex(section.id);
                const step = section.steps[currentStep];
                return (
                  <Card key={section.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <section.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{section.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {section.description}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {section.steps.length} steps
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Step indicators */}
                      <div className="flex gap-1.5">
                        {section.steps.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setStepIndex(section.id, i)}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              i === currentStep
                                ? "bg-primary"
                                : i < currentStep
                                ? "bg-primary/30"
                                : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Current step content */}
                      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                            {currentStep + 1}
                          </span>
                          <h3 className="font-semibold">{step.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed pl-8">
                          {step.description}
                        </p>
                        {step.tip && (
                          <div className="flex items-start gap-2 pl-8 mt-2">
                            <Lightbulb className="h-4 w-4 shrink-0 text-warning0 mt-0.5" />
                            <p className="text-xs text-muted-foreground italic">
                              {step.tip}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Navigation */}
                      <div className="flex justify-between items-center pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentStep === 0}
                          onClick={() => setStepIndex(section.id, currentStep - 1)}
                        >
                          ← Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Step {currentStep + 1} of {section.steps.length}
                        </span>
                        {currentStep < section.steps.length - 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStepIndex(section.id, currentStep + 1)}
                          >
                            Next <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-accent">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Complete
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ── FAQ TAB ── */}
          <TabsContent value="faq" className="space-y-6">
            {faqCategories.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>No FAQs found matching your search.</p>
                </CardContent>
              </Card>
            ) : (
              faqCategories.map((category) => {
                const Icon = categoryIcons[category] || HelpCircle;
                const items = searchedFaqs.filter((f) => f.category === category);
                return (
                  <Card key={category}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">{category}</CardTitle>
                        <Badge variant="secondary" className="text-[10px] ml-auto">
                          {items.length} {items.length === 1 ? "question" : "questions"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="multiple" className="w-full">
                        {items.map((faq, i) => (
                          <AccordionItem
                            key={i}
                            value={`${category}-${i}`}
                            className="border-b-0"
                          >
                            <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-3">
                              {faq.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                              {faq.answer}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
