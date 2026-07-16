
-- Add work schedule and overtime rate columns to staff_profiles
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS work_start_time time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS work_days jsonb DEFAULT '[1,2,3,4,5]',
  ADD COLUMN IF NOT EXISTS overtime_rate numeric DEFAULT 0;

-- Create overtime_requests table
CREATE TABLE public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  date date NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  review_notes text,
  auto_detected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- RLS: Staff can insert own OT requests (with branch membership check)
CREATE POLICY "Staff insert own OT requests"
ON public.overtime_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND is_member_of_branch(auth.uid(), branch_id));

-- RLS: Staff can view own OT requests
CREATE POLICY "Staff view own OT requests"
ON public.overtime_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS: Staff can update own OT requests only if pending
CREATE POLICY "Staff update own pending OT requests"
ON public.overtime_requests FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending');

-- RLS: Franchisees can view branch OT requests
CREATE POLICY "Franchisees view branch OT requests"
ON public.overtime_requests FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- RLS: Franchisees can update branch OT requests
CREATE POLICY "Franchisees update branch OT requests"
ON public.overtime_requests FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- RLS: Super admins manage all OT requests
CREATE POLICY "Super admins manage OT requests"
ON public.overtime_requests FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

-- RLS: Allow franchisees to update staff_attendance for editing
CREATE POLICY "Franchisees can update branch staff attendance"
ON public.staff_attendance FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

-- RLS: Allow franchisees to insert staff_attendance for adding missing records
CREATE POLICY "Franchisees can insert branch staff attendance"
ON public.staff_attendance FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));
