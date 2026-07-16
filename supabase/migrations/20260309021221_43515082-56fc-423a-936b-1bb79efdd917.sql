
-- Add can_manage_library to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_library boolean NOT NULL DEFAULT false;

-- Add description to worksheets
ALTER TABLE public.worksheets ADD COLUMN IF NOT EXISTS description text;

-- RLS: only super_admin can update can_manage_library on profiles
-- The existing profiles update policies should cover this, but let's add a specific one
CREATE POLICY "Only super admins update can_manage_library"
ON public.profiles
FOR UPDATE
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));
