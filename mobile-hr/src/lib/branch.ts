/**
 * v1 simplifying assumption: a staff member may in principle belong to more
 * than one branch, but this app only operates against a single "primary"
 * branch for them — multi-branch staff are out of scope for this phase.
 *
 * Callers MUST order the `branch_memberships` query deterministically
 * (`.order("created_at", { ascending: true })`) before passing rows here.
 * Postgres/PostgREST does not guarantee row order without an explicit
 * `ORDER BY`, so without it, which branch "wins" here could vary between
 * screens or between refreshes for the same multi-branch staff member —
 * showing contradictory branch-scoped data (geofence location, custom
 * leave types, etc.) for the same person at the same moment.
 */
export function resolveBranchId(memberships: { branch_id: string }[]): string | null {
  return memberships[0]?.branch_id ?? null;
}
