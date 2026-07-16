
-- Collection metadata per invoice
CREATE TABLE public.invoice_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  collection_status text NOT NULL DEFAULT 'none',
  collection_owner_id uuid,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  contact_method text,
  promise_to_pay_date date,
  promise_to_pay_amount numeric DEFAULT 0,
  broken_promise_count integer DEFAULT 0,
  written_off_at timestamptz,
  written_off_amount numeric DEFAULT 0,
  write_off_reason text,
  write_off_approval_id uuid,
  recovery_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(invoice_id)
);

-- Collection activity notes timeline
CREATE TABLE public.collection_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  contact_method text,
  promise_date date,
  promise_amount numeric,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoice_collections
CREATE POLICY "Super admins manage all collections"
ON public.invoice_collections FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers manage collections"
ON public.invoice_collections FOR ALL
TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

-- RLS policies for collection_notes
CREATE POLICY "Super admins manage all collection notes"
ON public.collection_notes FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers manage collection notes"
ON public.collection_notes FOR ALL
TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

-- Add updated_at trigger for invoice_collections
CREATE TRIGGER set_updated_at_invoice_collections
  BEFORE UPDATE ON public.invoice_collections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add write_off_recovery audit action and collection-related entries to constants
-- (handled in application code, not DB enums)
