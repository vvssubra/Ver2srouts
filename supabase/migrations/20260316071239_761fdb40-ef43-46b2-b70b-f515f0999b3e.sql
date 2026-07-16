
CREATE TABLE public.carry_forward_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  from_year INTEGER NOT NULL,
  to_year INTEGER NOT NULL,
  leave_type TEXT NOT NULL,
  days_carried NUMERIC(4,1) NOT NULL DEFAULT 0,
  carried_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carry_forward_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can view carry forward logs"
ON public.carry_forward_log
FOR SELECT
TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Branch managers can insert carry forward logs"
ON public.carry_forward_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));
