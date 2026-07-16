ALTER TABLE public.lesson_plans
ADD CONSTRAINT lesson_plans_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id);