# Sprout — Lesson Planner, Observations & Timetable Architecture

> Generated for external review. Last updated: 2026-03-12
>
> **Addendum 2026-06-02 — Structure & Performance Audit (Phase 3 backlog).** See the section at the bottom of this file.

---

## Appendix Z — Structure & Performance Audit Backlog (2026-06-02)

Findings from the post-Taska-rollout review. Each item is tagged P0 (do next), P1 (next batch), P2 (later).

### Bundle & Startup
- **P0** `src/App.tsx` registers 175+ pages as eager imports. Convert non-critical routes (everything outside `/auth`, `/dashboard`, `/parent-*`) to `React.lazy()` with a `<Suspense fallback={<PageLoader/>}>`. Estimated ~40–60% reduction in initial JS payload.
- **P0** `src/components/DashboardLayout.tsx` is 1198 lines and recomputes the entire role nav tree on every render. Split into:
  - `nav/role-nav-config.ts` (data only)
  - `nav/SidebarHeader.tsx`, `nav/SidebarFooter.tsx`, `nav/SidebarNavTree.tsx`
  - `nav/useUnreadCounts.ts` (extract the React Query + realtime block)
- **P1** Drop the `refetchInterval: 10000` on the sidebar unread badge query — realtime subscriptions already exist for the same tables; polling is redundant and burns DB I/O.

### Query Layer
- **P0** Hot pages using `.select("*")` (audit and narrow): `Dashboard.tsx`, `Students.tsx`, `StaffManagement.tsx`, `BillingReportsTab.tsx`, `Payroll.tsx`, `AccountingTransactions.tsx`.
- **P1** Add explicit `.limit()` or pagination where rows can exceed 1000 (default Supabase cap): `students`, `payments`, `transactions`, `child_updates`, `student_observations`.
- **P1** Standardize `staleTime: 30_000` on rarely-mutating queries (branches, classes, age_groups, profiles) — currently each tab switch refetches.
- **P2** Introduce a `useQueries` block in `Dashboard.tsx`, `BranchDetail.tsx`, `StaffDetail.tsx` (each currently fires 8–15 sequential `useQuery` calls).

### Realtime Subscriptions
- **P1** Consolidate per-page `.channel(...)` subscriptions into a shared `useRealtimeInvalidator(table, queryKey)` hook so only one socket per table is open app-wide. Today: sidebar opens 5 channels, every list page opens its own → can exceed Supabase concurrent-channel quota on busy users.

### Components & Rendering
- **P1** Recharts components in `Dashboard.tsx`, `Analytics.tsx`, `RoyaltyDashboard.tsx`, `FinanceKPIDashboard.tsx`, `BranchFinancials.tsx` re-render on every parent state change. Wrap with `React.memo` and memoize the data array with `useMemo`.
- **P2** Tab containers (`Tabs` from shadcn) mount all panels eagerly in some pages — switch to `forceMount={undefined}` so inactive tabs unmount their tree.

### Navigation / IA
- **P1** Sidebar dead-ends: items filtered by `allowedRoutes` still render their parent group with an empty list for some role + access-group combos. Hide groups whose filtered `items` is empty (logic already exists for sub-groups; extend to top-level).
- **P2** IA simplification proposal (5 groups max, review before implementation): **Academic** (Curriculum, Planners, Observations, PTM) · **Operations** (Attendance, Timetable, Compliance, eForms) · **People** (Students, Staff, Parents, Communications) · **Finance** (Billing, Payroll, Accounting, Reports) · **Settings**.

### PWA / Assets
- **P2** `public/sw.js` currently uses cache-first for everything → stale HTML on deploy. Switch to network-first for `index.html` and `*.html`, stale-while-revalidate for icons/fonts, cache-first for hashed JS/CSS.
- **P2** Lovable Assets: large hero/role images should be served via the CDN pointer pattern (`*.asset.json`) rather than bundled into `src/assets/`.

