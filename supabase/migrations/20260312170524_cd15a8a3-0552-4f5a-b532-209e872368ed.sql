ALTER TABLE lesson_plans ADD COLUMN start_date date;
ALTER TABLE lesson_plans ADD COLUMN completion_status text NOT NULL DEFAULT 'draft';
ALTER TABLE lesson_plans ADD COLUMN completed_at timestamptz;
ALTER TABLE lesson_plans ADD COLUMN class_id uuid REFERENCES classes(id);