## Goal

Make **Attendance** the single source of truth. Every day, every staff row resolves to exactly one status via a shared resolver, and Payroll / Leave / OT / HR Calendar all consume the same numbers.

## Root cause of today's bug (screenshot: 4 Clocked In + 6 Not Clocked In)

`StaffAttendance.tsx` computes `absent = branchStaffList.length - present`. That denominator is *every* branch membership — it does not subtract:
- resigned / terminated / archived staff
- future hires (start date after today)
- weekly off-days per staff schedule
- public holidays / paid closures (partially handled — zeros out only if the whole date is a holiday)
- staff on approved leave

So "Not Clocked In" balloons with people who were never expected. The same wrong denominator feeds `StaffAttendanceWidget` on the dashboard.

## Plan

### 1. New shared resolver: `src/lib/attendance/expected-staff.ts`

Single function `resolveExpectedStaff({ branchId, date })` returning, per staff:

```
{ userId, name, status, source }
status ∈ 'resigned' | 'terminated' | 'future' | 'off_day'
       | 'public_holiday' | 'on_leave' | 'present' | 'late' | 'completed' | 'absent'
```

Priority order (first match wins), matching the spec:

```
resigned/terminated → future → weekly off → public holiday
  → approved leave → clock in/out record → absent
```

Inputs it queries once per call (batched):
- `branch_memberships` + `staff_profiles` (employment_status, start_date, last_working_date, exclude_from_payroll, work_schedule JSONB)
- `user_roles` (drop parent-only)
- `school_holidays` + `branch_events` via existing `isStaffPaidClosure` + `getBranchAcademicYearIds`
- `leave_requests` where status='approved' and date in [start,end]
- `staff_attendance` for the date

Derived counters:
```
expected      = active − off − holiday − leave
clocked_in    = records with clock_in
still_working = clock_in && !clock_out
completed     = clock_in && clock_out
not_clocked_in= expected − clocked_in   // never negative
```

### 2. Wire consumers to the resolver

- **`src/components/attendance/StaffAttendanceWidget.tsx`** (dashboard cards) — replace direct `branch_memberships` count with `resolveExpectedStaff`. Cards become Expected / Clocked In / Still Working / Not Clocked In.
- **`src/pages/StaffAttendance.tsx`** — Daily View KPIs + table use the resolver. Show a chip per row for Off Day / Holiday / Leave / Absent / Working / Completed, and hide "Not Clocked In" rows that are actually excused (still visible under a filter toggle "Show excused").
- **Monthly Summary / Hours Audit tabs** — same resolver iterated per day so Present/Absent/Late/Holiday columns match Payroll.

### 3. Payroll alignment (`src/pages/Payroll.tsx`)

Payroll already computes `absentDays`, `unpaidLeave`, `otHours`, `publicHolidays` independently. Refactor its per-day loop to call `resolveExpectedStaff` (batched over the month) so:
- Absent = only days where resolver returns `absent`
- Public holiday days never become absent
- Leave days route to the leave line (Unpaid Leave line only for `unpaid` leave type)
- Resigned staff only counted up to `last_working_date` (already done — keep)
- Intern Mon-Fri (already done — moves into resolver's work-schedule step)

OT ingest is already automatic via `pending_payroll` + `assigned_next_payroll` — no change, but resolver marks OT-approved days so the pre-payroll validator can flag conflicts.

### 4. Pre-payroll validation panel

New `src/components/payroll/AttendanceValidator.tsx` shown above "Generate Payroll". Runs resolver for the month and lists conflicts:
- present + on leave same day
- absent on public holiday
- clock-in after `last_working_date`
- work day with neither clock-in nor leave (soft warning per staff)

HR clicks each row to jump to the offending record. Payroll generation is not blocked — just surfaced.

### 5. HR Calendar & Leave

- HR Calendar consumes the same holiday/closure list the resolver uses (already via `school-holidays-scope`) — no logic change, just confirm shared helper.
- Leave Management shows a "Attendance impact" preview when approving leave (calls resolver for the affected days). No schema change.

### 6. Tests

`src/lib/attendance/__tests__/expected-staff.test.ts` covering:
- resigned before date → excluded
- future hire → excluded
- weekly off day → excluded
- public holiday → not absent
- approved leave (annual/medical/unpaid/birthday) → not absent
- clock-in only → still_working; both → completed; late threshold → late
- expected == clocked_in + not_clocked_in invariant

### 7. Out of scope (intentionally)

- No schema migrations. All required fields (`employment_status`, `last_working_date`, `work_schedule`, `exclude_from_payroll`, leave tables, holiday tables) already exist.
- No change to clock-in UX, geofence, selfie, or OT approval flow.
- No change to existing Payroll formulas (SOCSO/EPF/PCB) — only which day counts feed them.

## Technical notes

- Resolver returns a plain array + memoized summary; wrap in a `useExpectedStaff(branchId, date)` React Query hook with 30s refetch (matches current widget cadence) and realtime invalidation on `staff_attendance`, `leave_requests`, `school_holidays`, `branch_events`, `staff_profiles`.
- Weekly off-day source: `staff_profiles.work_schedule` JSONB (already used by payroll; see `mem://tech/work-schedule-lookup-logic`). Fallback: intern → Mon-Fri; else Mon-Sat with Sun off (matches existing 0.5-day Saturday rule).
- All queries scoped by `branchId` via existing RLS + `getBranchAcademicYearIds` to avoid cross-branch fan-out (matches `mem://features/hr/school-holidays-and-events`).
- No touching auto-generated Supabase files; no new secrets; no edge functions.
