
DO $$ BEGIN
  CREATE TYPE public.student_enrollment_status AS ENUM ('active','on_hold','withdrawn','graduated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_status public.student_enrollment_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_by uuid;

UPDATE public.students
  SET enrollment_status = CASE WHEN is_active THEN 'active'::public.student_enrollment_status
                               ELSE 'withdrawn'::public.student_enrollment_status END
  WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_student_is_active()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.enrollment_status IS DISTINCT FROM OLD.enrollment_status THEN
    NEW.is_active := (NEW.enrollment_status = 'active');
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());
  ELSIF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NEW.is_active AND NEW.enrollment_status <> 'active' THEN
      NEW.enrollment_status := 'active';
    ELSIF NOT NEW.is_active AND NEW.enrollment_status = 'active' THEN
      NEW.enrollment_status := 'withdrawn';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.is_active := (NEW.enrollment_status = 'active');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_student_is_active ON public.students;
CREATE TRIGGER trg_sync_student_is_active
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_student_is_active();

CREATE TABLE IF NOT EXISTS public.student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_status public.student_enrollment_status,
  to_status public.student_enrollment_status NOT NULL,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_status_history_student ON public.student_status_history(student_id, changed_at DESC);

GRANT SELECT, INSERT ON public.student_status_history TO authenticated;
GRANT ALL ON public.student_status_history TO service_role;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch staff can read history" ON public.student_status_history;
CREATE POLICY "Branch staff can read history" ON public.student_status_history
  FOR SELECT TO authenticated USING (
    public.is_student_in_user_branch(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Branch staff can insert history" ON public.student_status_history;
CREATE POLICY "Branch staff can insert history" ON public.student_status_history
  FOR INSERT TO authenticated WITH CHECK (
    public.is_student_in_user_branch(auth.uid(), student_id)
  );

ALTER TABLE public.baseline_assessments
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'post_enrollment';

CREATE INDEX IF NOT EXISTS idx_baseline_assessments_lead ON public.baseline_assessments(lead_id);
