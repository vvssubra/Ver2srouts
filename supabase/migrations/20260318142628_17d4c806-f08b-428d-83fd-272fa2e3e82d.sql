
DROP POLICY "Franchisees manage payments" ON public.payments;
CREATE POLICY "Branch managers manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND is_branch_manager(auth.uid(), i.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = payments.invoice_id
        AND is_branch_manager(auth.uid(), i.branch_id)
    )
  );
