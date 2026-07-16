ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS kanban_note text;
COMMENT ON COLUMN public.leads.kanban_note IS 'Short kanban card note (<=50 words). Editable only by super_admin from the UI.';