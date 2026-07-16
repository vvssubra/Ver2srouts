// Centralized class age-ascending sort used across the app.
// Order: Nursery 1 → Nursery 2 → Playhouse 1 → Playhouse 2 → Kindergarten 1 → Kindergarten 2 → others (alpha).

const NAME_ORDER: { keys: string[]; rank: number }[] = [
  { keys: ["nursery 1", "nursery1", "n1"], rank: 0 },
  { keys: ["nursery 2", "nursery2", "n2"], rank: 1 },
  { keys: ["playhouse 1", "playhouse1", "ph1"], rank: 2 },
  { keys: ["playhouse 2", "playhouse2", "ph2"], rank: 3 },
  { keys: ["kindergarten 1", "kindergarten1", "k1"], rank: 4 },
  { keys: ["kindergarten 2", "kindergarten2", "k2"], rank: 5 },
];

// Age-group rank used as a secondary key (e.g. "3 Tahun" → 3).
function ageGroupRank(ageGroup?: string | null): number {
  if (!ageGroup) return 99;
  const m = ageGroup.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

export function classSortKey(name: string | null | undefined, ageGroup?: string | null): number {
  const lower = (name ?? "").toLowerCase();
  for (const entry of NAME_ORDER) {
    if (entry.keys.some(k => lower.includes(k))) return entry.rank;
  }
  // Fallback: use age group rank shifted past known names
  return 10 + ageGroupRank(ageGroup);
}

export function compareClasses<T extends { class_name?: string | null; age_group?: string | null }>(a: T, b: T): number {
  const ka = classSortKey(a.class_name, a.age_group);
  const kb = classSortKey(b.class_name, b.age_group);
  if (ka !== kb) return ka - kb;
  return (a.class_name ?? "").localeCompare(b.class_name ?? "");
}