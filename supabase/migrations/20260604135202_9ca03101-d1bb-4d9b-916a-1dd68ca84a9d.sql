GRANT SELECT, INSERT, UPDATE ON public.parent_onboarding_state TO authenticated;
GRANT ALL ON public.parent_onboarding_state TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parent_onboarding_state'
      AND policyname = 'Parent creates own onboarding state'
  ) THEN
    CREATE POLICY "Parent creates own onboarding state"
      ON public.parent_onboarding_state
      FOR INSERT
      TO authenticated
      WITH CHECK (
        parent_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.parent_students ps
          JOIN public.students s ON s.id = ps.student_id
          WHERE ps.parent_id = auth.uid()
            AND ps.status = 'approved'
            AND s.branch_id = parent_onboarding_state.branch_id
        )
      );
  END IF;
END $$;