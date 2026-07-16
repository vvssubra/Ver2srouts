-- Migrate development_outcomes data into yearly_outcomes
-- Map age_profiles.age_group to age_groups.id
INSERT INTO yearly_outcomes (outcome_code, outcome_title, outcome_description, age_group_id, domain_id, mastery_expectation)
SELECT 
  do2.outcome_code,
  do2.outcome_title,
  do2.outcome_description,
  ag.id as age_group_id,
  do2.domain_id,
  NULL as mastery_expectation
FROM development_outcomes do2
JOIN age_profiles ap ON do2.age_profile_id = ap.id
JOIN age_groups ag ON ag.min_age_months = ap.age_group * 12
WHERE NOT EXISTS (
  SELECT 1 FROM yearly_outcomes yo 
  WHERE yo.outcome_code = do2.outcome_code 
    AND yo.domain_id = do2.domain_id
)
ON CONFLICT DO NOTHING;