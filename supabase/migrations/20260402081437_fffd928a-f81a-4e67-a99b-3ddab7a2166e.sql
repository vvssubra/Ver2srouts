UPDATE lesson_plans SET year_plan_id = NULL WHERE year_plan_id IS NOT NULL;
DELETE FROM curriculum_week_plans;
DELETE FROM curriculum_month_plans;
DELETE FROM curriculum_year_plans;