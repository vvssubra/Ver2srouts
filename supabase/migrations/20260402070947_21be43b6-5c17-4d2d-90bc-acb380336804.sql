
ALTER TABLE public.branch_events ADD COLUMN end_date date;
ALTER TABLE public.school_holidays ADD COLUMN end_date date;
ALTER TABLE public.school_holidays ADD COLUMN event_type text DEFAULT 'public_holiday';
