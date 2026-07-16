---
name: Parent Progress data pipeline
description: Progress wheel reads from child_update_skills + development_domains (NOT student_observations or learning_areas). 7 rings = 7 development_domains. Per-indicator skill gaps feed generate-weekly-plan AI.
type: feature
---
After the Observations→Learning Journey merge, the parent Progress tab in
`src/pages/ParentChildView.tsx` is wired to:

- **Rings**: 7 `development_domains` (CL, EL, NT, PM, SE, CD, VC) — NOT the 6 KP2026
  `learning_areas` Tunjang. The wheel must match what onboarding/baseline assess.
- **Numerator (assessed)**: distinct `indicator_id` (or fallback `indicator_label`)
  in `child_update_skills` joined to `child_updates` where `student_id` matches
  (single-student or via `child_update_students`) and `visible_to_parent = true`.
- **Denominator (total)**: `development_outcomes` count per domain, age-scoped to
  the child's `age_profiles` row (resolved by age-in-years 3..6 from date_of_birth).
- **Evidence photos**: read from `child_update_media` rows of the parent
  `child_updates` row. A new `child_update_media.update_skill_id` FK exists for
  future per-skill evidence tagging.
- **AI lesson planner (`generate-weekly-plan`)** receives two aggregates: domain
  rollup from `child_updates` (14d) AND per-indicator skill-gap rollup from
  `child_update_skills` (28d). Do not feed `student_observations` — it is no
  longer written by `NewUpdateSheet`.

Do NOT reintroduce queries against `student_observations`, `student_observation_evidence`,
`curriculum_standards`, or `learning_areas` on the Progress wheel — those tables
belong to the deprecated taxonomy and are not populated by the merged flow.