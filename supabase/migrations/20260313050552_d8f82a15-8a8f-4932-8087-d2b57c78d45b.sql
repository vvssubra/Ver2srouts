
-- Add reports_to column to staff_profiles
ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.profiles(id);

-- Trigger: notify super_admins when a new user signs up (no role)
CREATE OR REPLACE FUNCTION public.notify_new_user_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, action_url)
  SELECT ur.user_id, 'New User Registration',
    'A new user (' || NEW.email || ') has registered and needs a role assignment.',
    'user_registration', '/users'
  FROM public.user_roles ur WHERE ur.role = 'super_admin';
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_profile_notify_admins
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_user_signup();

-- Add RLS policies for admin role on staff_claims
CREATE POLICY "Admins can view branch claims"
ON public.staff_claims FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Admins can update branch claims"
ON public.staff_claims FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));

-- Add RLS policies for admin role on overtime_requests
CREATE POLICY "Admins can view branch overtime requests"
ON public.overtime_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Admins can update branch overtime requests"
ON public.overtime_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));