### Data Integrity Watch-list
- **P1** `program_type` (Taska/Preschool) was added 2026-06-02 to `classes` + `students` with an auto-sync trigger from class → student. Verify no edge function bypasses the trigger when inserting students directly.
- **P2** Age 1 / Age 2 yearly outcomes & theme bank are empty by design — wire an empty-state CTA pointing to Data Migration Hub once the user uploads KSPK Taska / PERMATA content.

### Sequencing recommendation
1. **Now** — P0 bundle/lazy-loading + `DashboardLayout` split (largest UX win).
2. **Next batch** — P0 `.select("*")` cleanup + P1 query staleTimes + realtime consolidation.
3. **Later** — P2 IA refresh and PWA cache strategy after we agree on the proposed group structure.

## 1. System Overview

Sprout is a multi-tenant SaaS platform for preschool franchises. Three interconnected modules form its pedagogical engine:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PEDAGOGICAL ENGINE                          │
│                                                                    │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐ │
│  │  TIMETABLE   │───▶│  LESSON PLANNER  │◀──▶│  OBSERVATIONS     │ │
│  │  (Schedule)  │    │  (AI Generation) │    │  (Assessment)     │ │
│  └──────┬───────┘    └────────┬─────────┘    └────────┬──────────┘ │
│         │                     │                       │            │
│         └─────────┬───────────┘                       │            │
│                   ▼                                   │            │
│         ┌─────────────────┐                           │            │
│         │ COVERAGE LOGS   │◀──────────────────────────┘            │
│         │ GAP ANALYSIS    │                                        │
│         │ (AI Memory)     │                                        │
│         └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### 2.1 Core Tables

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| `classes` | Branch-scoped class records | `id`, `branch_id`, `class_name`, `age_group`, `is_active` | → `branches` |
| `students` | Student records | `id`, `branch_id`, `class_id`, `class_name`, `first_name`, `last_name`, `current_methodology` | → `branches`, → `classes` |
| `timetable_slots` | Weekly template (master schedule) | `id`, `class_id`, `day_of_week` (1-5), `start_time`, `end_time`, `subject_name`, `event_name`, `event_description`, `event_agenda` (JSONB), `is_parallel_group`, `parallel_group_label` | → `classes` |
| `daily_timetable_slots` | Date-specific schedule instances | `id`, `class_id`, `branch_id`, `slot_date`, `start_time`, `end_time`, `subject_name`, `source_slot_id`, `is_modified`, `event_name`, `event_description`, `event_agenda`, `is_parallel_group`, `parallel_group_label` | → `classes`, → `timetable_slots` |
| `lesson_plans` | Saved lesson plans | `id`, `user_id`, `branch_id`, `class_id`, `title`, `theme`, `age_group`, `plan_data` (JSONB), `plan_mode` (ai_theme/ai_subject/ai_enrichment/manual), `status` (draft/in_progress/completed), `week_start_date` | → `branches`, → `classes` |
| `slot_lesson_plans` | AI-generated single activities linked to timetable slots | `id`, `slot_id`, `slot_date`, `generated_activity` (JSONB), `mapped_learning_area`, `mapped_standards` (JSONB) | → `timetable_slots` |
| `observations` | Teacher observations of students | `id`, `student_id`, `branch_id`, `observed_by`, `observation_text`, `proficiency_level` (TP1/TP2/TP3), `learning_area_id`, `standard_id`, `is_shared_with_parent`, `timetable_slot_id`, `evidence_urls` (JSONB), `tags` | → `students`, → `learning_areas`, → `curriculum_standards`, → `timetable_slots` |
| `class_coverage_logs` | Tracks which KP2026 standards have been covered | `id`, `branch_id`, `class_id`, `subject_name`, `standard_code`, `week_starting`, `lesson_plan_id` | → `branches`, → `classes` |
| `student_gap_analysis` | Individual student learning gaps | `id`, `student_id`, `gap_subject`, `missing_standard_codes` (JSONB), `remediation_status` (pending/in-progress/resolved) | → `students` |
| `subject_standard_map` | Maps traditional subjects to KP2026 learning areas | `id`, `subject_name`, `learning_area_id`, `learning_area_code` | → `learning_areas` |

