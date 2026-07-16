
-- Fix trigger function: parent_students uses parent_id not parent_user_id
CREATE OR REPLACE FUNCTION public.auto_create_payer_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _parent_profile RECORD;
  _student RECORD;
  _existing_id UUID;
BEGIN
  SELECT id, email, first_name, last_name, phone 
  INTO _parent_profile FROM profiles WHERE id = NEW.parent_id;
  
  SELECT branch_id INTO _student FROM students WHERE id = NEW.student_id;
  
  IF _student.branch_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT id INTO _existing_id FROM payer_accounts
  WHERE primary_parent_id = NEW.parent_id 
    AND branch_id = _student.branch_id;
  
  IF _existing_id IS NULL THEN
    INSERT INTO payer_accounts (
      branch_id, primary_parent_id, name, email, phone
    ) VALUES (
      _student.branch_id, NEW.parent_id,
      COALESCE(_parent_profile.first_name || ' ' || _parent_profile.last_name, 'Parent'),
      _parent_profile.email, _parent_profile.phone
    );
  END IF;
  RETURN NEW;
END; $$;
