
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS event_name text;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS event_description text;
ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS event_agenda jsonb DEFAULT '[]';