### 2.2 Curriculum Reference Tables

| Table | Purpose |
|-------|---------|
| `learning_areas` | KP2026 Tunjang (Learning Strands) — 6 areas with BM/EN names |
| `curriculum_standards` | Hierarchical KP2026 standards (fokus → standard → sub_standard) with codes |
| `competencies` | Cross-cutting competencies with sub-competencies (JSONB) |
| `academic_years` | Term structure (4 terms × ~11 weeks) |

### 2.3 Assessment & Methodology Tables

| Table | Purpose |
|-------|---------|
| `baseline_assessments` | Initial student assessment scores (motor, language, cognitive, socio-emotional) with AI learning style detection |
| `methodology_recommendations` | AI-generated methodology suggestions with accept/reject workflow |

---

## 3. Timetable Module

### 3.1 Architecture

```
┌─────────────────────────────────────────────────┐
│            TimetableManagement.tsx (648 lines)    │
│                                                  │
│  Tabs: [Weekly Template] [Monthly Calendar]      │
│                                                  │
│  ┌────────────────────────┐                      │
│  │ Weekly Template Grid   │ ← timetable_slots    │
│  │ Mon-Fri, 8:00-18:00   │                      │
│  │ 30-min cells           │                      │
│  │ Click to assign subject│                      │
│  │ Parallel group support │                      │
│  │ Event/Activity slots   │                      │
│  └────────────────────────┘                      │
│                                                  │
│  ┌────────────────────────┐                      │
│  │ Monthly Calendar View  │ ← daily_timetable    │
│  │ (MonthlyTimetableView) │    _slots             │
│  │ Bulk publish template  │                      │
│  │ Skip MY holidays       │                      │
│  │ Date-specific edits    │                      │
│  └────────────────────────┘                      │
└─────────────────────────────────────────────────┘
```

### 3.2 Key Features

- **Dual-layer design**: Weekly Template (master) → Monthly Calendar (date-specific instances)
- **Time grid**: 8:00 AM – 6:00 PM, 30-min slots, with enrichment zone separator at 12:30
- **14 academic subjects** + 10 enrichment subjects + non-teaching (Assembly, Break, Event)
- **Parallel groups**: Moral / Mandarin / Islamic Studies share same time slot
- **Events**: Multi-slot spanning with agenda builder (JSONB `event_agenda`)
- **Bulk publish**: Template → Month, auto-skips Malaysian school holidays
- **Subject color coding**: Each subject has light/dark mode color variants
- **Lesson plan indicator**: Slots with linked `slot_lesson_plans` show visual markers

### 3.3 Data Flow

```
Weekly Template (timetable_slots)
       │
       │ Bulk Publish
       ▼
Monthly Calendar (daily_timetable_slots)
       │
       │ Generate Lesson
       ▼
Slot Lesson Plans (slot_lesson_plans)
       │
       │ Auto-log
       ▼
Coverage Logs (class_coverage_logs)
```

---

## 4. Lesson Planner Module

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                LessonPlanner.tsx (1,882 lines)                   │
│                                                                  │
│  ViewModes: [Create] [My Plans Library] [Shared With Me]        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ CREATE MODE                                                  │ │
│  │                                                              │ │
│  │ Step 1: Select Class (→ auto-fills age_group)               │ │
│  │ Step 2: Choose Plan Type:                                    │ │
│  │   • Full Theme Plan (ai_theme)                              │ │
│  │   • Subject Weekly Plan (ai_subject)                        │ │
│  │   • Enrichment Plan (ai_enrichment)                         │ │
│  │   • Manual (no AI)                                          │ │
│  │ Step 3: Enter theme, select subject (if applicable)         │ │
│  │ Step 4: Optional Tunjang override                           │ │
│  │ Step 5: Generate → AI produces structured lesson plan       │ │
│  │                                                              │ │
│  │ ┌──────────────────────┐  ┌──────────────────────┐          │ │
│  │ │ Generated Plan View  │  │ Side Panel            │          │ │
│  │ │ • Day-by-day cards   │  │ • AI Chat (PlanChat)  │          │ │
│  │ │ • Activity editors   │  │ • Worksheet matches   │          │ │
│  │ │ • Drag-and-drop sort │  │ • Coverage gaps       │          │ │
│  │ │ • Completion toggle  │  │ • Gap interventions   │          │ │
│  │ │ • Teacher reflection │  │                       │          │ │
│  │ └──────────────────────┘  └──────────────────────┘          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │ MY PLANS LIBRARY (SavedPlans.tsx)                 │           │
│  │ • Filter by status, class                        │           │
│  │ • Quick actions: edit, delete, share, print      │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │ SHARED WITH ME (SharedWithMe.tsx)                 │           │
│  │ • Plans shared by colleagues                     │           │
│  │ • Accept/view/fork shared plans                  │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Plan Modes

