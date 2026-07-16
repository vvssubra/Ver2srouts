ALTER TABLE public.curriculum_objective_indicators
  DROP CONSTRAINT IF EXISTS curriculum_objective_indicators_obj_label_key;
ALTER TABLE public.curriculum_objective_indicators
  ADD CONSTRAINT curriculum_objective_indicators_obj_label_key
  UNIQUE (objective_id, indicator_label);