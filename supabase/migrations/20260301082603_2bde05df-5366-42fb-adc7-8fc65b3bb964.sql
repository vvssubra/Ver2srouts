
-- =============================================
-- Module D: HR Management - Foundation Schema
-- =============================================

-- 1. Leave type enum
CREATE TYPE public.leave_type AS ENUM ('annual', 'medical', 'maternity', 'paternity', 'unpaid', 'emergency');

-- 2. Leave request status enum
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- 3. Staff Attendance (clock-in/out)
CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamp with time zone,
  clock_out timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Staff can view own attendance
CREATE POLICY "Staff can view own attendance"
  ON public.staff_attendance FOR SELECT
  USING (auth.uid() = user_id);

-- Staff can insert own clock-in
CREATE POLICY "Staff can clock in"
  ON public.staff_attendance FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_member_of_branch(auth.uid(), branch_id));

-- Staff can update own attendance (clock-out)
CREATE POLICY "Staff can clock out"
  ON public.staff_attendance FOR UPDATE
  USING (auth.uid() = user_id);

-- Branch members (franchisees) can view branch attendance
CREATE POLICY "Franchisees can view branch staff attendance"
  ON public.staff_attendance FOR SELECT
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- Super admins full access
CREATE POLICY "Super admins manage staff attendance"
  ON public.staff_attendance FOR ALL
  USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_staff_attendance_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Leave Balances (entitlements per staff per year)
CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  annual_total integer NOT NULL DEFAULT 8,
  annual_used integer NOT NULL DEFAULT 0,
  medical_total integer NOT NULL DEFAULT 14,
  medical_used integer NOT NULL DEFAULT 0,
  maternity_total integer NOT NULL DEFAULT 60,
  maternity_used integer NOT NULL DEFAULT 0,
  paternity_total integer NOT NULL DEFAULT 7,
  paternity_used integer NOT NULL DEFAULT 0,
  emergency_total integer NOT NULL DEFAULT 2,
  emergency_used integer NOT NULL DEFAULT 0,
  unpaid_used integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- Staff view own balances
CREATE POLICY "Staff can view own leave balances"
  ON public.leave_balances FOR SELECT
  USING (auth.uid() = user_id);

-- Franchisees can view and manage branch leave balances
CREATE POLICY "Franchisees can view branch leave balances"
  ON public.leave_balances FOR SELECT
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees can manage branch leave balances"
  ON public.leave_balances FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- Super admins full access
CREATE POLICY "Super admins manage leave balances"
  ON public.leave_balances FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Leave Requests
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days integer NOT NULL DEFAULT 1,
  reason text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Staff can view own leave requests
CREATE POLICY "Staff can view own leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Staff can create leave requests
CREATE POLICY "Staff can create leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_member_of_branch(auth.uid(), branch_id));

-- Staff can cancel own pending requests
CREATE POLICY "Staff can update own leave requests"
  ON public.leave_requests FOR UPDATE
  USING (auth.uid() = user_id);

-- Franchisees can view and manage branch leave requests
CREATE POLICY "Franchisees can view branch leave requests"
  ON public.leave_requests FOR SELECT
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees can update branch leave requests"
  ON public.leave_requests FOR UPDATE
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- Super admins full access
CREATE POLICY "Super admins manage leave requests"
  ON public.leave_requests FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