| Mode | Edge Function | Description |
|------|--------------|-------------|
| `ai_theme` | `generate-lesson-plan` | Full 5-day theme plan with all activities, assessment checklist, parent snippet |
| `ai_subject` | `generate-weekly-subject-plan` | Week of lessons for one subject; merges consecutive slots into 60-min activities |
| `ai_enrichment` | `generate-lesson-plan` | Creative/life skills focused (Arts, Cooking, STEM, etc.) |
| `manual` | None | Teacher fills template form manually |

### 4.3 AI Generation Pipeline

```
Teacher Input (theme, class, subject)
       │
       ├──▶ Fetch class coverage logs (last 30 days)
       ├──▶ Fetch student gap analysis (active gaps)
       ├──▶ Fetch student observation proficiency (TP1-TP3, last 30 days)
       ├──▶ Fetch curriculum standards (KP2026 via subject_standard_map)
       ├──▶ Fetch timetable slots (daily_timetable_slots for the week)
       │
       ▼
┌─────────────────────────────────────┐
│ Lovable AI Gateway (Gemini/GPT)     │
│                                     │
│ Prompt includes:                    │
│ • Curriculum standards context      │
│ • Already-covered standards (avoid) │
│ • Student gaps (target remediation) │
│ • Proficiency distribution          │
│ • NAEYC DAP + Reggio Emilia        │
│ • Structured output schema          │
│                                     │
│ Output:                             │
│ • 5-day plan with activities        │
│ • Standards addressed per activity  │
│ • Differentiation (support/advance) │
│ • Provocation questions             │
│ • Observation cues                  │
│ • Gap intervention suggestions      │
│ • Parent connection snippet         │
│ • Assessment checklist              │
└─────────────────────────────────────┘
       │
       ▼
Save to lesson_plans + Auto-log coverage
```

### 4.4 Structured Activity Format

Each AI-generated activity follows this pedagogical template:

```json
{
  "name": "Counting Garden Flowers",
  "name_ms": "Mengira Bunga Taman",
  "duration_minutes": 30,
  "learning_area": "ST – Sains & Teknologi",
  "standards_addressed": ["ST.2.1.1", "ST.2.1.2"],
  "description": "...",
  "materials": ["Counting blocks", "Flower cutouts"],
  "procedure": {
    "introduction": { "text": "...", "duration": "5 min" },
    "activity": { "text": "...", "duration": "20 min" },
    "conclusion": { "text": "...", "duration": "5 min" }
  },
  "differentiation_strategies": {
    "support_needed": "Use physical manipulatives for 1-5 counting",
    "advanced_challenge": "Extend to addition with sets of flowers"
  },
  "provocation_questions": ["What happens if we add more?"],
  "observation_cues": "Watch for one-to-one correspondence accuracy",
  "teacher_notes": "Prepare flower cutouts in 3 colors"
}
```

### 4.5 Supporting Components

