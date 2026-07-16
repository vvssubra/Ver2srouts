
-- 1. parent_students: relation + primary flag + provenance
ALTER TABLE public.parent_students
  ADD COLUMN IF NOT EXISTS relation text NOT NULL DEFAULT 'guardian'
    CHECK (relation IN ('mother','father','guardian','other')),
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'access_code'
    CHECK (created_via IN ('auto_provision','invite','access_code','manual'));

-- 2. profiles: address + onboarding marker
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 3. parent_onboarding_state
CREATE TABLE IF NOT EXISTS public.parent_onboarding_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  password_changed_at timestamptz,
  profile_completed_at timestamptz,
  tnc_accepted_at timestamptz,
  tnc_version text,
  handbook_accepted_at timestamptz,
  handbook_document_id uuid,
  handbook_version text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE ON public.parent_onboarding_state TO authenticated;
GRANT ALL ON public.parent_onboarding_state TO service_role;
ALTER TABLE public.parent_onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parent reads own onboarding state"
  ON public.parent_onboarding_state FOR SELECT TO authenticated
  USING (parent_id = auth.uid());
CREATE POLICY "Parent updates own onboarding state"
  ON public.parent_onboarding_state FOR UPDATE TO authenticated
  USING (parent_id = auth.uid()) WITH CHECK (parent_id = auth.uid());
CREATE POLICY "Branch staff manage onboarding state"
  ON public.parent_onboarding_state FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_parent_onboarding_state_updated_at
  BEFORE UPDATE ON public.parent_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-complete trigger: when all 4 steps done, set completed_at
CREATE OR REPLACE FUNCTION public.parent_onboarding_check_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.password_changed_at IS NOT NULL
     AND NEW.profile_completed_at IS NOT NULL
     AND NEW.tnc_accepted_at IS NOT NULL
     AND NEW.handbook_accepted_at IS NOT NULL
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
    UPDATE public.profiles
      SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
      WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_parent_onboarding_check_complete
  BEFORE INSERT OR UPDATE ON public.parent_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.parent_onboarding_check_complete();

-- 4. school_documents
CREATE TABLE IF NOT EXISTS public.school_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN
    ('handbook','annual_planner','fees','policy','forms','newsletter','other')),
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_name text,
  file_size_bytes bigint,
  mime_type text,
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  is_required_for_onboarding boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_documents TO authenticated;
GRANT ALL ON public.school_documents TO service_role;
ALTER TABLE public.school_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view active school documents"
  ON public.school_documents FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(auth.uid(), branch_id)
    OR (
      is_active = true
      AND EXISTS (
        SELECT 1 FROM public.parent_students ps
        JOIN public.students s ON s.id = ps.student_id
        WHERE ps.parent_id = auth.uid()
          AND ps.status = 'approved'
          AND s.branch_id = school_documents.branch_id
      )
    )
  );
CREATE POLICY "Branch staff manage school documents"
  ON public.school_documents FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_school_documents_updated_at
  BEFORE UPDATE ON public.school_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_school_documents_branch_category
  ON public.school_documents (branch_id, category, display_order);

-- 5. tnc_versions + acceptances
CREATE TABLE IF NOT EXISTS public.tnc_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  version text NOT NULL,
  title text NOT NULL DEFAULT 'Terms & Conditions',
  content_md text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tnc_versions TO authenticated;
GRANT ALL ON public.tnc_versions TO service_role;
ALTER TABLE public.tnc_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read active T&C"
  ON public.tnc_versions FOR SELECT TO authenticated
  USING (is_active = true OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins manage T&C"
  ON public.tnc_versions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_tnc_versions_updated_at
  BEFORE UPDATE ON public.tnc_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a default global T&C if none exists
INSERT INTO public.tnc_versions (branch_id, version, title, content_md, is_active)
SELECT NULL, '1.0', 'Sprouts Parent Terms & Conditions',
  E'## Welcome to Sprouts\n\nBy using this app you agree to:\n\n1. Treat school staff, other parents, and children with respect in all communications.\n2. Keep your login credentials private.\n3. Allow the school to share your child''s daily learning moments, photos, and progress with you securely.\n4. Pay fees on time as per the school''s billing policy.\n5. Notify the school promptly of any changes to contact details, medical information, or pickup arrangements.\n\nYour data is encrypted and never shared with third parties. You may withdraw any optional consent at any time from your profile.',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.tnc_versions WHERE is_active = true);

-- 6. can_parent_access_app helper
CREATE OR REPLACE FUNCTION public.can_parent_access_app(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_onboarding_state
    WHERE parent_id = _user_id AND completed_at IS NOT NULL
  )
$$;

-- 7. Backfill: existing parents are grandfathered in (completed) so we don't lock anyone out
INSERT INTO public.parent_onboarding_state (
  parent_id, branch_id,
  password_changed_at, profile_completed_at, tnc_accepted_at, handbook_accepted_at, completed_at
)
SELECT DISTINCT ps.parent_id, s.branch_id,
  now(), now(), now(), now(), now()
FROM public.parent_students ps
JOIN public.students s ON s.id = ps.student_id
WHERE ps.status = 'approved'
ON CONFLICT (parent_id, branch_id) DO NOTHING;
