
-- Onboarding form fields (admin-managed custom questions)
CREATE TABLE public.onboarding_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('staff', 'parent')),
  step_label text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'textarea', 'select', 'checkbox', 'date', 'file')),
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Onboarding form responses (user answers)
CREATE TABLE public.onboarding_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  field_id uuid REFERENCES public.onboarding_form_fields(id) ON DELETE CASCADE NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, field_id)
);

-- Enable RLS
ALTER TABLE public.onboarding_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_form_responses ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger for fields
CREATE TRIGGER update_onboarding_form_fields_updated_at
  BEFORE UPDATE ON public.onboarding_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for onboarding_form_fields
-- Super admins can do everything
CREATE POLICY "Super admins manage all form fields"
  ON public.onboarding_form_fields FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Branch managers can manage their branch fields
CREATE POLICY "Branch managers manage own branch form fields"
  ON public.onboarding_form_fields FOR ALL
  TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

-- All branch members can read active fields (for onboarding wizards)
CREATE POLICY "Branch members can read active form fields"
  ON public.onboarding_form_fields FOR SELECT
  TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) AND is_active = true);

-- RLS for onboarding_form_responses
-- Users can insert/update their own responses
CREATE POLICY "Users manage own responses"
  ON public.onboarding_form_responses FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Branch managers can view responses for their branch fields
CREATE POLICY "Branch managers view responses"
  ON public.onboarding_form_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_form_fields f
      WHERE f.id = field_id
        AND public.is_branch_manager(auth.uid(), f.branch_id)
    )
  );

-- Super admins can view all responses
CREATE POLICY "Super admins view all responses"
  ON public.onboarding_form_responses FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));
