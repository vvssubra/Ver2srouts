
-- 1. Create parent_invitations table
CREATE TABLE public.parent_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.parent_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members manage invitations"
ON public.parent_invitations FOR ALL
USING (is_member_of_branch(auth.uid(), branch_id))
WITH CHECK (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage invitations"
ON public.parent_invitations FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- 2. Create pdpa_consents table
CREATE TABLE public.pdpa_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  consent_type text NOT NULL DEFAULT 'ai_media_processing',
  is_granted boolean NOT NULL DEFAULT false,
  ip_address text,
  consented_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdpa_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents insert own consents"
ON public.pdpa_consents FOR INSERT
WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY "Parents view own consents"
ON public.pdpa_consents FOR SELECT
USING (parent_user_id = auth.uid());

CREATE POLICY "Branch members view consents"
ON public.pdpa_consents FOR SELECT
USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage consents"
ON public.pdpa_consents FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- 3. Add columns to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_access_code text UNIQUE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS emergency_contacts jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS authorized_pickups jsonb DEFAULT '[]'::jsonb;

-- 4. Add status to parent_students
ALTER TABLE public.parent_students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- 5. Trigger to auto-generate student_access_code
CREATE OR REPLACE FUNCTION public.generate_student_access_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  IF NEW.student_access_code IS NULL OR NEW.student_access_code = '' THEN
    LOOP
      new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
      BEGIN
        NEW.student_access_code := new_code;
        RETURN NEW;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts > 10 THEN
          RAISE EXCEPTION 'Could not generate unique access code';
        END IF;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = 'public';

CREATE TRIGGER trg_generate_student_access_code
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.generate_student_access_code();

-- 6. Backfill existing students with access codes
UPDATE public.students
SET student_access_code = upper(substring(md5(id::text || random()::text) from 1 for 6))
WHERE student_access_code IS NULL;

-- 7. Add RLS for parents inserting pending link requests
CREATE POLICY "Parents can request child linking"
ON public.parent_students FOR INSERT
WITH CHECK (
  parent_id = auth.uid()
  AND status = 'pending'
  AND has_role(auth.uid(), 'parent'::app_role)
);

-- 8. Add phone and preferred_language to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'ms';
