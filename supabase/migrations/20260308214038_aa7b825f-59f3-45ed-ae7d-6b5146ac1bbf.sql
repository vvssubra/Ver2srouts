
-- Add class_names to branch_settings
ALTER TABLE public.branch_settings ADD COLUMN class_names TEXT[] DEFAULT '{}';

-- Extend students table with profile fields
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS race TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS birth_cert_no TEXT,
  ADD COLUMN IF NOT EXISTS mykid_no TEXT,
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS father_ic TEXT,
  ADD COLUMN IF NOT EXISTS father_phone TEXT,
  ADD COLUMN IF NOT EXISTS father_occupation TEXT,
  ADD COLUMN IF NOT EXISTS mother_name TEXT,
  ADD COLUMN IF NOT EXISTS mother_ic TEXT,
  ADD COLUMN IF NOT EXISTS mother_phone TEXT,
  ADD COLUMN IF NOT EXISTS mother_occupation TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;
