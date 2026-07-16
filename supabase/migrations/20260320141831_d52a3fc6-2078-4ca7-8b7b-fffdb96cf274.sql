
-- 1. Fee package versions (immutable rate history)
CREATE TABLE public.fee_package_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_package_id UUID NOT NULL REFERENCES fee_packages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  change_reason TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fee_package_id, version_number)
);

-- 2. Student billing profiles
CREATE TABLE public.student_billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_profile_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES student_billing_profiles(id) ON DELETE CASCADE,
  fee_package_id UUID NOT NULL REFERENCES fee_packages(id),
  fee_version_id UUID REFERENCES fee_package_versions(id),
  discount_amount NUMERIC DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  discount_reason TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Pricing audit log
CREATE TABLE public.pricing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  actor_name TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Seed version 1 from existing active packages
INSERT INTO fee_package_versions (fee_package_id, version_number, amount, effective_from, change_reason)
SELECT id, 1, amount, created_at::date, 'Initial rate (migrated)'
FROM fee_packages WHERE is_active = true;

-- 5. Auto-close previous version trigger
CREATE OR REPLACE FUNCTION public.close_previous_fee_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE fee_package_versions
  SET effective_until = NEW.effective_from - INTERVAL '1 day'
  WHERE fee_package_id = NEW.fee_package_id
    AND id != NEW.id
    AND effective_until IS NULL;

  UPDATE fee_packages SET amount = NEW.amount
  WHERE id = NEW.fee_package_id;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_close_previous_fee_version
  AFTER INSERT ON fee_package_versions
  FOR EACH ROW EXECUTE FUNCTION close_previous_fee_version();

-- 6. RLS
ALTER TABLE fee_package_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_profile_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_audit_log ENABLE ROW LEVEL SECURITY;

-- Fee package versions: branch members can read
CREATE POLICY "Branch members read versions"
  ON fee_package_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM fee_packages fp
    JOIN branch_memberships bm ON bm.branch_id = fp.branch_id
    WHERE fp.id = fee_package_versions.fee_package_id AND bm.user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Fee package versions: managers can insert
CREATE POLICY "Managers insert versions"
  ON fee_package_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM fee_packages fp
    WHERE fp.id = fee_package_versions.fee_package_id
      AND is_branch_manager(auth.uid(), fp.branch_id)
  ) OR is_super_admin(auth.uid()));

-- Student billing profiles: branch members read
CREATE POLICY "Branch members read billing profiles"
  ON student_billing_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM branch_memberships bm
    WHERE bm.branch_id = student_billing_profiles.branch_id AND bm.user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Student billing profiles: managers write
CREATE POLICY "Managers manage billing profiles"
  ON student_billing_profiles FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));

-- Billing profile items: branch members read via profile
CREATE POLICY "Branch members read profile items"
  ON billing_profile_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM student_billing_profiles sbp
    JOIN branch_memberships bm ON bm.branch_id = sbp.branch_id
    WHERE sbp.id = billing_profile_items.profile_id AND bm.user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Billing profile items: managers write via profile
CREATE POLICY "Managers manage profile items"
  ON billing_profile_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM student_billing_profiles sbp
    WHERE sbp.id = billing_profile_items.profile_id
      AND (is_branch_manager(auth.uid(), sbp.branch_id) OR is_super_admin(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM student_billing_profiles sbp
    WHERE sbp.id = billing_profile_items.profile_id
      AND (is_branch_manager(auth.uid(), sbp.branch_id) OR is_super_admin(auth.uid()))
  ));

-- Pricing audit log: branch members read
CREATE POLICY "Branch members read pricing audit"
  ON pricing_audit_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM branch_memberships bm
    WHERE bm.branch_id = pricing_audit_log.branch_id AND bm.user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Pricing audit log: managers insert
CREATE POLICY "Managers insert pricing audit"
  ON pricing_audit_log FOR INSERT TO authenticated
  WITH CHECK (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));
