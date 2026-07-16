
-- Trigger function: auto-create payer account when parent-student linked
CREATE OR REPLACE FUNCTION public.auto_create_payer_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _parent_profile RECORD;
  _student RECORD;
  _existing_id UUID;
BEGIN
  SELECT id, email, first_name, last_name, phone 
  INTO _parent_profile FROM profiles WHERE id = NEW.parent_user_id;
  
  SELECT branch_id INTO _student FROM students WHERE id = NEW.student_id;
  
  IF _student.branch_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT id INTO _existing_id FROM payer_accounts
  WHERE primary_parent_id = NEW.parent_user_id 
    AND branch_id = _student.branch_id;
  
  IF _existing_id IS NULL THEN
    INSERT INTO payer_accounts (
      branch_id, primary_parent_id, name, email, phone
    ) VALUES (
      _student.branch_id, NEW.parent_user_id,
      COALESCE(_parent_profile.first_name || ' ' || _parent_profile.last_name, 'Parent'),
      _parent_profile.email, _parent_profile.phone
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_auto_create_payer_account
  AFTER INSERT ON parent_students
  FOR EACH ROW EXECUTE FUNCTION auto_create_payer_account();