| Component | File | Purpose |
|-----------|------|---------|
| `ActivityEditor.tsx` | Inline activity editing with procedure phases |
| `SortableActivityCard.tsx` | Drag-and-drop activity reordering (dnd-kit) |
| `PlanChat.tsx` | AI chat panel for refining plans (`refine-lesson-plan` edge function) |
| `SavedPlans.tsx` | Plan library with filters and actions |
| `SharedWithMe.tsx` | Shared plan viewer |
| `SharePlanDialog.tsx` | Share plan with colleagues |
| `PlanPrintView.tsx` | Print-optimized plan layout |
| `BroadcastToParentsDialog.tsx` | Send parent connection snippet to parents |
| `WeeklyTimetable.tsx` | Inline timetable preview in planner |

### 4.6 Edge Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `generate-lesson-plan` | Create tab → Generate | Full theme/enrichment plan generation |
| `generate-weekly-subject-plan` | Subject mode → Generate | Subject-specific weekly plan with slot merging |
| `generate-slot-lesson` | Dashboard/Timetable → Generate Lesson | Single activity for a specific timetable slot |
| `refine-lesson-plan` | PlanChat | Iterative AI refinement of existing plan |
| `generate-yearly-plan` | Yearly Planner | 42-week theme progression |

---

## 5. Observations Module

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Observations.tsx (225 lines)                 │
│                                                          │
│  ┌────────────────────┐  ┌─────────────────────────────┐│
│  │ Observation List    │  │ AddObservationDialog.tsx     ││
│  │ • Filter by area   │  │ (661 lines)                  ││
│  │ • Filter by class  │  │                              ││
│  │ • Proficiency badge │  │ Fields:                     ││
│  │   (TP1/TP2/TP3)    │  │ • Student selector           ││
│  │ • Evidence photos   │  │ • Learning area/standard    ││
│  │ • Shared-with-      │  │ • Proficiency (TP1/2/3)    ││
│  │   parent indicator  │  │ • Observation text          ││
│  │                     │  │ • Evidence upload (photos)  ││
│  └────────────────────┘  │ • AI tag suggestions        ││
│                          │ • Class + Subject context    ││
│                          │ • Timetable slot link        ││
│                          │ • Share with parent toggle   ││
│                          └─────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 5.2 Key Features

- **KP2026-aligned**: Observations tagged to specific learning areas and curriculum standards
- **3-level proficiency**: TP1 (Beginning), TP2 (Developing), TP3 (Proficient)
- **Context linking**: Optional class + today's subject dropdown auto-links `timetable_slot_id`
- **AI tag suggestions**: `suggest-observation-tags` edge function analyzes observation text
- **Evidence upload**: Multiple photos via `observation-evidence` storage bucket
- **Parent sharing**: Toggle to make observation visible in parent portal
- **Teacher class scoping**: Teachers only see students in their assigned classes

### 5.3 Data Flow to AI Memory

```
Teacher records observation
       │
       ├──▶ observation record (proficiency, standard, student)
       │
       ▼
AI Lesson Planner fetches:
  • Proficiency distribution (TP1/2/3 counts per standard)
  • Recent observations (last 30 days)
  • Identifies gaps → student_gap_analysis
       │
       ▼
Adapts lesson plan:
  • Targets low-proficiency standards
  • Adds differentiation for TP1 students
  • Suggests advanced challenges for TP3
```

### 5.4 Parent-Facing: Daily Learning Journey

```
┌─────────────────────────────────────────┐
│ ParentDailyJourney.tsx                   │
│                                          │
│ ← Previous Day  [March 12]  Next Day → │
│                                          │
│ 📸 Photo Gallery (all evidence photos)  │
│                                          │
│ Timeline:                                │
│ ┌─────────────────────────────────────┐ │
│ │ 9:00 AM — Maths                     │ │
│ │ "Counting with blocks — showed      │ │
│ │  strong 1-to-1 correspondence"      │ │
│ │ Proficiency: [TP3]                  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 10:30 AM — Science Explorer         │ │
│ │ "Explored plant growth; asked       │ │
│ │  excellent questions about roots"   │ │
│ │ Proficiency: [TP2]                  │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ 🌟 Highlights: 3 activities today       │
└─────────────────────────────────────────┘
```

### 5.5 Student Progress Tracking

