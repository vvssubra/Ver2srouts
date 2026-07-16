
CREATE TABLE public.fee_breakdown_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_package_id uuid REFERENCES public.fee_packages(id) ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,
  amount numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.fee_breakdown_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fee breakdown items"
  ON public.fee_breakdown_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fee_packages fp
      JOIN public.branch_memberships bm ON bm.branch_id = fp.branch_id
      WHERE fp.id = fee_breakdown_items.fee_package_id AND bm.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Branch managers can manage fee breakdown items"
  ON public.fee_breakdown_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fee_packages fp
      WHERE fp.id = fee_breakdown_items.fee_package_id
        AND public.is_branch_manager(auth.uid(), fp.branch_id)
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fee_packages fp
      WHERE fp.id = fee_breakdown_items.fee_package_id
        AND public.is_branch_manager(auth.uid(), fp.branch_id)
    )
    OR public.is_super_admin(auth.uid())
  );
