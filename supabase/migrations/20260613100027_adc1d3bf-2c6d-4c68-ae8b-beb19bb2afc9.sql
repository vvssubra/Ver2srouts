-- Create progress-engine rollup view (Batch 6D-Verify, Part C)
-- Aggregates child_skill_progress by student × domain so AI and dashboards
-- can read current progress without the legacy student_observations pipeline.

CREATE OR REPLACE VIEW public.v_child_progress_domain_rollup
WITH (security_invoker = true) AS
SELECT
  csp.student_id,
  csp.domain_id,
  dd.code           AS domain_code,
  dd.name           AS domain_name,
  COUNT(*)                                                  AS observed_skill_count,
  COALESCE(SUM(csp.evidence_count), 0)::int                 AS evidence_count,
  SUM(CASE WHEN csp.current_status IN ('secure','consistent') THEN 1 ELSE 0 END)::int AS secure_count,
  SUM(CASE WHEN csp.current_status = 'developing' THEN 1 ELSE 0 END)::int             AS developing_count,
  SUM(CASE WHEN csp.current_status = 'emerging'   THEN 1 ELSE 0 END)::int             AS emerging_count,
  SUM(CASE WHEN csp.current_status = 'not_yet'    THEN 1 ELSE 0 END)::int             AS not_yet_count,
  MAX(csp.last_observed_at)                                 AS last_observed_at,
  ROUND(AVG(
    CASE csp.current_status
      WHEN 'not_yet' THEN 0
      WHEN 'emerging' THEN 1
      WHEN 'developing' THEN 2
      WHEN 'consistent' THEN 3
      WHEN 'secure' THEN 3
      ELSE 0
    END
  )::numeric, 2)                                            AS average_status_score
FROM public.child_skill_progress csp
LEFT JOIN public.development_domains dd ON dd.id = csp.domain_id
GROUP BY csp.student_id, csp.domain_id, dd.code, dd.name;

GRANT SELECT ON public.v_child_progress_domain_rollup TO authenticated;
GRANT ALL    ON public.v_child_progress_domain_rollup TO service_role;