| Component | File | Purpose |
|-----------|------|---------|
| `StudentProgress.tsx` | Per-student progress dashboard with radar charts |
| `ProgressRadarChart.tsx` | Radar chart of proficiency across learning areas |
| `PtmReportTab.tsx` | AI-generated Parent-Teacher Meeting reports |
| `WatchdogAlert.tsx` | Alerts for students with declining proficiency |

---

## 6. Cross-Module Integration Points

### 6.1 Timetable → Lesson Planner

- Lesson plans are **date-aware**: linked to specific `daily_timetable_slots`
- Subject Weekly Plan mode fetches timetable to determine which days have the selected subject
- Consecutive 30-min slots for the same subject are merged into 60-min activities
- Monthly calendar shows lesson plan indicators on slots

### 6.2 Lesson Planner → Coverage Logs

- After saving a plan, covered standards are auto-logged to `class_coverage_logs`
- Next plan generation retrieves last 30 days of logs to **avoid repetition**
- Coverage gaps are surfaced as alerts in the planner UI

### 6.3 Observations → AI Memory

- Student proficiency levels (TP1-TP3) feed into plan generation prompts
- Active learning gaps from `student_gap_analysis` trigger remediation suggestions
- The AI generates student-specific `gap_interventions` with scaffolding activities

### 6.4 Lesson Planner → Parent Communication

- `parent_connection_snippet` generated by AI for each plan
- Broadcastable to parents via in-app notification or email
- Links to ParentDailyJourney for observation context

### 6.5 Yearly Planner → Weekly Plans

- 42-week theme progression (`yearly_plans` table)
- Auto-populates theme in lesson planner based on current date
- 4-term academic year structure (Weeks 1-11, 12-22, 23-32, 33-42)

---

## 7. Edge Function Architecture

