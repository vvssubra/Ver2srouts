
-- Cost per student: total expenses / active students for a branch in a given month
CREATE OR REPLACE FUNCTION public.calc_cost_per_student(
  _branch_id uuid, _month int, _year int
) RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(amount) FROM public.expenses
     WHERE branch_id = _branch_id
       AND EXTRACT(MONTH FROM date) = _month
       AND EXTRACT(YEAR FROM date) = _year)
    /
    NULLIF((SELECT COUNT(*) FROM public.students
     WHERE branch_id = _branch_id AND is_active = true), 0),
    0
  );
$$;

-- Royalty calculation: 8% of paid invoices for a branch in a given month
CREATE OR REPLACE FUNCTION public.calc_royalty_due(
  _branch_id uuid, _month int, _year int
) RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(total_amount) * 0.08,
    0
  )
  FROM public.invoices
  WHERE branch_id = _branch_id
    AND status = 'paid'
    AND billing_month = _month
    AND billing_year = _year;
$$;
