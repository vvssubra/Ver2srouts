
CREATE TABLE IF NOT EXISTS public.school_document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.school_documents(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL,
  document_version text NOT NULL,
  acknowledgement_text text NOT NULL DEFAULT 'I confirm that I have read and understood this school document.',
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, parent_id, document_version)
);

GRANT SELECT, INSERT ON public.school_document_acknowledgements TO authenticated;
GRANT ALL ON public.school_document_acknowledgements TO service_role;

ALTER TABLE public.school_document_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sda_document ON public.school_document_acknowledgements(document_id);
CREATE INDEX IF NOT EXISTS idx_sda_parent ON public.school_document_acknowledgements(parent_id);

-- Parents may insert their own acknowledgement, only for documents in a branch
-- where they have an approved child.
CREATE POLICY "Parents insert own acknowledgement"
ON public.school_document_acknowledgements
FOR INSERT
TO authenticated
WITH CHECK (
  parent_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.school_documents d
    JOIN public.parent_students ps ON ps.status = 'approved' AND ps.parent_id = auth.uid()
    JOIN public.students s ON s.id = ps.student_id AND s.branch_id = d.branch_id
    WHERE d.id = document_id
  )
);

-- Parents may view their own acknowledgements.
CREATE POLICY "Parents read own acknowledgement"
ON public.school_document_acknowledgements
FOR SELECT
TO authenticated
USING (parent_id = auth.uid());

-- Staff in the document's branch may view all acknowledgements for tracking.
CREATE POLICY "Branch staff read acknowledgements"
ON public.school_document_acknowledgements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.school_documents d
    JOIN public.branch_memberships bm ON bm.branch_id = d.branch_id AND bm.user_id = auth.uid()
    WHERE d.id = document_id
  )
  OR public.has_role(auth.uid(), 'super_admin')
);