```
┌─────────────────────────────────────────────────────────┐
│                EDGE FUNCTIONS                            │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ generate-lesson-plan│  │ generate-weekly-subject-  │ │
│  │ (theme/enrichment)  │  │ plan (subject weekly)     │ │
│  └────────┬────────────┘  └──────────┬────────────────┘ │
│           │                          │                   │
│           │  ┌───────────────────┐   │                   │
│           └─▶│ Lovable AI Gateway│◀──┘                   │
│              │ (Gemini/GPT)      │                       │
│              └───────────────────┘                       │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ generate-slot-lesson│  │ refine-lesson-plan        │ │
│  │ (single activity)   │  │ (iterative AI chat)       │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ suggest-observation-│  │ generate-ptm-report       │ │
│  │ tags (NLP tagging)  │  │ (AI progress report)      │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ assess-methodology  │  │ generate-yearly-plan      │ │
│  │ (enrollment AI)     │  │ (42-week themes)          │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                          │
│  ┌─────────────────────┐  ┌───────────────────────────┐ │
│  │ parse-curriculum-   │  │ generate-learning-story   │ │
│  │ document (RAG)      │  │ (parent-facing narrative) │ │
│  └─────────────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Security & Access Control

### 8.1 Role-Based Access

| Role | Timetable | Lesson Planner | Observations |
|------|-----------|----------------|--------------|
| `super_admin` | Full CRUD | Full CRUD + all branches | Full CRUD + all branches |
| `franchisee` | Full CRUD | Full CRUD (own branch) | Full CRUD (own branch) |
| `admin` | Full CRUD | Full CRUD (own branch) | Full CRUD (own branch) |
| `teacher` | View only | CRUD (own classes) | CRUD (own classes) |
| `parent` | View child's schedule | No access | View shared observations |

### 8.2 Teacher Class Scoping

Teachers are scoped to their assigned classes via `branch_memberships.assigned_class_ids`:
- If `assigned_class_ids` is empty → access to **all** classes in branch
- If populated → access restricted to listed class IDs only
- Enforced via `get_teacher_class_ids()` SQL function + client-side filtering

### 8.3 RLS Policies

All tables use Row-Level Security with these patterns:
- **Branch membership check**: `is_member_of_branch(auth.uid(), branch_id)`
- **Manager check**: `is_branch_manager(auth.uid(), branch_id)` for write operations
- **Student-to-branch lookup**: `is_student_in_user_branch(auth.uid(), student_id)`
- **Super admin bypass**: `is_super_admin(auth.uid())`

---

## 9. File Inventory

### 9.1 Frontend Components

| File | Lines | Module |
|------|-------|--------|
| `src/pages/LessonPlanner.tsx` | 1,882 | Lesson Planner |
| `src/pages/TimetableManagement.tsx` | 648 | Timetable |
| `src/components/AddObservationDialog.tsx` | 661 | Observations |
| `src/pages/Observations.tsx` | 225 | Observations |
| `src/components/MonthlyTimetableView.tsx` | ~350 | Timetable |
| `src/components/WeeklyTimetable.tsx` | ~200 | Timetable |
| `src/components/ActivityEditor.tsx` | ~300 | Lesson Planner |
| `src/components/SortableActivityCard.tsx` | ~150 | Lesson Planner |
| `src/components/PlanChat.tsx` | ~200 | Lesson Planner |
| `src/components/SavedPlans.tsx` | ~250 | Lesson Planner |
| `src/components/SharedWithMe.tsx` | ~150 | Lesson Planner |
| `src/components/SharePlanDialog.tsx` | ~100 | Lesson Planner |
| `src/components/PlanPrintView.tsx` | ~200 | Lesson Planner |
| `src/components/BroadcastToParentsDialog.tsx` | ~150 | Lesson Planner |
| `src/components/ParentDailyJourney.tsx` | ~300 | Parent Portal |
| `src/pages/StudentProgress.tsx` | ~400 | Progress Tracking |
| `src/pages/EnrollmentAssessments.tsx` | ~600 | Assessment |
| `src/pages/YearlyPlanner.tsx` | ~400 | Yearly Planning |

### 9.2 Edge Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `generate-lesson-plan/index.ts` | ~200 | Full theme/enrichment plan |
| `generate-weekly-subject-plan/index.ts` | ~250 | Subject weekly plan |
| `generate-slot-lesson/index.ts` | ~180 | Single slot activity |
| `refine-lesson-plan/index.ts` | ~120 | Plan refinement chat |
| `suggest-observation-tags/index.ts` | ~80 | Observation NLP tagging |
| `generate-ptm-report/index.ts` | ~150 | PTM report generation |
| `assess-methodology/index.ts` | ~200 | Enrollment methodology AI |
| `generate-yearly-plan/index.ts` | ~150 | 42-week theme plan |
| `parse-curriculum-document/index.ts` | ~200 | RAG curriculum parsing |
| `generate-learning-story/index.ts` | ~120 | Parent learning narratives |

### 9.3 Custom Hooks

| Hook | Purpose |
|------|---------|
| `use-teacher-classes.ts` | Resolves teacher's assigned class IDs with branch fallback |

---

## 10. Known Architecture Considerations

### 10.1 Strengths
- **Stateful AI memory**: Coverage logs + gap analysis create a genuine pedagogical feedback loop
- **Dual-layer timetable**: Weekly template + daily instances allow flexibility without losing structure
- **KP2026 alignment**: All modules reference the same curriculum standard hierarchy
- **Role-scoped access**: Teachers only see their assigned classes; parents only see shared data
- **Multi-mode planning**: Theme, Subject, Enrichment, and Manual modes cover all planning needs

### 10.2 Areas for Review
- **LessonPlanner.tsx (1,882 lines)**: Monolithic component; could be decomposed into sub-components (CreateMode, SubjectMode, PlanViewer)
- **Inline color strings in TimetableManagement.tsx**: Subject colors use Tailwind literals rather than design tokens
- **Client-side class filtering**: Teacher scoping is enforced client-side after fetching all data; could be pushed to RLS/SQL for efficiency
- **Coverage log deduplication**: No unique constraint prevents duplicate coverage entries for the same standard/week
- **Slot merging logic**: Lives in edge function; no client-side preview of merged slots before generation
- **Plan data as JSONB**: `lesson_plans.plan_data` stores the full plan as JSONB; makes querying individual activities harder

---

*End of architecture document.*
