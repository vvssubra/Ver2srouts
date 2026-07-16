ALTER TABLE public.transactions ADD COLUMN status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.transactions ADD COLUMN requested_by uuid;
ALTER TABLE public.transactions ADD COLUMN pending_data jsonb;