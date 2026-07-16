ALTER TABLE public.attendance REPLICA IDENTITY FULL;
ALTER TABLE public.child_updates REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.child_updates;